/**
 * Telegram file proxy (round 7)
 *
 * Renders Telegram images (TD scans, exercise sheets, lecture photos)
 * inline WITHOUT storing any file. Each request resolves the file_id
 * fresh through the Bot API (file paths expire ~1h) and streams the
 * bytes back. Only thumbnails pass through here — the canonical
 * content stays the t.me deep link.
 *
 * Public by design: the linked channels are public study material,
 * and <img> tags cannot attach session cookies. Abuse surface is a
 * bandwidth cap on already-public images (mitigated by caching).
 */

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const MAX_PROXY_BYTES = 20 * 1024 * 1024; // حد Bot API نفسه

export async function GET(req: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return NextResponse.json({ error: "توكن البوت غير مضبوط" }, { status: 503 });
  }
  const url = new URL(req.url);
  const fileId = url.searchParams.get("file_id") ?? "";
  // تحقق صارم من الصيغة — لا اجتياز مسارات ولا تمرير رموز
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) {
    return NextResponse.json({ error: "معرّف ملف غير صالح" }, { status: 400 });
  }
  const requestedMime = url.searchParams.get("mime") ?? "";

  try {
    const infoRes = await fetch(`https://api.telegram.org/bot${token}/getFile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    });
    const info = (await infoRes.json()) as { ok: boolean; result?: { file_size?: number; file_path?: string }; description?: string };
    if (!info.ok || !info.result?.file_path) {
      return NextResponse.json({ error: "الملف غير متاح في تيليجرام" }, { status: 404 });
    }
    if ((info.result.file_size ?? 0) > MAX_PROXY_BYTES) {
      return NextResponse.json({ error: "الملف أكبر من الحد المسموح" }, { status: 413 });
    }
    const fileRes = await fetch(`https://api.telegram.org/file/bot${token}/${info.result.file_path}`);
    if (!fileRes.ok || !fileRes.body) {
      return NextResponse.json({ error: "تعذّر تنزيل الملف" }, { status: 502 });
    }
    const contentType =
      requestedMime ||
      fileRes.headers.get("content-type")?.split(";")[0] ||
      "image/jpeg"; // صور تيليجرام المضغوطة JPEG دائماً
    return new NextResponse(fileRes.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "خطأ في الوكيل" }, { status: 500 });
  }
}
