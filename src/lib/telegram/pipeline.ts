/**
 * Content-intelligence pipeline (round 71) — العقل الجامع للتصنيف الذكي.
 *
 * INGEST → EXTRACT → UNDERSTAND → MATCH → INFER → VALIDATE → CLASSIFY
 *        → MODERATE → PUBLISH
 *
 * WHAT CHANGED vs r7–r70 (why this file exists):
 *   The old classifier answered ONE question («أي مقياس؟») and glued every
 *   other signal into the title. Live production proof (r71 probe):
 *   «ملخص النحو العربي سنة أولى» was filed into module #13 — النحو العربي
 *   of السنة الثانية — because module candidates were pre-narrowed to the
 *   SOURCE's year and the «سنة أولى» in the post text was never parsed.
 *   First-year students consequently saw ONE library item out of 23.
 *
 * THIS MODULE adds the missing brain, deterministically FIRST:
 *   1. EXTRACT  — regex parse of year / track / semester / lesson / type
 *                 tokens from caption + filename (+ OCR text). Zero AI cost.
 *   2. MATCH    — curriculum-as-knowledge over the FULL specialty module
 *                 list (all years + tracks, labeled), with year/track
 *                 preference and conflict detection.
 *   3. VALIDATE — extracted metadata vs matched module's real year/track,
 *                 vs source binding; every disagreement lowers confidence.
 *   4. SCORE    — confidence 0..100 from named components (documented in
 *                 class_meta so the admin sees WHY).
 *   5. DECIDE   — publish (≥70) / needs review (40..69) / skip (<40 for
 *                 library sources). Cohort spaces keep the r67 promise:
 *                 always visible to the cohort, flagged for review when
 *                 uncertain.
 *
 * Purity: extraction + scoring + matching preference logic are pure
 * functions (unit-tested in scripts/r71-test-pipeline.ts). Persistence and
 * AI calls stay in classify.ts / ingest.ts / items route.
 */

import type { ModuleCandidate } from "./module-match";
import { normalizeArabic } from "./normalize";

// ============================================================
// 1. EXTRACTION — deterministic Arabic metadata parsing
// ============================================================

export interface ExtractedMeta {
  /** «السنة الأولى» → 1 … «السنة الثالثة» → 3. null = لم تُذكر */
  yearOrdinal: number | null;
  /** "PEP" | "PEM" | "PES" | null — from ملمح/مسار mentions */
  trackCode: string | null;
  /** 1 | 2 | null — السداسي/الفصل */
  semester: number | null;
  /** اسم درس محتمل مذكور في النص (ليس اسم مقياس) */
  lessonHint: string | null;
  /** نوع المحتوى إن ذُكر صريحاً (ملخص/امتحان/…) */
  typeHint: string | null;
}

/** تطبيع بديل نمطٍ بنفس طبّاع نص البحث (همزات/ة/ى…) — حتى لا يفلت
 *  «الابتدائي» (ئ→ي بعد التطبيع) من مطابقةِ نمطٍ كُتب خاماً. */
const N = (s: string) => normalizeArabic(s);

/** «الأولى/الأول/1» → 1 … يعمل على الأرقام والحروف العربية والفرنسية */
const YEAR_WORD_MAP: Array<{ re: RegExp; ord: number }> = [
  { re: new RegExp(`(السنه|سنه|انى|annee)\\s*(${N("الأولى")}|${N("الاولى")}|${N("الأول")}|${N("الاول")}|${N("اولى")}|${N("أولى")}|${N("أول")}|1|${N("اول")}|premiere|1re|1ere)`, "i"), ord: 1 },
  { re: new RegExp(`(السنه|سنه|انى|annee)\\s*(${N("الثانية")}|${N("الثانيه")}|${N("ثانية")}|${N("ثانيه")}|${N("الثاني")}|${N("ثاني")}|2|deuxieme|2eme)`, "i"), ord: 2 },
  { re: new RegExp(`(السنه|سنه|انى|annee)\\s*(${N("الثالثة")}|${N("الثالثه")}|${N("ثالثة")}|${N("ثالثه")}|${N("الثالث")}|${N("ثالث")}|3|troisieme|3eme)`, "i"), ord: 3 },
];

