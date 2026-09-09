/**
 * Telegram ingest engine (round 7, r62 bot-swap aware)
 *
 * Turns Telegram bot updates (channel posts + group messages) into
 * telegram_items rows. Works in BOTH deployment modes of this app
 * (Supabase on Vercel / Prisma SQLite locally) — same pattern as all
 * other API routes in this codebase.
 *
 * r62: the ACTIVE bot token comes from bot-config (DB row set from the
 * admin UI «تغيير البوت», else the Vercel env var) — and PRIVATE chats
 * are routed to the bot brain (bot-chat.ts) instead of ingest.
 *
 * Invariants:
 *  1. LINKS NOT FILES — only metadata + a t.me deep link is stored.
 *     Images are downloaded transiently for Gemini vision, never saved.
 *  2. Idempotent — a redelivered update updates the same row
 *     (source_id + tg_message_id), never duplicates.
 *  3. Curation wins — an edited post refreshes caption/link/file data
 *     but NEVER touches admin-curated fields (title overrides, type,
 *     module mapping, hidden/featured).
 *  4. This module never throws — failures degrade to "ignored".
 */

import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { classifyItem, isGeminiConfigured } from "./classify";
import { buildSearchText, firstLineTitle, fileNameToTitle } from "./normalize";
import { resolveBotCredentials } from "./bot-config";
import { telegramApi, getMeWith, activateWebhookWith, downloadFileBase64With } from "./bot-api";
import { handlePrivateMessage, handleGroupMessage, isBotAddressed, type PrivateChatOutcome, type GroupChatOutcome } from "./bot-chat";
import type { TgItemKind, TgMessage, TgUpdate, TgChatInfo } from "./types";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
const MAX_VISION_BYTES = 8 * 1024 * 1024;

/** التوكن النشط: قاعدة البيانات (عُيّن من الواجهة) أو متغير البيئة */
async function activeToken(): Promise<string> {
  return (await resolveBotCredentials()).token;
}

/** توفر البوت — أصبح غير متزامن لأن التوكن قد يُقرأ من قاعدة البيانات */
export async function isBotConfigured(): Promise<boolean> {
  return (await activeToken()).length > 20;
}

// =============================================================
// Telegram Bot API helpers (REST, no SDK) — token resolved per call
// =============================================================

async function botApi<T>(method: string, body: Record<string, unknown>): Promise<{ ok: true; result: T } | { ok: false; description: string }> {
  const r = await telegramApi<T>(await activeToken(), method, body);
  return r.ok ? { ok: true, result: r.result as T } : { ok: false, description: r.description ?? "خطأ غير معروف من تيليجرام" };
}

/** يقرأ معلومات قناة/مجموعة بالمعرّف أو اسم المستخدم — يتطلب البوت مشرفاً */
export async function resolveChat(chatIdOrUsername: string): Promise<{ chat?: TgChatInfo; error?: string }> {
  const r = await botApi<TgChatInfo>("getChat", { chat_id: chatIdOrUsername });
  if (!r.ok) {
    return {
      error:
        r.description.includes("chat not found") || r.description.includes("USER_DEACTIVATED")
          ? "لم يتم العثور على القناة. تأكد من الاسم ثم أعد المحاولة."
          : r.description.includes("bot is not a member") || r.description.includes("CHAT_ADMIN_REQUIRED") || r.description.includes("member")
          ? "أضف البوت مشرفاً في القناة أولاً ثم أعد المحاولة."
          : `تعذّر قراءة بيانات القناة: ${r.description}`,
    };
  }
  return { chat: r.result };
}

/** معلومات البوت نفسه (getMe) — يتحقق أن التوكن مقبول ويظهر @اسم البوت */
export async function getBotInfo(): Promise<{ username: string; firstName: string } | null> {
  return getMeWith(await activeToken());
}

/** معلومات الويبهوك الحالية (للعرض في لوحة الإدارة) */
export async function getWebhookInfo(): Promise<{ url: string; pendingUpdateCount: number; lastErrorMessage: string } | null> {
  const r = await botApi<{ url?: string; pending_update_count?: number; last_error_message?: string }>("getWebhookInfo", {});
  if (!r.ok) return null;
  return {
    url: r.result.url ?? "",
    pendingUpdateCount: Number(r.result.pending_update_count ?? 0),
    lastErrorMessage: r.result.last_error_message ?? "",
  };
}

