/**
 * Telegram webhook (round 7, r62 bot-swap aware, r63 self-activation)
 *
 * Telegram POSTs every new/edited channel post (and group message)
 * here. The bot must be an admin of each connected channel/group.
 *
 * Security: Telegram sends our secret in the
 * `X-Telegram-Bot-Api-Secret-Token` header on EVERY call — we verify
 * it against TELEGRAM_WEBHOOK_SECRET, so nobody but Telegram (or
 * someone knowing the secret) can inject items.
 *
 * r62: the secret may ALSO live in the DB (bot_config) — that's the
 * secret generated when the owner swaps the bot from the admin UI.
 * Both are accepted so switching bots never breaks the old one.
 *
 * r63 SELF-ACTIVATION (?b=): the webhook URL itself may carry the
 * bot token (set once via /api/telegram/activate). In that case the
 * request's secret must equal sha256(token) — see lib/telegram/auto-bot.
 * The token's embedded bot id must also be allowlisted (AUTO_BOT_IDS),
 * which blocks strangers from pointing their own bots at this public
 * URL. Once verified, updates are processed WITH that token so the
 * brain replies as the right bot. As a bonus we try to persist the
 * token into bot_config (best effort, once per serverless instance)
 * so the admin UI starts showing the active bot too.
 *
 * IMPORTANT: we always answer 200 once a valid secret matches, even
 * on internal errors — Telegram retries non-2xx responses aggressively
 * and would flood us otherwise. Ingest is idempotent anyway.
 */

import { NextRequest, NextResponse } from "next/server";
import { processTelegramUpdate } from "@/lib/telegram/ingest";
import { getActiveWebhookSecrets, resolveBotCredentials, saveBotConfig } from "@/lib/telegram/bot-config";
import {
  extractUrlToken,
  derivedWebhookSecret,
  isAutoBotToken,
  autoBotUsername,
} from "@/lib/telegram/auto-bot";
import type { TgUpdate } from "@/lib/telegram/types";

export const maxDuration = 60; // تصنيف Gemini قد يستغرق بضع ثوانٍ

/** best-effort: هل حاولنا حفظ توكن البوت الذاتي في هذا المثيل؟ */
let autoConfigPersisted = false;

export async function POST(req: NextRequest) {
  // ---------- r63: مسار التفعيل الذاتي (?b=<token>) ----------
  const urlToken = extractUrlToken(req.url);
  if (urlToken) {
    if (!isAutoBotToken(urlToken)) {
      // بوت غريب وجّه نفسه إلى رابطنا — نرفض بصمت (بدون تفاصيل)
      return NextResponse.json({ ok: true, status: "ignored" });
    }
    const expected = derivedWebhookSecret(urlToken);
    if ((req.headers.get("x-telegram-bot-api-secret-token") ?? "") !== expected) {
      return NextResponse.json({ error: "رمز التحقق غير صحيح" }, { status: 401 });
    }
    // تحسين تدريجي (مرة لكل مثيل): حفظ التوكن في bot_config إن أمكن —
    // فتبدأ لوحة الإدارة بعرض البوت الفعّال دون أي خطوة إضافية من المالك
    if (!autoConfigPersisted) {
      autoConfigPersisted = true;
      try {
        const creds = await resolveBotCredentials();
        if (creds.source !== "db" || creds.token !== urlToken) {
          const me = await autoBotUsername(urlToken);
          if (me?.username) {
            await saveBotConfig({
              botToken: urlToken,
              webhookSecret: expected,
              botUsername: me.username,
            });
          }
        }
      } catch {
        // بلا service key أو بلا جدول — يعمل المسار الذاتي بدونهما أصلاً
      }
    }
    try {
      const update = (await req.json()) as TgUpdate;
      if (!update || typeof update.update_id !== "number") {
        return NextResponse.json({ ok: true });
      }
      const status = await processTelegramUpdate(update, urlToken);
      return NextResponse.json({ ok: true, status });
    } catch {
      return NextResponse.json({ ok: true, status: "ignored" });
    }
  }

  // ---------- المسار الكلاسيكي: سرّ البيئة أو سرّ قاعدة البيانات ----------
  const secrets = (await getActiveWebhookSecrets()).map((s) => s.trim()).filter(Boolean);
  if (secrets.length === 0) {
    return NextResponse.json(
      { error: "الويبهوك غير مهيأ: اضبط TELEGRAM_WEBHOOK_SECRET أو فعّل بوتاً من لوحة الإدارة" },
      { status: 503 }
    );
  }
  const headerToken = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!secrets.includes(headerToken)) {
    return NextResponse.json({ error: "رمز التحقق غير صحيح" }, { status: 401 });
  }

  try {
    const update = (await req.json()) as TgUpdate;
    if (!update || typeof update.update_id !== "number") {
      return NextResponse.json({ ok: true }); // حمولة غير مفهومة — تجاهل بأمان
    }
    const status = await processTelegramUpdate(update);
    return NextResponse.json({ ok: true, status });
  } catch {
    // أي فشل داخلي: أجب 200 حتى لا يعيد تيليجرام الإرسال بلا توقف
    return NextResponse.json({ ok: true, status: "ignored" });
  }
}

export async function GET() {
  return NextResponse.json({ error: "هذا المسار مخصص لاستدعاءات تيليجرام فقط" }, { status: 405 });
}