const TRACK_PATTERNS: Array<{ re: RegExp; code: string }> = [
  { re: new RegExp(`(ملمح|الممح|مسار|المسار|شعبة|الشعبة|فرع|الفرع)?\\s*(${N("الابتدائي")}|${N("ابتدائي")}|${N("الابتدائية")}|${N("ابتدائية")}|pep|p\\.e\\.p)`, "i"), code: "PEP" },
  { re: new RegExp(`(ملمح|الممح|مسار|المسار|شعبة|الشعبة|فرع|الفرع)?\\s*(${N("المتوسط")}|${N("متوسط")}|${N("المتوسطة")}|${N("متوسطة")}|pem|p\\.e\\.m)`, "i"), code: "PEM" },
  { re: new RegExp(`(ملمح|الممح|مسار|المسار|شعبة|الشعبة|فرع|الفرع)?\\s*(${N("الثانوي")}|${N("ثانوي")}|${N("الثانوية")}|${N("ثانوية")}|pes|p\\.e\\.s)`, "i"), code: "PES" },
];

const SEMESTER_PATTERNS: Array<{ re: RegExp; sem: number }> = [
  { re: new RegExp(`(${N("السداسي")}|${N("سداسي")}|${N("الفصل")}|${N("فصل")}|semestre|semester)\\s*(${N("الأول")}|${N("الأولى")}|${N("اول")}|1)`, "i"), sem: 1 },
  { re: new RegExp(`(${N("السداسي")}|${N("سداسي")}|${N("الفصل")}|${N("فصل")}|semestre|semester)\\s*(${N("الثاني")}|${N("الثانية")}|${N("ثاني")}|2)`, "i"), sem: 2 },
];

const TYPE_EXTRACT: Array<{ re: RegExp; type: string }> = [
  { re: new RegExp(`(${N("ملخص")}|${N("ملخصات")}|resume|${N("فريز")}|fiche)`, "i"), type: "ملخص" },
  { re: new RegExp(`(${N("امتحان")}|${N("إمتحان")}|${N("فرض")}|${N("اختبار")}|${N("فحص")}|exam|devoir|controle|rattrapage)`, "i"), type: "امتحان" },
  { re: new RegExp(`(${N("اعمال موجهه")}|${N("أعمال موجهة")}|${N("أعمال تطبيقية")}|td\\b)`, "i"), type: "أعمال موجهة TD" },
  { re: new RegExp(`(${N("تمرين")}|${N("تمارين")}|${N("سلسلة")}|${N("سلاسل")}|exercice|serie)`, "i"), type: "تمارين" },
  { re: new RegExp(`(${N("محاضرة")}|${N("محاضرات")}|${N("درس")}|${N("دروس")}|cours|lecture)`, "i"), type: "محاضرة" },
  { re: new RegExp(`(${N("كتاب")}|${N("كتب")}|${N("مرجع")}|biblio|book|${N("رواية")})`, "i"), type: "كتاب" },
];

/** r71: تجريد البيانات الوصفية من العنوان — نسخة بالرموز (tokens)
 *  بدل regex خام: تطبيع كل كلمة (همزات/تشكيل/ة→ه/ى→ي) قبل المقارنة
 *  فلا تفلت الصيغ («أولى» بلا «ال» كانت تفلت من regex r71 الأول).
 *  الأرقام المجردة تبقى (جزء من أسماء المقاييس: «إنجليزية 1»). */