/** يربط الويبهوك بالنطاق الحالي مع سرّ التحقق — بالتوكن النشط (قاعدة بيانات أو بيئة) */
export async function setWebhook(origin: string): Promise<{ ok: boolean; message: string }> {
  const { token, secret } = await resolveBotCredentials();
  const r = await activateWebhookWith(token, secret, origin);
  return { ok: r.ok, message: r.message };
}

/** تنزيل مؤقت لملف (لتحليل الصور فقط — لا يُخزَّن). عام: يستعمله
 *  الاستيراد وكذلك «إعادة التصنيف» الإدارية لاحقاً. */
export async function downloadFileBase64(fileId: string): Promise<{ base64: string; mime: string } | null> {
  return downloadFileBase64With(await activeToken(), fileId);
}

// =============================================================
// Parsing helpers
// =============================================================

interface ParsedContent {
  kind: TgItemKind | null;
  fileName: string;
  mimeType: string;
  fileId: string;
  fileUniqueId: string;
  sizeBytes: number;
  caption: string;
  mediaGroupId: string;
  isPhoto: boolean;
}

export function kindFromDocument(mime: string, fileName: string): TgItemKind {
  const m = (mime || "").toLowerCase();
  const name = (fileName || "").toLowerCase();
  if (m.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (m.startsWith("image/") || /\.(jpe?g|png|gif|webp|heic|bmp)$/.test(name)) return "image";
  if (m.startsWith("video/") || /\.(mp4|mkv|avi|mov|webm)$/.test(name)) return "video";
  if (m.startsWith("audio/") || /\.(mp3|ogg|m4a|opus|wav)$/.test(name)) return "audio";
  if (m.includes("presentation") || /\.(ppt|pptx|odp)$/.test(name)) return "ppt";
  if (m.includes("word") || m.includes("document") || /\.(doc|docx|odt|rtf|txt)$/.test(name)) return "doc";
  if (m.includes("sheet") || /\.(xls|xlsx|csv|ods)$/.test(name)) return "doc";
  return "other";
}

export function parseMessageContent(msg: TgMessage): ParsedContent {
  const caption = (msg.caption ?? msg.text ?? "").trim();
  const mediaGroupId = msg.media_group_id ?? "";
  const base: ParsedContent = {
    kind: null, fileName: "", mimeType: "", fileId: "", fileUniqueId: "",
    sizeBytes: 0, caption, mediaGroupId, isPhoto: false,
  };
  if (msg.photo?.length) {
    // largest size = last element
    const largest = msg.photo[msg.photo.length - 1];
    return { ...base, kind: "image", mimeType: "image/jpeg", isPhoto: true, fileId: largest.file_id, fileUniqueId: largest.file_unique_id, sizeBytes: largest.file_size ?? 0 };
  }
  if (msg.document) {
    const kind = kindFromDocument(msg.document.mime_type ?? "", msg.document.file_name ?? "");
    return { ...base, kind, fileName: msg.document.file_name ?? "", mimeType: msg.document.mime_type ?? "", fileId: msg.document.file_id, fileUniqueId: msg.document.file_unique_id, sizeBytes: msg.document.file_size ?? 0 };
  }
  if (msg.video) {
    return { ...base, kind: "video", fileName: msg.video.file_name ?? "", mimeType: msg.video.mime_type ?? "", fileId: msg.video.file_id, fileUniqueId: msg.video.file_unique_id, sizeBytes: msg.video.file_size ?? 0 };
  }
  if (msg.audio) {
    return { ...base, kind: "audio", fileName: msg.audio.file_name ?? "", mimeType: msg.audio.mime_type ?? "", fileId: msg.audio.file_id, fileUniqueId: msg.audio.file_unique_id, sizeBytes: msg.audio.file_size ?? 0 };
  }
  if (msg.voice) {
    return { ...base, kind: "audio", mimeType: msg.voice.mime_type ?? "audio/ogg", fileId: msg.voice.file_id, fileUniqueId: msg.voice.file_unique_id, sizeBytes: msg.voice.file_size ?? 0 };
  }
  if (caption) return { ...base, kind: "text" };
  return base; // رسالة خدمة (انضمام عضو…) — تُتجاهل
}

/** يبني رابط t.me المباشر للمنشور الأصلي — وفي المنتديات يشمل الموضوع (topic) */
export function buildDeepLink(
  source: { tgChannelId: string; tgUsername: string },
  messageId: number,
  threadId?: number
): string {
  const uname = source.tgUsername.replace(/^@/, "").trim();
  const topic = threadId && threadId > 0 ? `/${threadId}` : "";
  if (uname) return `https://t.me/${uname}${topic}/${messageId}`;
  const raw = source.tgChannelId.replace(/^-100/, "");
  return `https://t.me/c/${raw}${topic}/${messageId}`;
}

// ------------------------------------------------------------
// الجولة 63 — وعي المنتديات (topics): أسماء المواضيع من أحداث الإنشاء،
// بذاكرة مثيل (best-effort) لأن خادم Vercel بلا حالة. الاسم يحسّن سياق
// التصنيف فقط ولا يُخزَّن أبداً وحده.
// ------------------------------------------------------------
const topicNames = new Map<string, string>(); // "<chatId>:<threadId>" → name

function rememberTopicName(msg: TgMessage): void {
  const chatId = String(msg.chat?.id ?? "");
  const threadId = msg.message_thread_id ?? msg.message_id;
  const name = msg.forum_topic_created?.name ?? msg.forum_topic_edited?.name ?? "";
  if (chatId && name) topicNames.set(`${chatId}:${threadId}`, name.trim());
}

function topicNameFor(chatId: string, threadId: number | undefined): string {
  if (!threadId) return "";
  return topicNames.get(`${chatId}:${threadId}`) ?? "";
}

/** هل هذه الرسالة جديرة بالاستيراد من مصدر «مجموعة/منتدى»؟
 * النقاش العام (General) هراء بالتعريف — لا نستورد منه إلا ما يحمل ملفاً/وسائط. */
function isGroupContentWorthy(msg: TgMessage, hasMedia: boolean): boolean {
  if (hasMedia) return true; // ملف/صورة/فيديو في أي مكان = محتوى
  return !!msg.is_topic_message; // نص داخل موضوع (غير العام) = محتوى بالعادة
}

/** يقبل @name أو t.me/name أو t.me/c/123 أو معرّفاً رقمياً خام */
export function parseChannelHandle(input: string): { username?: string; chatId?: string } {
  const s = input.trim();
  if (!s) return {};
  const tmeMatch = s.match(/^https?:\/\/t\.me\/(c\/)?([A-Za-z0-9_]+)/i) ?? s.match(/^t\.me\/(c\/)?([A-Za-z0-9_]+)/i);
  if (tmeMatch) {
    if (tmeMatch[1]) return { chatId: `-100${tmeMatch[2]}` };
    return { username: tmeMatch[2] };
  }
  if (/^@/.test(s)) return { username: s.slice(1) };
  if (/^-?\d{5,}$/.test(s)) return { chatId: s };
  if (/^[A-Za-z0-9_]{4,}$/.test(s)) return { username: s };
  return {};
}

// =============================================================
// Main ingest
// =============================================================

export interface SourceLite {
  id: number;
  tgChannelId: string;
  tgUsername: string;
  titleAr: string;
  sourceType: string;
  specialtyId: number;
  yearId: number | null;
  semester: number | null;
  moduleId: number | null;
  cohortId: number | null;
  isActive: boolean;
  lastUpdateId: number;
}

export interface TelegramItemProbe {
  id: number;
  titleAr: string;
  itemType: string;
  kind: string;
  aiClassified: boolean;
  captionText: string;
  link: string;
  origin: string;
}

/** يقرأ عنصراً مستورداً (لعرض نتيجة فحص الاستيراد) */
export async function findTelegramItem(sourceId: number, tgMessageId: number): Promise<TelegramItemProbe | null> {
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("telegram_items")
        .select("id, title_ar, item_type, kind, ai_classified, caption_text, link, origin")
        .eq("source_id", sourceId)
        .eq("tg_message_id", tgMessageId)
        .maybeSingle();
      if (!data) return null;
      return {
        id: Number(data.id), titleAr: String(data.title_ar ?? ""), itemType: String(data.item_type ?? ""),
        kind: String(data.kind ?? ""), aiClassified: !!data.ai_classified,
        captionText: String(data.caption_text ?? ""), link: String(data.link ?? ""), origin: String(data.origin ?? "telegram"),
      };
    }
    const it = await db.telegramItem.findUnique({
      where: { sourceId_tgMessageId: { sourceId, tgMessageId } },
    });
    if (!it) return null;
    return {
      id: it.id, titleAr: it.titleAr, itemType: it.itemType, kind: it.kind, aiClassified: it.aiClassified,
      captionText: it.captionText, link: it.link, origin: it.origin,
    };
  } catch {
    return null;
  }
}

