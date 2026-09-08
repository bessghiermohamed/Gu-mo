/**
 * Bot configuration store (round 62) — lets the owner SWAP the Telegram
 * bot from the admin UI without touching the Vercel dashboard.
 *
 * WHY: the repo is public, so a new bot token can never be committed;
 * and Vercel env vars (where the old token lives) require a dashboard
 * visit + redeploy. Instead the active token is stored in the DATABASE:
 *   - Vercel  → table `bot_config` via the SERVICE-ROLE client only.
 *     RLS has NO anon policies (unlike telegram_sources/items which hold
 *     public data), so the token is unreadable with the public anon key.
 *   - Local   → Prisma model BotConfig (SQLite).
 *
 * PRECEDENCE: the DB token WINS over TELEGRAM_BOT_TOKEN when present —
 * it is the newer, explicitly-set-in-UI value. When the row is cleared
 * the app falls back to the env var (the original round-7 behavior).
 *
 * The webhook secret follows the same duality: the webhook route accepts
 * the env secret (old bot, still registered) OR the DB secret (new bot)
 * — switching bots never breaks the already-working one.
 *
 * Every read is try/catch → env fallback: a missing table, a missing
 * SUPABASE_SERVICE_ROLE_KEY, or any DB hiccup degrades silently to the
 * round-7 behavior instead of breaking ingest.
 */

import { db } from "@/lib/db";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
const CACHE_TTL_MS = 60_000; // ثوانٍ — يكفي لتجنب قراءة قاعدة البيانات مع كل تحديث ويبهوك

export interface BotCredentials {
  token: string;
  secret: string;
  source: "db" | "env" | "none";
}

interface StoredRow {
  botToken: string;
  webhookSecret: string;
  botUsername: string;
  updatedAt: string;
}

// ------------------------------------------------------------
// Reads (with a tiny TTL cache for warm serverless instances)
// ------------------------------------------------------------

let cachedRow: { value: StoredRow | null; at: number } | null = null;

function rowFromPrisma(r: { botToken: string; webhookSecret: string; botUsername: string; updatedAt: Date } | null): StoredRow | null {
  if (!r) return null;
  return {
    botToken: r.botToken?.trim() ?? "",
    webhookSecret: r.webhookSecret?.trim() ?? "",
    botUsername: r.botUsername?.trim() ?? "",
    updatedAt: r.updatedAt?.toISOString?.() ?? "",
  };
}

async function readRow(): Promise<StoredRow | null> {
  const now = Date.now();
  if (cachedRow && now - cachedRow.at < CACHE_TTL_MS) return cachedRow.value;
  let value: StoredRow | null = null;
  try {
    if (isVercel) {
      const { createSupabaseAdminClient } = await import("@/lib/supabase/server");
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase.from("bot_config").select("bot_token, webhook_secret, bot_username, updated_at").eq("id", 1).maybeSingle();
      if (!error && data) {
        value = {
          botToken: String(data.bot_token ?? "").trim(),
          webhookSecret: String(data.webhook_secret ?? "").trim(),
          botUsername: String(data.bot_username ?? "").trim(),
          updatedAt: String(data.updated_at ?? ""),
        };
      }
    } else {
      value = rowFromPrisma(await db.botConfig.findUnique({ where: { id: 1 } }));
    }
  } catch {
    value = null; // جدول غير منشأ / مفتاح خدمة غير مضبوط → env
  }
  cachedRow = { value, at: now };
  return value;
}

function invalidate() {
  cachedRow = null;
}

/** التوكن الفعّال: قاعدة البيانات أولاً (الأحدث — عُيّن من الواجهة)، ثم Vercel */
export async function resolveBotCredentials(): Promise<BotCredentials> {
  const envToken = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const envSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "";
  const row = await readRow();
  if (row && row.botToken.length > 20) {
    return { token: row.botToken, secret: row.webhookSecret || envSecret, source: "db" };
  }
  if (envToken) return { token: envToken, secret: envSecret, source: "env" };
  return { token: "", secret: envSecret, source: "none" };
}

/** كل الأسرار المقبولة للويبهوك (بيئة + قاعدة بيانات) — تبديل البوت لا يكسر القديم */
export async function getActiveWebhookSecrets(): Promise<string[]> {
  const secrets: string[] = [];
  const envSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (envSecret) secrets.push(envSecret);
  const row = await readRow();
  if (row?.webhookSecret) secrets.push(row.webhookSecret);
  return secrets;
}

// ------------------------------------------------------------
// Writes (admin-only routes call these)
// ------------------------------------------------------------