const YEAR_HEAD_RE = /^(و)?(بال|لل)?(ال)?سنه$/; // «السنة/سنة/للسنة/بالسنة…» مطبَّعة
const YEAR_ORDINALS = new Set([...["الأولى", "الاولى", "اولى", "أولى", "الأول", "الاول", "اول", "أول", "الثانية", "الثانيه", "ثانية", "ثانيه", "الثاني", "ثاني", "الثالثة", "الثالثه", "ثالثة", "ثالثه", "الثالث", "ثالث", "1", "2", "3"].map(N)]);
const TRACK_HEAD_RE = /^(و)?(بال|لل)?(ال)?(ملمح|مسار)$/; // «ملمح/الممح/المسار…»
const TRACK_WORDS = new Set(["pep", "pem", "pes", ...["ابتدائي", "الابتدائي", "ابتدائية", "الابتدائية", "ابتدائيه", "المتوسط", "متوسط", "المتوسطة", "متوسطة", "الثانوي", "ثانوي", "الثانوية", "ثانوية", "ثانويه"].map(N)]);
const SEM_HEAD_RE = /^(و)?(بال|لل)?(ال)?(سداسي|فصل)$/; // «السداسي/الفصل…»

/** يجرد «سنة أولى»/«ملمح ابتدائي»/«pep»/«الفصل الثاني» من العنوان.
 *  مثال المالك: «ملخص الإنجليزية - سنة أولى - ملمح ابتدائي» → «ملخص الإنجليزية». */
export function cleanTitle(rawTitle: string): string {
  let t = (rawTitle ?? "").trim();
  if (!t) return "";
  const rawTokens = t.split(/\s+/);
  const norm = (w: string) => normalizeArabic(w).toLowerCase();
  const keep: boolean[] = rawTokens.map(() => true);

  for (let i = 0; i < rawTokens.length; i++) {
    const n = norm(rawTokens[i]);
    const next = i + 1 < rawTokens.length ? norm(rawTokens[i + 1]) : "";
    // «سنة أولى» / «السنة الثانية» / «سنة 1» — الكلمة مع ترتيبها التالي
    if (YEAR_HEAD_RE.test(n) && next && YEAR_ORDINALS.has(next)) {
      keep[i] = false;
      keep[i + 1] = false;
      continue;
    }
    // «ملمح ابتدائي» / «مسار PEP» — كلمة الممح مع قيمتها
    if (TRACK_HEAD_RE.test(n) && next && TRACK_WORDS.has(next)) {
      keep[i] = false;
      keep[i + 1] = false;
      continue;
    }
    // «الفصل الثاني» / «السداسي الأول»
    if (SEM_HEAD_RE.test(n) && next && YEAR_ORDINALS.has(next)) {
      keep[i] = false;
      keep[i + 1] = false;
      continue;
    }
    // كلمة ممح مستقلة (metadata حتى بلا «ملمح»): «ابتدائي»/«pep»
    if (TRACK_WORDS.has(n)) {
      keep[i] = false;
      continue;
    }
    // «pep» ملتصقة بعلامة: «1 pep» — الكلمة نفسها أعلاه تكفي بعد التطبيع
  }

  t = rawTokens.filter((_, idx) => keep[idx]).join(" ");
  // فوارق متتالية بقيت بعد الجرد (« - - ») تنهار لفراغ واحد، ثم الفوارق
  // المعلّقة على الأطراف والفراغات المزدوجة
  t = t.replace(/(?:\s*[-\u2013\u2014:،|]){2,}/g, " ");
  t = t.replace(/\s*[-\u2013\u2014:،|]\s*$/g, "");
  t = t.replace(/^\s*[-\u2013\u2014:،|]\s*/g, "");
  t = t.replace(/\s*[-\u2013\u2014:،|]\s{2,}/g, " - ");
  t = t.replace(/\s{2,}/g, " ").trim();
  return t;
}