/** يحذف عنصراً مستورداً — يستعمله «فحص الاستيراد» لتنظيف منشوره التجريبي */
export async function deleteTelegramItemById(id: number): Promise<boolean> {
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.from("telegram_items").delete().eq("id", id);
      return !error;
    }
    await db.telegramItem.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

/** يقرأ مصدراً بمعرّفه الداخلي (للفحص والاختبار) */
export async function loadSourceById(id: number): Promise<SourceLite | null> {
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("telegram_sources")
        .select("id, tg_channel_id, tg_username, title_ar, source_type, specialty_id, year_id, semester, module_id, cohort_id, is_active, last_update_id")
        .eq("id", id)
        .maybeSingle();
      if (!data) return null;
      return {
        id: Number(data.id), tgChannelId: String(data.tg_channel_id), tgUsername: String(data.tg_username ?? ""),
        titleAr: String(data.title_ar ?? ""), sourceType: String(data.source_type ?? "channel"),
        specialtyId: Number(data.specialty_id ?? 1), yearId: data.year_id == null ? null : Number(data.year_id),
        semester: data.semester == null ? null : Number(data.semester), moduleId: data.module_id == null ? null : Number(data.module_id),
        cohortId: data.cohort_id == null ? null : Number(data.cohort_id),
        isActive: !!data.is_active, lastUpdateId: Number(data.last_update_id ?? 0),
      };
    }
    const s = await db.telegramSource.findUnique({ where: { id } });
    if (!s) return null;
    return {
      id: s.id, tgChannelId: s.tgChannelId, tgUsername: s.tgUsername, titleAr: s.titleAr,
      sourceType: s.sourceType, specialtyId: s.specialtyId, yearId: s.yearId, semester: s.semester,
      moduleId: s.moduleId, cohortId: s.cohortId, isActive: s.isActive, lastUpdateId: s.lastUpdateId,
    };
  } catch {
    return null;
  }
}

