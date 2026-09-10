/**
 * Module matching (round 64) — ربط منشورات تيليجرام بالمقاييس.
 *
 * المشكلة التي يحلها هذا الملف:
 *   التصنيف الذكي (r7) كان يحدد «النوع» فقط (محاضرة/امتحان…) بينما الربط
 *   بالمقياس كان مقيّداً بالمصدر كله (قيمة واحدة أو NULL). مصدر منتدى مثل
 *   ENS يحتوي مقاييس وسنوات متعددة في مواضيع مختلفة، فبقي كل منشوراته
 *   بلا مقياس — وفلترة «المقياس» في المكتبة تستبعد module_id NULL، فيعجز
 *   الطالب عن إيجاد منشور صنّفه البوت صحيحاً.
 *
 * الحل:
 *   1) تحميل قائمة مقاييس التخصص (مع أسماء السنوات) — كاش 60 ثانية.
 *   2) مطابقة اسم مقياس يعيده الذكاء الاصطناعي (أو موجود في نص المنشور)
 *      على القائمة بنصٍّ مطبَّع، مع كسر التعادل بذكر السنة في السياق.
 *   3) يُستعمل في الاستيراد (ingest) وعند «إعادة التصنيف»، ولا يمسّ أبداً
 *      ربطاً إدارياً يدوياً (المقياس المضبوط من المشرف يفوز دائماً).
 *
 * هذا الملف لا يرمي استثناءً أبداً — الفشل يعني «لا مطابقة».
 */

import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeArabic } from "./normalize";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export interface ModuleCandidate {
  id: number;
  name: string;
  /** اسم السنة الدراسية للمقياس (للعرض في البرومبت وكسر التعادل) */
  yearName: string;
}

/** كاش مثيل 60 ثانية — خادم Vercel بلا حالة لكن الويبهوك يتكرر خلال ثوانٍ */
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; list: ModuleCandidate[] }>();

/**
 * مقاييس تخصصٍ ما (مع اسم السنة لكل مقياس). yearId اختياري لتضييق
 * النطاق حين يكون المصدر مربوطاً بسنة محددة.
 *
 * r70 (track fix): trackId اختياري كذلك — حين يكون المصدر مربوطاً بملمح
 * محدد تُستبعد مقاييس الملامح الأخرى (يبقى المشترك NULL). أسماء السنوات
 * تُوسَم بكود الممح («السنة الثانية (PEM)») حتى يميز البرومبتُ والمطابقةُ
 * بين سنتين تحملان الاسم نفسه في ملامح مختلفة.
 */