/** يستخرج البيانات الوصفية من نص موحّد (بلا تشكيل) */
export function extractMeta(text: string): ExtractedMeta {
  const hay = normalizeArabic(text);
  let yearOrdinal: number | null = null;
  for (const { re, ord } of YEAR_WORD_MAP) {
    if (re.test(hay)) { yearOrdinal = ord; break; }
  }
  let trackCode: string | null = null;
  for (const { re, code } of TRACK_PATTERNS) {
    if (re.test(hay)) { trackCode = code; break; }
  }
  let semester: number | null = null;
  for (const { re, sem } of SEMESTER_PATTERNS) {
    if (re.test(hay)) { semester = sem; break; }
  }
  let typeHint: string | null = null;
  for (const { re, type } of TYPE_EXTRACT) {
    if (re.test(hay)) { typeHint = type; break; }
  }
  return { yearOrdinal, trackCode, semester, lessonHint: null, typeHint };
}


// ============================================================
// 2+3. MATCHING PREFERENCE + VALIDATION (curriculum as knowledge)
// ============================================================

/** سنة المقياس بالأرقام: «السنة الأولى (PEP)» → 1 */
export function yearOrdinalOf(c: ModuleCandidate): number | null {
  const m = c.yearName.match(/(الأولى|الاولى|الاول|الثانية|الثانيه|الثاني|الثالثة|الثالث|1|2|3)/);
  if (!m) return null;
  switch (m[1]) {
    case "الأولى": case "الاولى": case "الاول": case "1": return 1;
    case "الثانية": case "الثانيه": case "الثاني": case "2": return 2;
    case "الثالثة": case "الثالث": case "3": return 3;
  }
  return null;
}

/** كود الممح من اسم السنة: «السنة الثانية (PEM)» → "PEM" */
export function trackCodeOf(c: ModuleCandidate): string | null {
  const m = c.yearName.match(/\((PEP|PEM|PES|INF-GEN|ISIL)\)/i);
  return m ? m[1].toUpperCase() : null;
}

export interface MatchContext {
  /** اسم المقياس الذي أعاده الذكاء الاصطناعي أو وجده النص */
  moduleName: string;
  /** البيانات المستخرجة من نص المنشور */
  extracted: ExtractedMeta;
  /** سنة المصدر إن رُبط (قرار إداري) */
  sourceYearOrdinal: number | null;
  /** ممح المصدر إن رُبط */
  sourceTrackCode: string | null;
}

export interface MatchOutcome {
  module: ModuleCandidate | null;
  /** اتفاق السنة مع المقياس المختار */
  yearAgreement: "exact" | "inferred" | "conflict" | "unknown";
  trackAgreement: "exact" | "conflict" | "unknown";
  /** بقيت مرشحون متعددون بنفس الاسم بعد الترشيح — لا حاسم */
  ambiguous: boolean;
  /** لماذا اختير هذا المقياس (يُعرض للمشرف) */
  reason: string;
}

/**
 * يختار المقياس من القائمة الكاملة للتخصص مع تفضيل السنة/الممح
 * المستخرجين من نص المنشور. القاعدة الذهبية:
 *   نص المنشور الصريح > ربط المصدر > الترتيب.
 *
 * يعيد MatchOutcome (لا null مباشرة) حتى يستطيع المشرف رؤية سبب
 * كل قرار في لوحة التنقيح.
 */
