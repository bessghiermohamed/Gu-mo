/**
 * Bot brain (round 62) — «بوت الترتيب الذكي».
 *
 * When someone messages the bot PRIVATELY (@gu_mo_bot), the bot:
 *   1. /start / /help → welcome & guide (no AI needed).
 *   2. Text → a real THINKING answer via the same provider chain as the
 *      in-app assistant (lib/ai/providers — Groq → Gemini → xAI chain),
 *      with short conversation memory per chat.
 *   3. File/photo/video → the bot SORTS it: classifies the content into
 *      the academic item types (محاضرة/امتحان/تمارين…) with a clean
 *      Arabic title — same classifier the channel pipeline uses, vision
 *      OCR included for photos. Nothing is stored: classification only.
 *
 * PRIVACY: private messages are NEVER ingested into telegram_items and
 * NEVER logged to the DB — the conversation lives in memory for this
 * process only (same stance as the in-app assistant).
 *
 * PURITY: imports only pure modules (bot-api / classify / providers) —
 * unit-testable with bun + patched fetch, outside Next.js.
 *
 * Never throws; failures degrade to a friendly fallback message.
 */

import { classifyItem } from "./classify";
import { isAiConfigured, chatComplete, type ChatMessage } from "@/lib/ai/providers";
import { sendMessageText, sendTyping, downloadFileBase64With } from "./bot-api";
import type { TgMessage } from "./types";

// ---------------------------------------------------------------------------
// Prompts & static texts (Arabic — the app's language)
// ---------------------------------------------------------------------------

/** هوية البوت في المحادثة الخاصة — نسخة تيليجرام من SYSTEM_ROLE بتطبيق /api/ai */
const TELEGRAM_SYSTEM_ROLE = [
  "أنت «بوت طالب (Talib)»، رفيق دراسة لطالب جامعي جزائري، تخدمه عبر محادثة تيليجرام.",
  "أجب دائماً بالعربية الفصحى المبسطة بأسلوب ودود ودقيق، وبلا مقدمات زائدة وبلا إيموجي.",
  "نظّم إجاباتك بفقرات قصيرة، واستخدم عناوين وقوائم مختصرة عند الحاجة، ووضّح المصطلحات التقنية بالعربية مع إبقائها بالإنجليزية/الفرنسية بين قوسين إن كانت كذلك.",
  "واجهة تيليجرام لا تعرض LaTeX: اكتب الرياضيات والرموز نصاً عادياً واضحاً (مثال: F = m × a أو E = mc²) ولا تستخدم علامات الدولار للمعادلات.",
  "إن كان السؤال غامضاً فاسأل سؤالاً توضيحياً واحداً قبل الإجابة، وإذا كان خارج نطاق الدراسة فنبّه الطالب بلطف.",
  "إن لم تعرف الجواب بدقة فقل ذلك بصراحة ولا تخترع معلومات، ولا تُنهِ إجاباتك بعبارة ختامية متكررة.",
].join(" ");

const WELCOME_TEXT = [
  "أهلاً بك! أنا بوت «طالب | Talib» — منصة الطلبة الجامعيين في الجزائر.",
  "",
  "ماذا أستطيع أن أفعل من أجلك؟",
  "• أجيب عن أسئلتك الدراسية والعلمية — اكتب سؤالك مباشرة وسأفكّر فيه وأجيبك.",
  "• أرسل لي ملفاً أو صورة (درس، تمرين، امتحان…) وسأخبرك بنوعه وعنوانه المناسب — هذا «الترتيب الذكي» نفسه الذي أستعمله في قنوات المنصة.",
  "• في القنوات الجامعية المرتبطة بالمنصة أرتّب المنشورات تلقائياً (محاضرات، تمارين، امتحانات…) داخل تطبيق طالب.",
  "",
  "تطبيق المنصة: gu-mo.vercel.app",
  "وكل ما ترسله هنا يبقى بينك وبيني — لا يُحفظ أي شيء منه.",
].join("\n");

const HELP_TEXT = [
  "كيف تستعمل البوت؟",
  "",
  "• سؤال دراسي؟ اكتبه مباشرة (بالعربية أو الفرنسية) وسأجيبك خطوة بخطوة.",
  "• ملف أو صورة ولا تعرف ما هي بالضبط؟ أرسلها وسأصنّفها: محاضرة، أعمال موجهة TD، تمارين، امتحان، ملخص، كتاب… مع عنوان مقترح.",
  "• لسماع المنشورات المرتبة في قنواتك الجامعية: افتح تطبيق طالب ← دروس تيليجرام.",
  "",
  "ملاحظة: الرسائل الصوتية غير مدعومة بعد — اكتب سؤالك نصاً.",
].join("\n");

const VOICE_UNSUPPORTED =
  "الرسائل الصوتية غير مدعومة بعد — اكتب سؤالك نصاً وسأجيبك فوراً.";