export async function loadModuleCandidates(
  specialtyId: number,
  yearId: number | null = null,
  trackId: number | null = null
): Promise<ModuleCandidate[]> {
  const key = `${specialtyId}:${yearId ?? 0}:${trackId ?? 0}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.list;

  let list: ModuleCandidate[] = [];
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      let q = supabase
        .from("module_courses")
        .select("id, name, academic_year_id")
        .eq("specialty_id", specialtyId);
      if (yearId != null) q = q.eq("academic_year_id", yearId);
      // r70: NULL-track modules are shared across tracks (house convention)
      if (trackId != null) q = q.or(`track_id.is.null,track_id.eq.${trackId}`);
      const { data: mods } = await q;
      const yearIds = Array.from(
        new Set((mods ?? []).map((m: Record<string, unknown>) => Number(m.academic_year_id)).filter((y) => y > 0))
      );
      const yearNames = new Map<number, string>();
      if (yearIds.length > 0) {
        const { data: years } = await supabase
          .from("academic_years")
          .select("id, year_name, track_id")
          .in("id", yearIds);
        const trackIds = Array.from(
          new Set((years ?? []).map((y: Record<string, unknown>) => (y.track_id != null ? Number(y.track_id) : 0)).filter((t) => t > 0))
        );
        const trackCodes = new Map<number, string>();
        if (trackIds.length > 0) {
          const { data: tracks } = await supabase
            .from("academic_tracks")
            .select("id, code")
            .in("id", trackIds);
          for (const t of tracks ?? []) {
            const r = t as Record<string, unknown>;
            trackCodes.set(Number(r.id), String(r.code ?? ""));
          }
        }
        for (const y of years ?? []) {
          const row = y as Record<string, unknown>;
          const code = row.track_id != null ? trackCodes.get(Number(row.track_id)) ?? "" : "";
          // r70: سَم السنة بكود الممح — «السنة الثانية (PEM)» تميّزها عن PEP
          yearNames.set(
            Number(row.id),
            code ? `${String(row.year_name ?? "")} (${code})` : String(row.year_name ?? "")
          );
        }
      }
      list = (mods ?? []).map((m: Record<string, unknown>) => ({
        id: Number(m.id),
        name: String(m.name ?? "").trim(),
        yearName: yearNames.get(Number(m.academic_year_id)) ?? "",
      })).filter((m) => m.name);
    } else {
      const mods = await db.moduleCourse.findMany({
        where: {
          specialtyId,
          ...(yearId != null ? { academicYearId: yearId } : {}),
          ...(trackId != null ? { OR: [{ trackId: null }, { trackId }] } : {}),
        },
        select: { id: true, name: true, academicYearId: true },
      });
      const years = await db.academicYear.findMany({
        where: { specialtyId },
        select: { id: true, yearName: true, trackId: true },
      });
      const tracks = await db.academicTrack.findMany({
        where: { specialtyId },
        select: { id: true, code: true },
      });
      const trackCodes = new Map(tracks.map((t) => [t.id, t.code]));
      const yearNames = new Map(
        years.map((y) => [y.id, y.trackId != null && trackCodes.get(y.trackId) ? `${y.yearName} (${trackCodes.get(y.trackId)})` : y.yearName])
      );
      list = mods
        .map((m) => ({
          id: m.id,
          name: m.name.trim(),
          yearName: yearNames.get(m.academicYearId ?? -1) ?? "",
        }))
        .filter((m) => m.name);
    }
  } catch {
    list = [];
  }
  cache.set(key, { at: Date.now(), list });
  return list;
}

/** اسم مقياس بمعرّفه — لعرض نتيجة الفحص (أفضل جهد) */
export async function moduleById(id: number): Promise<ModuleCandidate | null> {
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase.from("module_courses").select("id, name, academic_year_id").eq("id", id).maybeSingle();
      if (!data) return null;
      const r = data as Record<string, unknown>;
      let yearName = "";
      const yid = Number(r.academic_year_id ?? 0);
      if (yid > 0) {
        const { data: y } = await supabase.from("academic_years").select("year_name").eq("id", yid).maybeSingle();
        yearName = y ? String((y as Record<string, unknown>).year_name ?? "") : "";
      }
      return { id, name: String(r.name ?? ""), yearName };
    }
    const m = await db.moduleCourse.findUnique({ where: { id }, select: { id: true, name: true, academicYearId: true } });
    if (!m) return null;
    const y = m.academicYearId ? await db.academicYear.findUnique({ where: { id: m.academicYearId }, select: { yearName: true } }) : null;
    return { id: m.id, name: m.name, yearName: y?.yearName ?? "" };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------
// المطابقة — كلها نقية (بلا شبكة/قاعدة) وتُختبر وحدوياً
// ------------------------------------------------------------

/** هل تُذكر سنة هذا المقياس في النص؟ (كسر التعادل بين مقياسين بنفس الاسم)
 *  يقبل الصيغتين: «السنة الثانية» و«للسنة الثانية / بالسنة الثانية» (تجريد «ال»). */
function yearHinted(c: ModuleCandidate, hayNormalized: string): boolean {
  const yn = normalizeArabic(c.yearName);
  if (yn.length < 4) return false;
  if (hayNormalized.includes(yn)) return true;
  const stem = yn.replace(/^ال/, "");
  return stem.length >= 4 && hayNormalized.includes(stem);
}

/** يجرد «ال» التعريف من بداية اسم مطبَّع — «النحو والتطبيق» → «نحو والتطبيق»
 *  حتى يطابق «ادب جاهلي» مقياس «الأدب الجاهلي» حين يحذفها النموذج أو الكاتب. */
function stem(normalizedName: string): string {
  return normalizedName.replace(/^ال/, "");
}

/** كلمات الاسم بعد تجريد «ال» من كل كلمة أطول من ٣ أحرف —
 *  «الأدب الجاهلي» → [ادب، جاهلي] — مقارنة الاحتواء كلمة بكلمة أدق من
 *  الاحتواء الحرفي حين يختلف تعريف الكلمات (الادب الجاهلي ضد ادب جاهلي). */
function tokenStems(normalizedName: string): string[] {
  return normalizedName
    .split(/\s+/)
    .map((w) => (w.length > 3 && w.startsWith("ال") ? w.slice(2) : w))
    .filter(Boolean);
}

/** هل تتتالى كلمات الأقصر (a) داخل الأطول (b) بالترتيب نفسه؟ */
function tokensContained(short: string[], long: string[]): boolean {
  if (short.length === 0 || long.length === 0) return false;
  const [a, b] = short.length <= long.length ? [short, long] : [long, short];
  outer: for (let i = 0; i + a.length <= b.length; i++) {
    for (let j = 0; j < a.length; j++) {
      if (a[j] !== b[i + j]) continue outer;
    }
    return true;
  }
  return false;
}

function pickBest(hits: ModuleCandidate[], contextText: string): ModuleCandidate | null {
  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0];
  const hay = normalizeArabic(contextText);
  const hinted = hits.filter((c) => yearHinted(c, hay));
  return (hinted.length > 0 ? hinted : hits)[0];
}

/**
 * يطابق اسماً أعاده الذكاء الاصطناعي على قائمة المقاييس:
 * تطابق مطبَّع تام أولاً، ثم احتواء جزئي (طرف واحد داخل الآخر، ≥ 4 حروف)،
 * ثم كسر التعادل بذكر السنة في نص السياق.
 */
export function resolveModuleByName(
  candidates: ModuleCandidate[],
  rawName: string,
  contextText = ""
): ModuleCandidate | null {
  const target = normalizeArabic(rawName);
  if (!target || candidates.length === 0) return null;

  const exact = candidates.filter((c) => normalizeArabic(c.name) === target);
  if (exact.length > 0) return pickBest(exact, contextText);

  if (target.length < 4) return null; // اسم قصير جداً لا يُطابق جزئياً
  const tTokens = tokenStems(target);
  const partial = candidates.filter((c) => {
    const n = normalizeArabic(c.name);
    if (n.length < 4) return false;
    if (target.includes(n) || n.includes(target)) return true;
    return tokensContained(tTokens, tokenStems(n));
  });
  return pickBest(partial, contextText);
}

/**
 * مطابقة محلية (بلا ذكاء اصطناعي): يبحث عن اسم مقياس كاملاً داخل نص
 * المنشور/الملف — fallback موثوق حين لا يوجد مفتاح Gemini أو فشل.
 */
export function inferModuleFromText(
  candidates: ModuleCandidate[],
  text: string
): ModuleCandidate | null {
  const hay = normalizeArabic(text);
  if (!hay || candidates.length === 0) return null;
  const hits = candidates.filter((c) => {
    const n = normalizeArabic(c.name);
    if (n.length < 4) return false;
    if (hay.includes(n)) return true;
    const s = stem(n);
    return s.length >= 4 && hay.includes(s);
  });
  return pickBest(hits, hay);
}

/** نص المرشحين للبرومبت: «النحو والتطبيق (السنة الأولى)، …» */
export function formatCandidatesForPrompt(candidates: ModuleCandidate[], max = 40): string {
  return candidates
    .slice(0, max)
    .map((c) => (c.yearName ? `${c.name} (${c.yearName})` : c.name))
    .join("، ");
}

// ------------------------------------------------------------
// r65: بوابة «المحتوى الدراسي» — pure logic
// هل هذا المنشور مادة دراسية تخص مقياساً، أم مجرد ذِكر عرضي
// لمقياس داخل نقاش؟ مثال المالك: «لدينا 10 مقاييس لكن ليست
// الهندسة المعمارية» — تذكر مقياساً لكنها ليست محتواه، فلا
// يضيفها البوت ولا يصنفها.
// ------------------------------------------------------------

/** كلمات نفي/استثناء إذا سبقت اسم المقياس مباشرة → ذِكر عرضي لا محتوى */
const NEGATION_WORDS_RAW = [
  "ليس", "ليست", "ليسا", "ليسوا", "لسنا", "بدون", "بلا", "عدا", "خلا",
  "باستثناء", "لا يشمل", "لا نتناول", "لا ندرس", "لا يوجد", "ليست من",
  "ليس من", "ما عدا", "ما خلا", "ناقص", "غير متوفر", "لا نوفر", "ليس لدينا",
];
/** النسخة المطبَّعة (همزات…) للمقارنة مع نص مطبَّع */
const NEGATION_WORDS = NEGATION_WORDS_RAW.map((w) => normalizeArabic(w)).filter(Boolean);

/** كلمة داخل نافذة النفي: القصيرة بحدود كلمة، والعبارة باحتواء عادي */
function negationInWindow(before: string): boolean {
  for (const w of NEGATION_WORDS) {
    if (w.includes(" ")) {
      if (before.includes(w)) return true;
    } else if (w.length <= 3) {
      if (new RegExp(`(^|\\s)${w}(\\s|$)`).test(before)) return true;
    } else if (before.includes(w)) {
      return true;
    }
  }
  return false;
}

/** هل يظهر نفي/استثناء قبل اسم المقياس (نافذة 24 حرفاً قبله)؟ */
function negatedBeforeMention(hayNormalized: string, probe: string): boolean {
  let idx = hayNormalized.indexOf(probe);
  while (idx !== -1) {
    const before = hayNormalized.slice(Math.max(0, idx - 24), idx);
    if (negationInWindow(before)) return true;
    idx = hayNormalized.indexOf(probe, idx + 1);
  }
  return false;
}

/**
 * البوابة المحلية (بلا ذكاء اصطناعي): يعتمد القرار على
 *  1) مرفق ملف/وسائط → محتوى بالتعريف
 *  2) لا مقياس مطابق → ليس محتوى دراسياً (ترحيب، اجتماع، نقاش…)
 *  3) نفي يسبق المقياس → ذِكر عرضي («… لكن ليست الهندسة»)
 *  4) نص طويل يستوعب المقياس ذكراً جانبياً (تغطية منخفضة) → نقاش
 */
export function looksLikeCourseContent(args: {
  text: string;
  fileName: string;
  moduleName: string;
  hasMedia: boolean;
}): boolean {
  const { text, fileName, moduleName, hasMedia } = args;
  // ملف/وسائط مرفقة = محتوى بالتعريف (PDF محاضرة، صورة امتحان…)
  // (r66: حراسة من مدخلات ناقصة — السلوك نفسه)
  if ((fileName ?? "").trim() || hasMedia) return true;
  // بلا مقياس مطابق = ليس محتوى دراسياً
  if (!(moduleName ?? "").trim()) return false;

  const hay = normalizeArabic(text ?? "");
  const name = normalizeArabic(moduleName);
  if (!hay || !name) return false;

  // نفي/استثناء يسبق اسم المقياس → ذِكر عرضي لا محتوى
  const stemName = name.replace(/^ال/, "");
  const probes = name.length >= 4 && stemName.length >= 4 ? [name, stemName] : [name];
  for (const probe of probes) {
    if (negatedBeforeMention(hay, probe)) return false;
  }

  // المقياس لا يظهر في نص المنشور نفسه (المطابقة جاءت من سياق القناة
  // أو اسم الموضوع) — المنشور لا يدل بذاته على مقياس → ليس محتوى دراسياً
  if (probeLen(hay, probes) === 0) return false;

  // نص طويل والتغطية منخفضة → المقياس ذِكر جانبي في نقاش
  const words = hay.split(/\s+/).filter(Boolean);
  const coverage = probeLen(hay, probes) / Math.max(hay.length, 1);
  if (words.length > 14 && coverage < 0.25) return false;

  return true;
}

/** طول أطول ظهور لمقاطع المقياس داخل النص (لتقدير التغطية) */
function probeLen(hay: string, probes: string[]): number {
  let best = 0;
  for (const p of probes) {
    if (p.length > best && hay.includes(p)) best = p.length;
  }
  return best;
}