export function matchWithCurriculum(
  candidates: ModuleCandidate[],
  ctx: MatchContext
): MatchOutcome {
  const { moduleName, extracted, sourceYearOrdinal, sourceTrackCode } = ctx;
  if (!moduleName.trim() || candidates.length === 0) {
    return { module: null, yearAgreement: "unknown", trackAgreement: "unknown", ambiguous: false, reason: "لا اسم مقياس" };
  }

  // المرشحون بالاسم — من resolveModuleByName المنطق نفسه (مطابقة مطبَّعة)
  const target = normalizeArabic(moduleName);
  const byName = candidates.filter((c) => {
    const n = normalizeArabic(c.name);
    if (!n || !target) return false;
    if (n === target) return true;
    if (target.length >= 4 && (target.includes(n) || n.includes(target))) return true;
    // كلمات الاسم متتالية داخل الاسم الآخر (تجريد «ال»)
    const stem = (s: string) => s.split(/\s+/).map((w) => (w.length > 3 && w.startsWith("ال") ? w.slice(2) : w));
    const a = stem(target), b = stem(n);
    const [short, long] = a.length <= b.length ? [a, b] : [b, a];
    if (short.length === 0) return false;
    outer: for (let i = 0; i + short.length <= long.length; i++) {
      for (let j = 0; j < short.length; j++) if (short[j] !== long[i + j]) continue outer;
      return true;
    }
    return false;
  });
  if (byName.length === 0) {
    return { module: null, yearAgreement: "unknown", trackAgreement: "unknown", ambiguous: false, reason: `لا مقياس باسم «${moduleName}»` };
  }

  // --- تفضيل السنة ثم الممح: نص المنشور الصريح أولاً ثم ربط المصدر ---
  const wantYear = extracted.yearOrdinal ?? sourceYearOrdinal;
  const wantTrack = extracted.trackCode ?? sourceTrackCode;
  let pool = byName;
  let reasonBits: string[] = [`اسم «${moduleName}» طابق ${byName.length} مقياساً`];

  if (pool.length > 1 && wantYear != null) {
    const inYear = pool.filter((c) => yearOrdinalOf(c) === wantYear);
    if (inYear.length > 0 && inYear.length < pool.length) {
      pool = inYear;
      reasonBits.push(`رُجّح سنة ${wantYear === 1 ? "الأولى" : wantYear === 2 ? "الثانية" : "الثالثة"}${extracted.yearOrdinal != null ? " (من نص المنشور)" : " (من ربط القناة)"}`);
    }
  }
  if (pool.length > 1 && wantTrack != null) {
    const inTrack = pool.filter((c) => trackCodeOf(c) === wantTrack || trackCodeOf(c) == null);
    if (inTrack.length > 0 && inTrack.length < pool.length) {
      pool = inTrack;
      reasonBits.push(`رُجّح ممح ${wantTrack}${extracted.trackCode != null ? " (من نص المنشور)" : " (من ربط القناة)"}`);
    }
  }

  const chosen = pool[0];
  // --- الاتفاق يُحسب على المقياس المختار فعلياً (لا على الترشيح فقط) ---
  let yearAgreement: MatchOutcome["yearAgreement"] = "unknown";
  let trackAgreement: MatchOutcome["trackAgreement"] = "unknown";
  if (chosen) {
    const chosenYear = yearOrdinalOf(chosen);
    if (extracted.yearOrdinal != null && chosenYear != null) {
      yearAgreement = extracted.yearOrdinal === chosenYear ? "exact" : "conflict";
      // نص صريح يخالف ربط القناة: النص يفوز (التصنيف صحيح) لكن يُسجَّل
      // تنبيه للمشرف — ربما الربط نفسه يحتاج تصحيحاً من «تعديل الربط»
      if (yearAgreement === "exact" && sourceYearOrdinal != null && chosenYear !== sourceYearOrdinal) {
        reasonBits.push(`تنبيه: القناة مربوطة بسنة ${sourceYearOrdinal} والمنشور يقول سنة ${extracted.yearOrdinal} — اعتُمد نص المنشور`);
      }
    } else if (extracted.yearOrdinal == null && sourceYearOrdinal != null && chosenYear != null) {
      yearAgreement = sourceYearOrdinal === chosenYear ? "inferred" : "unknown";
      if (sourceYearOrdinal !== chosenYear) {
        reasonBits.push(`تنبيه: القناة مربوطة بسنة ${sourceYearOrdinal} والمقياس من سنة ${chosenYear}`);
      }
    }
    const chosenTrack = trackCodeOf(chosen);
    if (extracted.trackCode != null && chosenTrack != null) {
      trackAgreement = extracted.trackCode === chosenTrack ? "exact" : "conflict";
    }
    if (yearAgreement === "conflict") {
      reasonBits.push(`تنبيه: المنشور يقول سنة ${extracted.yearOrdinal} لكن المقياس من سنة ${yearOrdinalOf(chosen)}`);
    }
    if (trackAgreement === "conflict") {
      reasonBits.push(`تنبيه: المنشور يقول ممح ${extracted.trackCode} لكن المقياس من ممح ${trackCodeOf(chosen)}`);
    }
  }
  return { module: chosen, yearAgreement, trackAgreement, ambiguous: pool.length > 1, reason: reasonBits.join("؛ ") };
}

