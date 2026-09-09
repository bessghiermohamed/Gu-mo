/**
 * Topic bindings (round 65) — روابط مواضيع القنوات.
 *
 * الفكرة: القنوات/المنتديات الكبيرة (مثل ENS) منظمة في مواضيع
 * (topics): عام، سنة أولى، سنة ثانية، مقياس محدد… بدل ترك البوت
 * يخمّن نطاق كل منشور من نصه وحده، يربط المشرف كل موضوع برابطه
 * ونطاقه الأكاديمي مرة واحدة — فيصبح تصنيف منشورات الموضوع
 * حتمياً:
 *   • موضوع مربوط بمقياس  → كل منشوراته تحت هذا المقياس مباشرة
 *   • موضوع مربوط بسنة    → مقاييس الترشيح تقتصر على مقاييس السنة
 *   • موضوع «عام»         → منشوراته لا تُضاف أصلاً (ليست دراسية)
 *
 * التخزين: جدول telegram_topics (Prisma محلياً / Supabase على
 * Vercel). إن لم يُنشأ الجدول بعد (نفّذ supabase_telegram_topics.sql)
 * تعيد كل الدوال قائمة فارغة بصمت — سلوك ما قبل r65 تماماً،
 * لا ينكسر شيء أبداً.
 */

import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export interface TopicBinding {
  id: number;
  sourceId: number;
  tgThreadId: number;
  titleAr: string;
  link: string;
  yearId: number | null;
  moduleId: number | null;
  isGeneral: boolean;
}

/** كاش مثيل 60 ثانية — الويبهوك يتكرر خلال ثوانٍ على نفس المصدر */
const CACHE_TTL_MS = 60_000;
const cache = new Map<number, { at: number; list: TopicBinding[] }>();

/** يقرأ روابط مواضيع مصدر ما (قائمة فارغة عند أي فشل/جدول غائب) */
export async function loadTopicBindings(sourceId: number): Promise<TopicBinding[]> {
  const hit = cache.get(sourceId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.list;

  let list: TopicBinding[] = [];
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("telegram_topics")
        .select("id, source_id, tg_thread_id, title_ar, link, year_id, module_id, is_general")
        .eq("source_id", sourceId)
        .order("tg_thread_id", { ascending: true });
      if (error) {
        // الجدول غير منشأ غالباً — سلوك ما قبل r65 (بلا روابط مواضيع)
        cache.set(sourceId, { at: Date.now(), list });
        return list;
      }
      list = (data ?? []).map((r: Record<string, unknown>) => ({
        id: Number(r.id),
        sourceId: Number(r.source_id),
        tgThreadId: Number(r.tg_thread_id),
        titleAr: String(r.title_ar ?? ""),
        link: String(r.link ?? ""),
        yearId: r.year_id == null ? null : Number(r.year_id),
        moduleId: r.module_id == null ? null : Number(r.module_id),
        isGeneral: !!r.is_general,
      }));
    } else {
      const rows = await db.telegramTopic.findMany({
        where: { sourceId },
        orderBy: { tgThreadId: "asc" },
      });
      list = rows.map((r) => ({
        id: r.id,
        sourceId: r.sourceId,
        tgThreadId: r.tgThreadId,
        titleAr: r.titleAr,
        link: r.link,
        yearId: r.yearId,
        moduleId: r.moduleId,
        isGeneral: r.isGeneral,
      }));
    }
  } catch {
    list = [];
  }
  cache.set(sourceId, { at: Date.now(), list });
  return list;
}

/** يبطل كاش الروابط (بعد أي تعديل إداري) — الكل أو مصدر بعينه */
export function invalidateTopicCache(sourceId?: number): void {
  if (sourceId == null) cache.clear();
  else cache.delete(sourceId);
}

/**
 * يقرأ رقم الموضوع (thread id) من رابط تيليجرام أو من رقم مجرد:
 *   https://t.me/c/123456789/12        → 12
 *   https://t.me/channel_name/12       → 12
 *   https://t.me/c/123456789/12/345    → 12 (رابط رسالة داخل موضوع)
 *   t.me/name/12                       → 12
 *   12                                 → 12
 */
export function parseTopicHandle(input: string): { threadId?: number; error?: string } {
  const s = (input ?? "").trim();
  if (!s) return {};
  if (/^\d{1,10}$/.test(s)) return { threadId: parseInt(s, 10) };
  const m = s.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/(?:c\/\d+|[A-Za-z0-9_]{4,})\/(\d{1,10})(?:\/\d{1,10})?/i);
  if (m) return { threadId: parseInt(m[1], 10) };
  return {
    error: "تعذّر قراءة رقم الموضوع — الصق رابط الموضوع (مثل t.me/القناة/12) أو رقم الموضوع مباشرة",
  };
}
