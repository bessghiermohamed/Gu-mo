/**
 * Telegram ingest engine (round 7)
 *
 * Turns Telegram bot updates (channel posts + group messages) into
 * telegram_items rows. Works in BOTH deployment modes of this app
 * (Supabase on Vercel / Prisma SQLite locally) — same pattern as all
 * other API routes in this codebase.
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
import type { TgItemKind, TgMessage, TgUpdate, TgChatInfo } from "./types";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
const BOT_TOKEN = () => process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
export const isBotConfigured = () => BOT_TOKEN().length > 20;
const MAX_VISION_BYTES = 8 * 1024 * 1024;

// =============================================================
// Telegram Bot API helpers (REST, no SDK)
// =============================================================

async function botApi<T>(method: string, body: Record<string, unknown>): Promise<{ ok: true; result: T } | { ok: false; description: string }> {
  const token = BOT_TOKEN();
  if (!token) return { ok: false, description: "TELEGRAM_BOT_TOKEN غير مضبوط" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!data.ok) return { ok: false, description: data.description ?? "خطأ غير معروف من تيليجرام" };
    return { ok: true, result: data.result as T };
  } catch (e) {
    return { ok: false, description: (e as Error).message };
  }
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

/** يربط الويبهوك بالنطاق الحالي مع سرّ التحقق */
export async function setWebhook(origin: string): Promise<{ ok: boolean; message: string }> {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!secret) return { ok: false, message: "اضبط TELEGRAM_WEBHOOK_SECRET في متغيرات البيئة أولاً" };
  const r = await botApi<unknown>("setWebhook", {
    url: `${origin}/api/telegram/webhook`,
    secret_token: secret,
    allowed_updates: ["channel_post", "edited_channel_post", "message", "edited_message"],
    drop_pending_updates: true, // نتعامل مع الجديد فقط (اتفاق المستخدم)
  });
  if (!r.ok) return { ok: false, message: `فشل تفعيل الربط: ${r.description}` };
  return { ok: true, message: "تم تفعيل الربط — سيتم استيراد المنشورات الجديدة تلقائياً" };
}

/** تنزيل مؤقت لملف (لتحليل الصور فقط — لا يُخزَّن) */
async function downloadFileBase64(fileId: string): Promise<{ base64: string; mime: string } | null> {
  const token = BOT_TOKEN();
  if (!token) return null;
  const info = await botApi<{ file_path?: string }>("getFile", { file_id: fileId });
  if (!info.ok || !info.result.file_path) return null;
  try {
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${info.result.file_path}`);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_VISION_BYTES) return null;
    return { base64: buf.toString("base64"), mime: res.headers.get("content-type")?.split(";")[0] || "image/jpeg" };
  } catch {
    return null;
  }
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

/** يبني رابط t.me المباشر للمنشور الأصلي */
export function buildDeepLink(source: { tgChannelId: string; tgUsername: string }, messageId: number): string {
  const uname = source.tgUsername.replace(/^@/, "").trim();
  if (uname) return `https://t.me/${uname}/${messageId}`;
  const raw = source.tgChannelId.replace(/^-100/, "");
  return `https://t.me/c/${raw}/${messageId}`;
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

interface SourceLite {
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

/**
 * يعالج تحديثاً واحداً من تيليجرام. يعيد الحالة دائماً ولا يرمي استثناءً.
 */
export async function processTelegramUpdate(update: TgUpdate): Promise<"inserted" | "updated" | "ignored"> {
  try {
    const msg = update.channel_post ?? update.message ?? update.edited_channel_post ?? update.edited_message;
    if (!msg?.chat?.id) return "ignored";
    const isEdit = !!(update.edited_channel_post ?? update.edited_message);
    // تجاهل رسائل البوتات (حماية من حلقات)
    if (msg.from?.is_bot) return "ignored";

    const source = await loadSourceByChatId(String(msg.chat.id));
    if (!source || !source.isActive) return "ignored";

    const content = parseMessageContent(msg);
    if (!content.kind) return "ignored";

    const link = buildDeepLink(source, msg.message_id);
    const postedAt = new Date(msg.date * 1000).toISOString();
    const postedBy = msg.from ? (msg.from.first_name || msg.from.username || "") : "";

    // --- التصنيف (Gemini ثم fallback محلي) ---
    const wantsVision =
      content.kind === "image" && !!content.fileId && isGeminiConfigured() && isBotConfigured() && content.sizeBytes <= MAX_VISION_BYTES;
    let imageBase64: string | undefined;
    let imageMime: string | undefined;
    if (wantsVision) {
      const dl = await downloadFileBase64(content.fileId);
      if (dl) {
        imageBase64 = dl.base64;
        imageMime = dl.mime;
      }
    }
    const context = `القناة: ${source.titleAr}${source.moduleId ? ` — المقياس: ${await getModuleName(source.moduleId)}` : ""}`;
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
