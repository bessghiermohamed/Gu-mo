/**
 * Telegram webhook (round 7)
 *
 * Telegram POSTs every new/edited channel post (and group message)
 * here. The bot must be an admin of each connected channel/group.
 *
 * Security: Telegram sends our secret in the
 * `X-Telegram-Bot-Api-Secret-Token` header on EVERY call — we verify
 * it against TELEGRAM_WEBHOOK_SECRET, so nobody but Telegram (or
 * someone knowing the secret) can inject items.
 *
 * IMPORTANT: we always answer 200 once the secret matches, even on
 * internal errors — Telegram retries non-2xx responses aggressively
 * and would flood us otherwise. Ingest is idempotent anyway.
 */

import { NextRequest, NextResponse } from "next/server";
import { processTelegramUpdate } from "@/lib/telegram/ingest";
import type { TgUpdate } from "@/lib/telegram/types";

export const maxDuration = 60; // تصنيف Gemini قد يستغرق بضع ثوانٍ

export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "الويبهوك غير مهيأ: اضبط TELEGRAM_WEBHOOK_SECRET" }, { status: 503 });
  }
  const headerToken = req.headers.get("x-telegram-bot-api-secret-token");
  if (headerToken !== secret) {
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
