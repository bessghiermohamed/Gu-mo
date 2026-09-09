/**
 * Auto-bot activation (round 63) — «أضف البوت بنفسك بلا لوحات تحكم».
 *
 * WHY THIS MODULE EXISTS:
 *   r62 built the bot-swap card but its activation needed owner steps that
 *   were never done (Supabase SQL editor + SUPABASE_SERVICE_ROLE_KEY on
 *   Vercel + pasting the token in the admin UI). The owner asked us to add
 *   the bot ourselves ("you add it"). This sandbox cannot reach Supabase
 *   directly (DNS-blocked) and holds no service-role key — but it CAN:
 *     1. push code (GitHub → Vercel auto-deploy), and
 *     2. call the Telegram Bot API directly (the owner sent the token).
 *
 * THE TRICK — the token travels INSIDE the webhook URL:
 *   setWebhook is called with
 *     url    = <origin>/api/telegram/webhook?b=<bot token>
 *     secret = "tgk_" + sha256(token).slice(0, 40)
 *   Telegram repeats that exact URL on every update forever, so the webhook
 *   route can recover the active bot token on each call WITHOUT any DB row,
 *   env var, or dashboard visit. Nothing persistent is required.
 *
 * SECURITY (why this is sound):
 *   • Knowledge of the full URL = knowledge of the token itself — whoever
 *     holds it owns the bot outright (same trust level as before).
 *   • The secret header must equal sha256(token): only the party that
 *     called setWebhook (token holder) can make Telegram send it.
 *   • AUTO_BOT_IDS allowlist: a stranger CAN point their own bot at our
 *     public URL (domain + path are guessable, their token is theirs) —
 *     but the bot id is embedded in the token ("id:hash", Telegram
 *     validates the pair on every call), so a one-line string check
 *     rejects every bot except ours. No extra API call, no latency.
 *   • The token is never echoed in any response, never logged, never
 *     committed. Bot IDs are public identifiers — safe in code.
 *
 * PURITY: imports only node:crypto — no Next.js, unit-testable with bun.
 */

import { createHash } from "node:crypto";

/**
 * Bots allowed to self-activate via the ?b= webhook path.
 * 8635909400 = @gu_mo_bot («Talib_app») — المالك أرسل توكنه في الجولة 63.
 * أضف معرفات أخرى هنا عند تبديل البوت مستقبلاً.
 */
export const AUTO_BOT_IDS: readonly number[] = [8635909400];

/** شكل توكن تيليجرام القياسي: 123456789:AA… (35+ حرفاً بعد النقطتين) */
export const TOKEN_RE = /^\d{6,12}:[A-Za-z0-9_-]{30,60}$/;

/** يشتق سرّ الويبهوك من التوكن — حتمي، بلا حالة، طرف واحد فقط يعرفه */
export function derivedWebhookSecret(token: string): string {
  return "tgk_" + createHash("sha256").update(token, "utf8").digest("hex").slice(0, 40);
}

/** يبني رابط الويبهوك الذاتي الذي يحمل التوكن (يُضبط مرة عند setWebhook) */
export function autoWebhookUrl(token: string, origin: string): string {
  return `${origin}/api/telegram/webhook?b=${encodeURIComponent(token)}`;
}

/** يقرأ التوكن من رابط الويبهوك (?b=…) ويتحقق من شكله — أو null */
export function extractUrlToken(rawUrl: string): string | null {
  try {
    const b = new URL(rawUrl).searchParams.get("b") ?? "";
    return TOKEN_RE.test(b) ? b : null;
  } catch {
    return null;
  }
}

/**
 * معرّف البوت من التوكن نفسه (الجزء قبل النقطتين — تيليجرام يضمن تطابقه).
 * يرجّع null إن كان الشكل غير صالح — لا نداء API هنا إطلاقاً.
 */
export function botIdFromToken(token: string): number | null {
  const m = /^(\d{6,12}):/.exec(token.trim());
  return m ? Number(m[1]) : null;
}

/** هل هذا التوكن مسموح بالتفعيل الذاتي؟ (فحص نصي فوري بلا شبكة) */
export function isAutoBotToken(token: string): boolean {
  const id = botIdFromToken(token);
  return id != null && AUTO_BOT_IDS.includes(id);
}

// ------------------------------------------------------------
// Best-effort in-memory getMe cache (username للعرض فقط)
// ------------------------------------------------------------

const meCache = new Map<string, { username: string; firstName: string; at: number }>();
const ME_TTL_MS = 10 * 60_000;

/** getMe مخفّف — لأغراض العرض فقط؛ فشله لا يمنع أي شيء أبداً */
export async function autoBotUsername(
  token: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ username: string; firstName: string } | null> {
  const cached = meCache.get(token);
  if (cached && Date.now() - cached.at < ME_TTL_MS) {
    return { username: cached.username, firstName: cached.firstName };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const res = await fetchImpl(`https://api.telegram.org/bot${token}/getMe`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = (await res.json()) as {
      ok?: boolean;
      result?: { username?: string; first_name?: string };
    };
    if (!data.ok || !data.result) return null;
    const entry = {
      username: data.result.username ?? "",
      firstName: data.result.first_name ?? "",
      at: Date.now(),
    };
    meCache.set(token, entry);
    return { username: entry.username, firstName: entry.firstName };
  } catch {
    return null;
  }
}
