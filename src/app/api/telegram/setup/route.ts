/**
 * Telegram webhook setup/status (round 7)
 *
 * GET  → حالة الربط: هل التوكن/مفتاح Gemini مضبوطان؟ هل الويبهوك مفعّل؟
 * POST → يفعّل الويبهوك على نطاق النشر الحالي (يتطلب TELEGRAM_BOT_TOKEN
 *        + TELEGRAM_WEBHOOK_SECRET في متغيرات البيئة).
 *
 * المشرفون فقط (نفس هرمية لوحة الإدارة). البوت يجب أن يكون مشرفاً في
 * كل قناة/مجموعة مربوطة — هذا شرط تيليجرام لاستقبال منشوراتها.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canUploadContent } from "@/lib/auth/permissions";
import { getWebhookInfo, setWebhook, isBotConfigured } from "@/lib/telegram/ingest";
import { isGeminiConfigured } from "@/lib/telegram/classify";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !canUploadContent(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  const botConfigured = isBotConfigured();
  const webhook = botConfigured ? await getWebhookInfo() : null;
  return NextResponse.json({
    botConfigured,
    geminiConfigured: isGeminiConfigured(),
    webhook,
    allowedUpdates: ["channel_post", "edited_channel_post", "message", "edited_message"],
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canUploadContent(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  if (!isBotConfigured()) {
    return NextResponse.json(
      { error: "اضبط TELEGRAM_BOT_TOKEN في متغيرات البيئة على Vercel أولاً" },
      { status: 400 }
    );
  }
  // نطاق النشر الحالي — يمر عبر headers الموثوقة خلف Vercel
  const forwardedHost = req.headers.get("x-forwarded-host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const origin = forwardedHost ? `${proto}://${forwardedHost}` : req.nextUrl.origin;
  const result = await setWebhook(origin);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
  return NextResponse.json({ ok: true, message: result.message, webhookUrl: `${origin}/api/telegram/webhook` });
}
