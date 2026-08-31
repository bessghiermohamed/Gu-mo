/**
 * Telegram Lessons — shared types (round 7)
 *
 * The app treats Telegram as a SOURCE of academic content:
 * sources (channels/groups) are mapped onto the existing academic
 * hierarchy (specialty → year → semester → module) or onto a cohort
 * (مساحة الفوج المشتركة), and every imported post becomes an item
 * that stores metadata + a deep link to the ORIGINAL message.
 */

export type TgSourceType = "channel" | "group";
export type TgSourceKind = "public" | "private";
export type TgItemKind =
  | "pdf"
  | "doc"
  | "ppt"
  | "image"
  | "video"
  | "audio"
  | "text"
  | "link"
  | "other";

/** ثابت القيم المسموح بها لنوع المحتوى الأكاديمي (يعرض للطلبة) */
export const TG_ITEM_TYPES = [
  "محاضرة",
  "أعمال موجهة TD",
  "تمارين",
  "امتحان",
  "ملخص",
  "كتاب",
  "إعلان",
  "عام",
] as const;
export type TgItemType = (typeof TG_ITEM_TYPES)[number];

export interface TelegramSourceRow {
  id: number;
  tgChannelId: string;
  tgUsername: string;
  titleAr: string;
  sourceType: TgSourceType;
  kind: TgSourceKind;
  institutionId: number | null;
  specialtyId: number;
  trackId: number | null;
  yearId: number | null;
  semester: number | null;
  moduleId: number | null;
  cohortId: number | null;
  isActive: boolean;
  lastUpdateId: number;
  itemCount?: number;
  createdAt?: string;
}

export interface TelegramItemRow {
  id: number;
  sourceId: number | null;
  tgMessageId: number;
  mediaGroupId: string;
  kind: TgItemKind;
  titleAr: string;
  captionText: string;
  fileName: string;
  mimeType: string;
  fileId: string;
  sizeBytes: number;
  link: string;
  specialtyId: number;
  moduleId: number | null;
  moduleName?: string | null;
  itemType: TgItemType;
  origin: "telegram" | "manual";
  postedBy: string;
  cohortId: number | null;
  isHidden: boolean;
  isFeatured: boolean;
  aiClassified: boolean;
  postedAt: string | null;
  sourceTitle?: string | null;
  sourceUsername?: string | null;
}

/** إعداد البيئة (يعرض في لوحة الإدارة) */
export interface TelegramSetupStatus {
  botConfigured: boolean;
  geminiConfigured: boolean;
  webhook: {
    url: string;
    pendingUpdateCount: number;
    lastErrorMessage: string;
  } | null;
}

// ------------------------------------------------------------
// Telegram Bot API payload shapes (only the fields we use)
// ------------------------------------------------------------

interface TgUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
}

interface TgChat {
  id: number;
  type?: string; // "channel" | "group" | "supergroup" | "private"
  title?: string;
  username?: string;
}

export interface TgPhotoSize {
  file_id: string;
  file_unique_id: string;
  width?: number;
  height?: number;
  file_size?: number;
}

export interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  date: number;
  edit_date?: number;
  text?: string;
  caption?: string;
  media_group_id?: string;
  photo?: TgPhotoSize[];
  video?: { file_id: string; file_unique_id: string; file_name?: string; mime_type?: string; file_size?: number };
  audio?: { file_id: string; file_unique_id: string; file_name?: string; mime_type?: string; file_size?: number };
  voice?: { file_id: string; file_unique_id: string; mime_type?: string; file_size?: number };
  document?: { file_id: string; file_unique_id: string; file_name?: string; mime_type?: string; file_size?: number };
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  channel_post?: TgMessage;
  edited_channel_post?: TgMessage;
}

export interface TgChatInfo {
  id: number;
  type?: string;
  title?: string;
  username?: string;
}