// ============================================================
// 4+5. CONFIDENCE + DECISION
// ============================================================

export interface ConfidenceInput {
  /** المقياس رُبط حتمياً (ربط إداري: المصدر أو الموضوع) */
  moduleFromBinding: boolean;
  /** نتيجة مطابقة المنهاج */
  match: MatchOutcome;
  /** بقيت مرشحون متعددون بنفس الاسم بعد التفضيل (غموض) */
  ambiguous: boolean;
  /** التصنيف جاء من نموذج ذكاء اصطناعي فعلي */
  aiClassified: boolean;
  /** العنوان النهائي ذو معنى (ليس «صورة»/«منشور») */
  meaningfulTitle: boolean;
  /** نص مستخرج من الصورة (OCR) موجود */
  hasOcrText: boolean;
  /** ملف/وسائط مرفقة */
  hasMedia: boolean;
  /** حكم is_course من النموذج/البوابة المحلية */
  isCourse: boolean;
}

export interface ConfidenceResult {
  score: number;
  components: Array<{ label: string; points: number }>;
}

/**
 * يحسب درجة الثقة بمكونات معلنة — الشفافية للمشرف.
 * الدرجات معايَرة على أنماط الفشل المرصودة فعلياً في الإنتاج:
 *   ~95 ربط إداري؛ ~85 مطابقة اسم + سنة صريحة متفقة؛ ~75 سنة مستنتجة
 *   من ربط القناة؛ ~60 لا إشارة سنة أصلاً (غموض)؛ ~40 تعارض صريح؛
 *   ~30 وسائط بلا مقياس؛ ~15 لا شيء.
 */
export function scoreConfidence(input: ConfidenceInput): ConfidenceResult {
  const components: Array<{ label: string; points: number }> = [];
  let score = 0;

  if (input.moduleFromBinding) {
    score += 95;
    components.push({ label: "ربط إداري حتمي للمقياس", points: 95 });
    return { score, components };
  }

  if (input.match.module) {
    let pts = 40;
    components.push({ label: `مطابقة المنهاج: ${input.match.reason}`, points: 40 });
    let bonus = 0;
    if (input.match.yearAgreement === "exact") { bonus += 25; components.push({ label: "السنة مذكورة في المنشور ومتفقة", points: 25 }); }
    else if (input.match.yearAgreement === "inferred") { bonus += 15; components.push({ label: "السنة مستنتجة من ربط القناة ومتفقة", points: 15 }); }
    else if (input.match.yearAgreement === "conflict") { bonus -= 25; components.push({ label: "تعارض السنة مع المقياس المختار", points: -25 }); }
    else { components.push({ label: "لا إشارة سنة في المنشور ولا ربط القناة", points: 0 }); }
    if (input.match.trackAgreement === "exact") { bonus += 8; components.push({ label: "الملمح مذكور ومتفق", points: 8 }); }
    else if (input.match.trackAgreement === "conflict") { bonus -= 25; components.push({ label: "تعارض الممح مع المقياس المختار", points: -25 }); }
    if (input.ambiguous) { bonus -= 10; components.push({ label: "غموض: مرشحون متعددون بنفس الاسم", points: -10 }); }
    pts += bonus;
    score += pts;
  } else {
    components.push({ label: "لا مطابقة مقياس", points: 0 });
  }

  if (input.aiClassified) { score += 8; components.push({ label: "تصنيف بنموذج ذكاء اصطناعي", points: 8 }); }
  else { components.push({ label: "تصنيف محلي (كلمات مفتاحية)", points: 0 }); }

  if (input.meaningfulTitle) { score += 8; components.push({ label: "عنوان ذو معنى", points: 8 }); }
  else { components.push({ label: "عنوان عام («صورة»/«منشور»)", points: 0 }); }

  if (input.hasOcrText) { score += 4; components.push({ label: "نص مستخرج من الصورة", points: 4 }); }
  if (input.hasMedia) { score += 4; components.push({ label: "ملف/وسائط مرفقة", points: 4 }); }
  if (!input.isCourse) { score -= 80; components.push({ label: "ليس محتوى دراسياً (بوابة المحتوى)", points: -80 }); }

  return { score: Math.max(0, Math.min(100, score)), components };
}

