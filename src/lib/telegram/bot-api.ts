/**
 * Telegram Bot API — token-parameterized REST helpers (round 62).
 *
 * WHY THIS MODULE EXISTS:
 *   - ingest.ts must resolve the ACTIVE bot token from env OR the DB
 *     (bot-config, r62) — so every Bot API call needs the token passed in.
 *   - bot-chat.ts (the bot "brain") must be unit-testable OUTSIDE Next.js
 *     (bun + patched fetch) — so it may only import pure modules like this
 *     one, never @/lib/db or @/lib/supabase/* (they pull next/headers).
 *
 * Everything here: plain fetch, no SDK, never throws (result objects),
 * same error shape the old ingest botApi used.
 */

const MAX_VISION_BYTES = 8 * 1024 * 1024;
/** حد تيليجرام للرسالة الواحدة — نرسل أقل قليلاً لهامش الأمان */
const TG_MESSAGE_LIMIT = 4000;

export interface BotApiResult<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

export async function telegramApi<T>(
  token: string,
  method: string,
  body: Record<string, unknown>,
  timeoutMs = 15_000
): Promise<BotApiResult<T>> {
  if (!token) return { ok: false, description: "TELEGRAM_BOT_TOKEN غير مضبوط" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!data.ok) return { ok: false, description: data.description ?? "خطأ غير معروف من تيليجرام" };
    return { ok: true, result: data.result as T };
  } catch (e) {
    return { ok: false, description: (e as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

/** معلومات البوت نفسه (getMe) — يتحقق أن التوكن مقبول ويظهر @اسم البوت */
export async function getMeWith(token: string): Promise<{ username: string; firstName: string } | null> {
  const r = await telegramApi<{ username?: string; first_name?: string }>(token, "getMe", {});
  if (!r.ok) return null;
  return { username: r.result?.username ?? "", firstName: r.result?.first_name ?? "" };
}

/** معلومات الويبهوك الحالية (للعرض في لوحة الإدارة) */
export async function getWebhookInfoWith(
  token: string
): Promise<{ url: string; pendingUpdateCount: number; lastErrorMessage: string } | null> {
  const r = await telegramApi<{ url?: string; pending_update_count?: number; last_error_message?: string }>(
    token,
    "getWebhookInfo",
    {}
  );
  if (!r.ok) return null;
  return {
    url: r.result?.url ?? "",
    pendingUpdateCount: Number(r.result?.pending_update_count ?? 0),
    lastErrorMessage: r.result?.last_error_message ?? "",
  };
}

/** مؤشر «يكتب الآن…» — يجعل البوت يبدو حياً قبل الرد الذكي */
export async function sendTyping(token: string, chatId: number): Promise<void> {
  try {
    await telegramApi(token, "sendChatAction", { chat_id: chatId, action: "typing" }, 8_000);
  } catch {
    // مؤشر الكتابة تحسين اختياري — تجاهل أي فشل
  }
}

/**
 * يرسل نصاً إلى محادثة (خاصة عادة). يقسّم النص تلقائياً على حدود
 * الأسطر عند تجاوز حد تيليجرام (4096). نص عادي بدون parse_mode —
 * لا حاجة لتهريب رموز Markdown ولا لخطر تنسيق عشوائي.
 */
export async function sendMessageText(token: string, chatId: number, text: string): Promise<boolean> {
  const clean = (text ?? "").trim();
  if (!clean) return false;
  for (const chunk of splitForTelegram(clean)) {
    const r = await telegramApi<unknown>(token, "sendMessage", {
      chat_id: chatId,
      text: chunk,
      // plain text — مقصود: مخرجات الذكاء الاصطناعي لا تُفسَّر كتنسيق
      disable_web_page_preview: true,
    });
    if (!r.ok) return false;
  }
  return true;
}

/** يقسّم النص الطويل على حدود الأسطر (لا في منتصف كلمة/جملة) */
export function splitForTelegram(text: string): string[] {
  if (text.length <= TG_MESSAGE_LIMIT) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > TG_MESSAGE_LIMIT) {
    const window = rest.slice(0, TG_MESSAGE_LIMIT);
    let cut = window.lastIndexOf("\n\n");
    if (cut < TG_MESSAGE_LIMIT / 4) cut = window.lastIndexOf("\n");
    if (cut < TG_MESSAGE_LIMIT / 4) cut = window.lastIndexOf(". ");
    if (cut < TG_MESSAGE_LIMIT / 4) cut = window.lastIndexOf(" ");
    if (cut < TG_MESSAGE_LIMIT / 4) cut = TG_MESSAGE_LIMIT - 1;
    chunks.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1);
  }
  if (rest.trim()) chunks.push(rest.trim());
  return chunks;
}

/** تنزيل مؤقت لملف (لتحليل الصور فقط — لا يُخزَّن) */
export async function downloadFileBase64With(
  token: string,
  fileId: string
): Promise<{ base64: string; mime: string } | null> {
  if (!token) return null;
  const info = await telegramApi<{ file_path?: string }>(token, "getFile", { file_id: fileId });
  if (!info.ok || !info.result?.file_path) return null;
  try {
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${info.result.file_path}`);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_VISION_BYTES) return null;
    return {
      base64: buf.toString("base64"),
      mime: res.headers.get("content-type")?.split(";")[0] || "image/jpeg",
    };
  } catch {
    return null;
  }
}

/** يربط الويبهوك بتوكن وسرّ محددين (قد يكون البوت من قاعدة البيانات) */
export async function activateWebhookWith(
  token: string,
  secret: string,
  origin: string,
  dropPendingUpdates = true
): Promise<{ ok: boolean; message: string; url: string }> {
  const url = `${origin}/api/telegram/webhook`;
  if (!token) return { ok: false, message: "لا يوجد توكن بوت لتفعيله", url };
  if (!secret) return { ok: false, message: "سرّ الويبهوك مفقود", url };
  const r = await telegramApi<unknown>(token, "setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["channel_post", "edited_channel_post", "message", "edited_message"],
    drop_pending_updates: dropPendingUpdates,
  });
  if (!r.ok) return { ok: false, message: `فشل تفعيل الربط: ${r.description ?? "خطأ غير معروف"}`, url };
  return { ok: true, message: "تم تفعيل الربط — سيتم استيراد المنشورات الجديدة والرد على الرسائل تلقائياً", url };
}