async function loadSourceByChatId(chatId: string): Promise<SourceLite | null> {
  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("telegram_sources")
      .select("id, tg_channel_id, tg_username, title_ar, source_type, specialty_id, year_id, semester, module_id, cohort_id, is_active, last_update_id")
      .eq("tg_channel_id", chatId)
      .maybeSingle();
    if (!data) return null;
    return {
      id: Number(data.id), tgChannelId: String(data.tg_channel_id), tgUsername: String(data.tg_username ?? ""),
      titleAr: String(data.title_ar ?? ""), sourceType: String(data.source_type ?? "channel"),
      specialtyId: Number(data.specialty_id ?? 1), yearId: data.year_id == null ? null : Number(data.year_id),
      semester: data.semester == null ? null : Number(data.semester), moduleId: data.module_id == null ? null : Number(data.module_id),
      cohortId: data.cohort_id == null ? null : Number(data.cohort_id),
      isActive: !!data.is_active, lastUpdateId: Number(data.last_update_id ?? 0),
    };
  }
  const s = await db.telegramSource.findUnique({ where: { tgChannelId: chatId } });
  if (!s) return null;
  return {
    id: s.id, tgChannelId: s.tgChannelId, tgUsername: s.tgUsername, titleAr: s.titleAr,
    sourceType: s.sourceType, specialtyId: s.specialtyId, yearId: s.yearId, semester: s.semester,
    moduleId: s.moduleId, cohortId: s.cohortId, isActive: s.isActive, lastUpdateId: s.lastUpdateId,
  };
}

async function getModuleName(moduleId: number | null): Promise<string> {
  if (!moduleId) return "";
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase.from("module_courses").select("name").eq("id", moduleId).maybeSingle();
      return data ? String(data.name ?? "") : "";
    }
    const m = await db.moduleCourse.findUnique({ where: { id: moduleId }, select: { name: true } });
    return m?.name ?? "";
  } catch {
    return "";
  }
}

/** حالة معالجة تحديث تيليجرام — تشمل الآن مخرجات عقل البوت (خاص + مجموعات) */
export type UpdateStatus = "inserted" | "updated" | "ignored" | PrivateChatOutcome | GroupChatOutcome;

/** اسم مستخدم البوت الفعّال — للكشف عن المنشن داخل المجموعات (تخزين مؤقت) */
let cachedBotUsername: { value: string; at: number } | null = null;
async function activeBotUsername(token: string): Promise<string> {
  const now = Date.now();
  if (cachedBotUsername && now - cachedBotUsername.at < 10 * 60_000 && cachedBotUsername.value) {
    return cachedBotUsername.value;
  }
  let username = "";
  if (token) {
    const me = await getMeWith(token);
    username = me?.username ?? "";
  }
  if (username) cachedBotUsername = { value: username, at: now };
  return username;
}