export type ModerationDecision = "publish" | "review" | "skip";

/**
 * يقرر مصير المنشور. القواعد تستهدف أنماط الفشل المرصودة فعلياً
 * (r71 probe) لا مجرد أرقام:
 *   1. ليس محتوى دراسياً → المكتبة ترفضه، ومساحة الفوج تعلّمه للمراجعة
 *      (وعد r67: محتوى الفوج يبقى مرئياً لطلبة الفوج).
 *   2. ربط إداري حتمي → نشر (قرار مشرف مسبق).
 *   3. مطابقة منهاج مع سنة متفقة (صريحة أو مستنتجة من ربط القناة)
 *      وبلا تعارض → نشر — هذا سلوك r64-r70 نفسه لكن بالسنة الصحيحة.
 *   4. غموض (لا إشارة سنة) أو تعارض → مراجعة إدارية قبل النشر
 *      في المكتبة — هذا ما كان يفتقد: المنشور «سنة أولى» في قناة
 *      مربوطة بسنة ثانية كان يُنشر بصمت في المكان الخطأ.
 *   5. لا مقياس: وسائط/OCR → مراجعة (فرصة للمشرف أن يربطها)؛
 *      وإلا رفض. قبل تنفيذ SQL الأعمدة، «مراجعة» المكتبة
 *      تسقط إلى «رفض» (سلوك ما قبل r71) فلا يدخل ما لا يمكن مراجعته.
 */
export function decideModeration(
  input: ConfidenceInput,
  opts: { isLibrarySource: boolean; columnsReady: boolean }
): ModerationDecision {
  if (!input.isCourse) return opts.isLibrarySource ? "skip" : "review";
  if (input.moduleFromBinding) return "publish";
  if (input.match.module) {
    const conflict =
      input.match.yearAgreement === "conflict" || input.match.trackAgreement === "conflict";
    const agreed =
      input.match.yearAgreement === "exact" || input.match.yearAgreement === "inferred";
    if (conflict) return "review";
    if (agreed && !input.ambiguous) return "publish";
    return "review";
  }
  if (input.hasMedia || input.hasOcrText) {
    // وسائط بلا تصنيف: قبل الأعمدة نحافظ على سلوك المكتبة القديم (رفض)
    return opts.isLibrarySource && !opts.columnsReady ? "skip" : "review";
  }
  return opts.isLibrarySource ? "skip" : "review";
}

// ============================================================
// عنوان ذو معنى؟
// ============================================================

const GENERIC_TITLES = new Set(["صورة", "منشور", "ملف", "مستند", "فيديو", "صوت", "رابط", ""]);

export function isMeaningfulTitle(title: string): boolean {
  return !GENERIC_TITLES.has((title ?? "").trim());
}