const AI_FALLBACK_TEXT =
  "المساعد الذكي غير متاح حالياً (خدمة الذكاء الاصطناعي غير مضبوطة أو مثقلة مؤقتاً). جرّب بعد قليل — أو اطرح سؤالك داخل تطبيق طالب في «المساعد الذكي».";

const RATE_LIMIT_TEXT =
  "انتظر بضع ثوانٍ بين كل رسالة ورسالة — أحتاج وقتاً قليلاً للتفكير.";

const RATE_LIMIT_DAILY_TEXT = "وصلت إلى حد الاستخدام اليومي للبوت — جرّب غداً.";

const NO_CONTENT_TEXT = "أرسل لي سؤالاً نصياً أو ملفاً/صورة لأصنّفه — ويمكنك كتابة /help في أي وقت.";

// ---------------------------------------------------------------------------
// Guards: rate limiting + conversation memory (in-memory, best-effort)
// ---------------------------------------------------------------------------

const MIN_GAP_MS = 3_000; // فاصل أدنى بين الرسائل لكل مستخدم
const DAILY_CAP = 40; // رسائل الذكاء الاصطناعي لكل مستخدم يومياً
const MEMORY_TTL_MS = 30 * 60 * 1000; // ذاكرة المحادثة: ٣٠ دقيقة
const MEMORY_TURNS = 8; // آخر ٨ أدوار تُرسل كسياق
const MAX_CHATS = 2000;

const users = new Map<number, { last: number; lastNotice: number; day: string; count: number }>();
const chats = new Map<number, { messages: ChatMessage[]; at: number }>();

function dayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/** يفحص الحد؛ يرجّع رسالة التحديد إن وُجدت، أو "" للتجاهل الصامت، أو null إن سمح بالمرور */
function rateLimitCheck(userId: number): string | null {
  const now = Date.now();
  const rec = users.get(userId) ?? { last: 0, lastNotice: 0, day: dayStamp(), count: 0 };
  if (rec.day !== dayStamp()) {
    rec.day = dayStamp();
    rec.count = 0;
  }
  const gapOk = now - rec.last >= MIN_GAP_MS;
  rec.count += 1;
  rec.last = now;
  users.set(userId, rec);
  if (users.size > 5000) {
    for (const [k, v] of users) {
      if (now - v.last > 24 * 60 * 60 * 1000) users.delete(k);
    }
  }
  if (rec.count > DAILY_CAP) return RATE_LIMIT_DAILY_TEXT;
  if (gapOk) return null;
  if (now - rec.lastNotice < 10_000) return ""; // حذّرنا قبل قليل — تجاهل بصمت
  rec.lastNotice = now;
  return RATE_LIMIT_TEXT;
}

function rememberTurn(chatId: number, role: "user" | "assistant", content: string) {
  const now = Date.now();
  const entry = chats.get(chatId) ?? { messages: [], at: now };
  entry.messages.push({ role, content: content.slice(0, 6000) });
  if (entry.messages.length > MEMORY_TURNS * 2) entry.messages = entry.messages.slice(-MEMORY_TURNS * 2);
  entry.at = now;
  chats.set(chatId, entry);
  if (chats.size > MAX_CHATS) {
    for (const [k, v] of chats) {
      if (now - v.at > MEMORY_TTL_MS) chats.delete(k);
    }
  }
}

function conversationFor(chatId: number): ChatMessage[] {
  const entry = chats.get(chatId);
  if (!entry || Date.now() - entry.at > MEMORY_TTL_MS) return [];
  return entry.messages.slice(-MEMORY_TURNS);
}

// ---------------------------------------------------------------------------
// Content classification for files/photos sent in private
// ---------------------------------------------------------------------------

async function classifyAndReply(msg: TgMessage, token: string): Promise<"handled-classify" | "handled-fallback"> {
  const caption = (msg.caption ?? msg.text ?? "").trim();
  let fileName = "";
  let sizeBytes = 0;
  let imageBase64: string | undefined;
  let imageMime: string | undefined;
  let kind = "other";

  if (msg.photo?.length) {
    kind = "image";
    const largest = msg.photo[msg.photo.length - 1];
    sizeBytes = largest.file_size ?? 0;
    if (isAiConfigured() && token && largest.file_id) {
      const dl = await downloadFileBase64With(token, largest.file_id);
      if (dl) {
        imageBase64 = dl.base64;
        imageMime = dl.mime;
      }
    }
  } else if (msg.document) {
    fileName = msg.document.file_name ?? "";
    kind = kindFromFile(msg.document.mime_type ?? "", fileName);
  } else if (msg.video) {
    fileName = msg.video.file_name ?? "";
    kind = "video";
  } else if (msg.audio) {
    fileName = msg.audio.file_name ?? "";
    kind = "audio";
  }

  await sendTyping(token, msg.chat.id);
  const cls = await classifyItem({
    kind,
    caption,
    fileName,
    ...(imageBase64 ? { imageBase64, imageMimeType: imageMime } : {}),
    context: "رسالة خاصة إلى البوت — صنّف لعرض النوع والعنوان فقط",
  });

  const lines = [
    `التصنيف الذكي: ${cls.itemType}`,
    `العنوان المقترح: ${cls.title || "—"}`,
  ];
  if (cls.aiClassified) lines.push("(صُنِّف بالذكاء الاصطناعي)");
  lines.push("", "هذا التصنيف للعرض فقط — لم يُحفظ الملف ولن يظهر لأحد. يمكنك سؤالي عن محتواه الآن.");
  const sent = await sendMessageText(token, msg.chat.id, lines.join("\n"));
  return sent ? "handled-classify" : "handled-fallback";
}