export interface SaveResult {
  ok: boolean;
  error?: string;
  /** "no-service-key" — missing SUPABASE_SERVICE_ROLE_KEY on Vercel */
  reason?: "no-service-key" | "no-table" | "write-failed";
}

export async function saveBotConfig(input: { botToken: string; webhookSecret: string; botUsername: string }): Promise<SaveResult> {
  try {
    if (isVercel) {
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
        return { ok: false, reason: "no-service-key", error: "SUPABASE_SERVICE_ROLE_KEY غير مضبوط في Vercel — مطلوب لحفظ التوكن بأمان داخل قاعدة البيانات" };
      }
      const { createSupabaseAdminClient } = await import("@/lib/supabase/server");
      const supabase = createSupabaseAdminClient();
      const { error } = await supabase.from("bot_config").upsert(
        {
          id: 1,
          bot_token: input.botToken,
          webhook_secret: input.webhookSecret,
          bot_username: input.botUsername,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
      if (error) {
        const missing = error.message.includes("Could not find the table") || error.message.includes("relation") || error.code === "PGRST205";
        return {
          ok: false,
          reason: missing ? "no-table" : "write-failed",
          error: missing
            ? "جدول bot_config غير منشأ — نفّذ download/supabase_bot_config.sql في محرر SQL داخل Supabase (مرة واحدة)"
            : `تعذّر الحفظ: ${error.message}`,
        };
      }
    } else {
      await db.botConfig.upsert({
        where: { id: 1 },
        create: { id: 1, botToken: input.botToken, webhookSecret: input.webhookSecret, botUsername: input.botUsername },
        update: { botToken: input.botToken, webhookSecret: input.webhookSecret, botUsername: input.botUsername },
      });
    }
    invalidate();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "write-failed", error: (e as Error).message };
  }
}

export async function clearBotConfig(): Promise<SaveResult> {
  try {
    if (isVercel) {
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
        return { ok: false, reason: "no-service-key", error: "SUPABASE_SERVICE_ROLE_KEY غير مضبوط في Vercel" };
      }
      const { createSupabaseAdminClient } = await import("@/lib/supabase/server");
      const supabase = createSupabaseAdminClient();
      const { error } = await supabase.from("bot_config").delete().eq("id", 1);
      if (error) return { ok: false, reason: "write-failed", error: error.message };
    } else {
      await db.botConfig.deleteMany({ where: { id: 1 } });
    }
    invalidate();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "write-failed", error: (e as Error).message };
  }
}

// ------------------------------------------------------------
// Status (for the admin UI — NEVER echoes the token itself)
// ------------------------------------------------------------

export interface BotConfigStatus {
  envTokenConfigured: boolean;
  envSecretConfigured: boolean;
  dbTokenActive: boolean;
  dbBotUsername: string;
  dbUpdatedAt: string;
  dbTableReady: boolean;
  serviceKeyConfigured: boolean;
  isVercel: boolean;
}

export async function getBotConfigStatus(): Promise<BotConfigStatus> {
  const envTokenConfigured = (process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "").length > 20;
  const envSecretConfigured = !!(process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "");
  const serviceKeyConfigured = !isVercel || !!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  let dbTokenActive = false;
  let dbBotUsername = "";
  let dbUpdatedAt = "";
  let dbTableReady = true;

  if (isVercel && serviceKeyConfigured) {
    const row = await readRow();
    if (row) {
      dbTokenActive = row.botToken.length > 20;
      dbBotUsername = row.botUsername;
      dbUpdatedAt = row.updatedAt;
    } else {
      // ننمّي فعلياً: الصف فارغ ≠ الجدول مفقود — نميّز بمحاولة قراءة أولية
      dbTableReady = await probeTable();
    }
  } else if (!isVercel) {
    const row = await readRow();
    dbTokenActive = !!(row && row.botToken.length > 20);
    dbBotUsername = row?.botUsername ?? "";
    dbUpdatedAt = row?.updatedAt ?? "";
  } else {
    dbTableReady = false; // بلا مفتاح خدمة لا يمكننا معرفة حالة الجدول
  }

  return { envTokenConfigured, envSecretConfigured, dbTokenActive, dbBotUsername, dbUpdatedAt, dbTableReady, serviceKeyConfigured, isVercel };
}

/** تمييز «الجدول غير منشأ» عن «الصف فارغ» عبر استعلام خفيف برأس فقط */
async function probeTable(): Promise<boolean> {
  try {
    const { createSupabaseAdminClient } = await import("@/lib/supabase/server");
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("bot_config").select("id", { head: true }).limit(1);
    if (!error) return true;
    return !(error.message.includes("Could not find the table") || error.message.includes("relation") || error.code === "PGRST205");
  } catch {
    return false;
  }
}