/** التوكن المستعمل للردود في هذا التحديث: الصريح (?b=) أو الفعّال (قاعدة/بيئة) */
async function replyTokenFor(explicitToken?: string): Promise<string> {
  if (explicitToken) return explicitToken;
  return (await resolveBotCredentials()).token;
}

/**
 * يعالج تحديثاً واحداً من تيليجرام. يعيد الحالة دائماً ولا يرمي استثناءً.
 */
export async function processTelegramUpdate(update: TgUpdate, explicitToken?: string): Promise<UpdateStatus> {
  try {
    const msg = update.channel_post ?? update.message ?? update.edited_channel_post ?? update.edited_message;
    if (!msg?.chat?.id) return "ignored";
    const isEdit = !!(update.edited_channel_post ?? update.edited_message);
    // تجاهل رسائل البوتات (حماية من حلقات)
    if (msg.from?.is_bot) return "ignored";

    // r62: محادثة خاصة مع البوت ← العقل (أوامر/أجوبة ذكية/ترتيب الملفات) —
    // ليست مصدر استيراد، ولا يُخزَّن منها شيء في telegram_items أبداً.
    if (msg.chat.type === "private") {
      const token = await replyTokenFor(explicitToken);
      return await handlePrivateMessage(msg, token);
    }

    // r63: تذكّر أسماء مواضيع المنتدى من أحداث الإنشاء (سياق التصنيف فقط)
    rememberTopicName(msg);

    // r63: المجموعات/المنتديات — إذا خوطب البوت صراحة (منشن/ردّ/أمر) أجاب
    // بعقله داخل الموضوع نفسه؛ وإلا يبقى صامتاً كلياً (لا سبام في النقاش).
    if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
      const token = await replyTokenFor(explicitToken);
      if (token) {
        const botUsername = await activeBotUsername(token);
        if (botUsername && isBotAddressed(msg, botUsername)) {
          return await handleGroupMessage(msg, token, botUsername);
        }
      }
    }

    const source = await loadSourceByChatId(String(msg.chat.id));
    if (!source || !source.isActive) return "ignored";

    const content = parseMessageContent(msg);
    if (!content.kind) return "ignored";

    // r63: مصادر المجموعات/المنتديات — نقاش «العام» لا يُستورد (إلا وسائط)،
    // أما مواضيع المنتدى فمحتوى بالعادة (مصادر، دروس، امتحانات…)
    const hasMedia = !!(msg.photo?.length || msg.document || msg.video || msg.audio);
    if (source.sourceType === "group" && !isGroupContentWorthy(msg, hasMedia)) {
      return "ignored";
    }

    // تنزيل الصور يحتاج توكن بوت — الصريح (?b=) أولاً ثم الفعّال
    const downloadToken = explicitToken || (await resolveBotCredentials()).token;

    const threadId = msg.message_thread_id;
    const link = buildDeepLink(source, msg.message_id, msg.is_topic_message ? threadId : undefined);
    const postedAt = new Date(msg.date * 1000).toISOString();
    const postedBy = msg.from ? (msg.from.first_name || msg.from.username || "") : "";

    // --- التصنيف (Gemini ثم fallback محلي) ---
    const wantsVision =
      content.kind === "image" && !!content.fileId && isGeminiConfigured() && !!downloadToken && content.sizeBytes <= MAX_VISION_BYTES;
    let imageBase64: string | undefined;
    let imageMime: string | undefined;
    if (wantsVision) {
      const dl = await downloadFileBase64With(downloadToken, content.fileId);
      if (dl) {
        imageBase64 = dl.base64;
        imageMime = dl.mime;
      }
    }
    const topicName = topicNameFor(String(msg.chat.id), threadId);
    const context = `القناة: ${source.titleAr}${source.moduleId ? ` — المقياس: ${await getModuleName(source.moduleId)}` : ""}${topicName ? ` — الموضوع (Topic): ${topicName}` : ""}${msg.is_topic_message ? " — منشور داخل موضوع منتدى" : ""}`;
    const classifyInput = {
      kind: content.kind, caption: content.caption, fileName: content.fileName,
      ...(imageBase64 ? { imageBase64, imageMimeType: imageMime } : {}),
      context,
    };
    const cls = await classifyItem(classifyInput);
    const captionPlusOcr = [content.caption, cls.extractedText].filter(Boolean).join("\n");

    // --- الكتابة (upsert مع حماية حقول التنقيح) ---
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: existing } = await supabase
        .from("telegram_items")
        .select("id, title_ar")
        .eq("source_id", source.id)
        .eq("tg_message_id", msg.message_id)
        .maybeSingle();

      if (!existing) {
        const { error } = await supabase.from("telegram_items").insert({
          source_id: source.id,
          tg_message_id: msg.message_id,
          media_group_id: content.mediaGroupId,
          kind: content.kind,
          title_ar: cls.title,
          caption_text: captionPlusOcr,
          search_text: buildSearchText(cls.title, captionPlusOcr, content.fileName),
          file_name: content.fileName,
          mime_type: content.mimeType,
          file_id: content.fileId,
          file_unique_id: content.fileUniqueId,
          size_bytes: content.sizeBytes,
          link,
          specialty_id: source.specialtyId,
          module_id: source.moduleId,
          item_type: cls.itemType,
          origin: "telegram",
          posted_by: postedBy,
          cohort_id: source.cohortId,
          is_hidden: false,
          is_featured: false,
          ai_classified: cls.aiClassified,
          posted_at: postedAt,
        });
        if (error) return "ignored";
      } else {
        // تحديث المنشور (تعديل أصحاب القناة أو إعادة إرسال): نحدّث
        // المحتوى والرابط فقط — التنقيح الإداري محمي.
        const patch: Record<string, unknown> = {
          caption_text: captionPlusOcr,
          search_text: buildSearchText(String(existing.title_ar ?? cls.title), captionPlusOcr, content.fileName),
          file_name: content.fileName,
          mime_type: content.mimeType,
          file_id: content.fileId,
          file_unique_id: content.fileUniqueId,
          size_bytes: content.sizeBytes,
          media_group_id: content.mediaGroupId,
          link,
          posted_at: postedAt,
          ai_classified: cls.aiClassified,
        };
        if (!String(existing.title_ar ?? "").trim()) patch.title_ar = cls.title;
        await supabase.from("telegram_items").update(patch).eq("id", Number(existing.id));
      }
      if (update.update_id > source.lastUpdateId) {
        await supabase.from("telegram_sources").update({ last_update_id: update.update_id }).eq("id", source.id);
      }
      return existing ? "updated" : "inserted";
    }

    // --- Prisma (محلي) ---
    const existing = await db.telegramItem.findUnique({
      where: { sourceId_tgMessageId: { sourceId: source.id, tgMessageId: msg.message_id } },
      select: { id: true, titleAr: true },
    });
    if (!existing) {
      await db.telegramItem.create({
        data: {
          sourceId: source.id, tgMessageId: msg.message_id, mediaGroupId: content.mediaGroupId,
          kind: content.kind, titleAr: cls.title, captionText: captionPlusOcr,
          searchText: buildSearchText(cls.title, captionPlusOcr, content.fileName),
          fileName: content.fileName, mimeType: content.mimeType, fileId: content.fileId,
          fileUniqueId: content.fileUniqueId, sizeBytes: content.sizeBytes, link,
          specialtyId: source.specialtyId, moduleId: source.moduleId, itemType: cls.itemType,
          origin: "telegram", postedBy, cohortId: source.cohortId,
          isHidden: false, isFeatured: false, aiClassified: cls.aiClassified,
          postedAt: new Date(postedAt),
        },
      });
    } else {
      await db.telegramItem.update({
        where: { id: existing.id },
        data: {
          captionText: captionPlusOcr,
          searchText: buildSearchText(existing.titleAr || cls.title, captionPlusOcr, content.fileName),
          fileName: content.fileName, mimeType: content.mimeType, fileId: content.fileId,
          fileUniqueId: content.fileUniqueId, sizeBytes: content.sizeBytes,
          mediaGroupId: content.mediaGroupId, link, postedAt: new Date(postedAt),
          aiClassified: cls.aiClassified,
          ...(existing.titleAr ? {} : { titleAr: cls.title }),
        },
      });
    }
    if (update.update_id > source.lastUpdateId) {
      await db.telegramSource.update({ where: { id: source.id }, data: { lastUpdateId: update.update_id } });
    }
    return existing ? "updated" : "inserted";
  } catch {
    return "ignored";
  }
}

/** عنوان مبدئي (يستعمله fallback التصنيف عند غياب المفتاح) */
export function initialTitle(content: { caption: string; fileName: string }): string {
  return firstLineTitle(content.caption, 60) || fileNameToTitle(content.fileName, 60) || "منشور";
}