function kindFromFile(mime: string, fileName: string): string {
  const m = (mime || "").toLowerCase();
  const name = (fileName || "").toLowerCase();
  if (m.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (m.startsWith("image/") || /\.(jpe?g|png|gif|webp|heic|bmp)$/.test(name)) return "image";
  if (m.startsWith("video/") || /\.(mp4|mkv|avi|mov|webm)$/.test(name)) return "video";
  if (m.startsWith("audio/") || /\.(mp3|ogg|m4a|opus|wav)$/.test(name)) return "audio";
  if (m.includes("presentation") || /\.(ppt|pptx|odp)$/.test(name)) return "ppt";
  if (m.includes("word") || m.includes("document") || /\.(doc|docx|odt|rtf|txt)$/.test(name)) return "doc";
  return "other";
}

// ---------------------------------------------------------------------------
// Main entry — called by processTelegramUpdate for chat.type === "private"
// ---------------------------------------------------------------------------

export type PrivateChatOutcome =
  | "handled-command"
  | "handled-ai"
  | "handled-classify"
  | "handled-fallback"
  | "rate-limited"
  | "ignored";

export async function handlePrivateMessage(msg: TgMessage, token: string): Promise<PrivateChatOutcome> {
  try {
    const chatId = msg.chat.id;
    const rawText = (msg.text ?? "").trim();
    // "/start@gu_mo_bot" → "/start" (تيليجرام يضيف اسم البوت في المجموعات)
    const command = rawText.split(/\s+/, 1)[0]?.replace(/@.+$/, "") ?? "";

    // 1) الأوامر — بلا ذكاء اصطناعي ولا حدود معدّة
    if (command === "/start") {
      await sendMessageText(token, chatId, WELCOME_TEXT);
      return "handled-command";
    }
    if (command === "/help") {
      await sendMessageText(token, chatId, HELP_TEXT);
      return "handled-command";
    }

    // 2) حدود الاستخدام (أفضل جهد — لكل نسخة خادم)
    if (msg.from?.id) {
      const limited = rateLimitCheck(msg.from.id);
      if (limited !== null) {
        if (limited) await sendMessageText(token, chatId, limited);
        return "rate-limited";
      }
    }

    // 3) صوت؟ غير مدعوم — ردّ واضح بدل الصمت
    if (msg.voice) {
      await sendMessageText(token, chatId, VOICE_UNSUPPORTED);
      return "handled-fallback";
    }

    // 4) ملف/صورة/فيديو → ترتيب ذكي (تصنيف فقط، بلا تخزين)
    const hasMedia = !!(msg.photo?.length || msg.document || msg.video || msg.audio);
    if (hasMedia) {
      return await classifyAndReply(msg, token);
    }

    // 5) نص → تفكير حقيقي عبر سلسلة المزوّدين
    if (rawText) {
      if (!isAiConfigured()) {
        await sendMessageText(token, chatId, AI_FALLBACK_TEXT);
        return "handled-fallback";
      }
      await sendTyping(token, chatId);
      const history = conversationFor(chatId);
      const messages: ChatMessage[] = [...history, { role: "user", content: rawText.slice(0, 6000) }];
      try {
        const { answer } = await chatComplete(TELEGRAM_SYSTEM_ROLE, messages);
        const sent = await sendMessageText(token, chatId, answer);
        rememberTurn(chatId, "user", rawText);
        if (sent) rememberTurn(chatId, "assistant", answer);
        return "handled-ai";
      } catch {
        await sendMessageText(token, chatId, AI_FALLBACK_TEXT);
        return "handled-fallback";
      }
    }

    // 6) لا نص ولا وسائط (رسالة خدمة…)
    await sendMessageText(token, chatId, NO_CONTENT_TEXT);
    return "ignored";
  } catch {
    return "ignored"; // البوت لا يرمي استثناءً أبداً — الويبهوك يبقى 200
  }
}