// ============================================================
// ذاكرة أعمدة r71 (بلا DDL — استكشاف بمدة صلاحية)
// ============================================================

/**
 * هل أعمدة الذكاء (class_confidence/class_status/class_meta) موجودة؟
 * يُستكشاف مع كاش قصير (60 ثانية — r72) بدل التخزين الدائم لكل عمر
 * المثيل: الفشل (42703) يعني أن ملف supabase_telegram_intelligence.sql
 * لم يُنفَّذ بعد فتعمل البنية بسلوك ما قبل r71 (نشر كل ما يجتاز
 * البوابة) بلا كسر أي شيء — لكن بعد أن ينفّذ المالك الملف تلتقط
 * الجولة التالية الجاهزية خلال دقيقة بدل انتظار إعادة تدوير المثيل.
 * كذلك لا يعلّق «خطأ عابر» الحالة على «غير جاهز» إلى الأبد.
 */
const COLUMNS_PROBE_TTL_MS = 60_000;
let columnsReadyCache: { at: number; promise: Promise<boolean> } | null = null;
export function intelligenceColumnsReady(): Promise<boolean> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return Promise.resolve(true); // Prisma محلي: المخطط محدَّث دائماً
  if (!columnsReadyCache || Date.now() - columnsReadyCache.at > COLUMNS_PROBE_TTL_MS) {
    const promise = (async () => {
      try {
        const { createSupabaseServerClient } = await import("@/lib/supabase/server");
        const supabase = await createSupabaseServerClient();
        const { error } = await supabase.from("telegram_items").select("class_confidence").limit(1);
        return !error;
      } catch {
        return false;
      }
    })();
    // لا ندع رفضاً غير معالَج يبقى معلقاً في الذاكرة
    promise.catch(() => {});
    columnsReadyCache = { at: Date.now(), promise };
  }
  return columnsReadyCache.promise;
}

/** يسجل حدث ذكاء (مراقبة التنسيق بين النماذج) — بلا أسرار أبداً.
 *  محلياً (Prisma) وفي الإنتاج (Supabase) على السواء — الفشل صامت
 *  دائماً: المراقبة تحسينية لا تكسر الاستيراد أبداً. */
export async function logAiEvent(event: {
  stage: string;
  sourceId?: number | null;
  tgMessageId?: number | null;
  model?: string;
  provider?: string;
  latencyMs?: number;
  extracted?: Record<string, unknown>;
  decision?: string;
  confidence?: number;
  reason?: string;
  detail?: string;
}): Promise<void> {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      // Prisma محلي — سجل الذكاء يعمل كاملاً للاختبار والتطوير
      const { db } = await import("@/lib/db");
      await db.aiEvent.create({
        data: {
          stage: event.stage,
          sourceId: event.sourceId ?? null,
          tgMessageId: event.tgMessageId ?? null,
          model: event.model ?? null,
          provider: event.provider ?? null,
          latencyMs: event.latencyMs ?? null,
          extracted: event.extracted ? JSON.stringify(event.extracted) : null,
          decision: event.decision ?? null,
          confidence: event.confidence ?? null,
          reason: (event.reason ?? "").slice(0, 500) || null,
          detail: (event.detail ?? "").slice(0, 1000) || null,
        },
      });
      return;
    }
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    await supabase.from("ai_events").insert({
      stage: event.stage,
      source_id: event.sourceId ?? null,
      tg_message_id: event.tgMessageId ?? null,
      model: event.model ?? null,
      provider: event.provider ?? null,
      latency_ms: event.latencyMs ?? null,
      extracted: event.extracted ?? null,
      decision: event.decision ?? null,
      confidence: event.confidence ?? null,
      reason: (event.reason ?? "").slice(0, 500) || null,
      detail: (event.detail ?? "").slice(0, 1000) || null,
    });
  } catch {
    // جدول ai_events غير منشأ أو خطأ كتابة — المراقبة تحسينية دائماً
  }
}
