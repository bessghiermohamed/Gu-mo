/**
 * Gemini + Groq classification (r7 → r71 structured extraction)
 *
 * r71 — THE INTELLIGENCE UPGRADE. The old prompt asked ONE question
 * («أي مقياس؟») and glued everything else into the title. The new prompt
 * returns STRUCTURED knowledge:
 *   - clean title (year/track/semester words STRIPPED from it)
 *   - module name, year, track, semester, lesson — parsed separately
 *   - is_course gate + self-reported confidence
 * and the deterministic layer (pipeline.ts extractMeta) cross-checks every
 * field. Provider chain: Gemini (vision + text, proven live) → Groq
 * (llama-3.3-70b text fallback — fast, free tier) → local heuristics.
 *
 * Design constraints (unchanged):
 *  - REST only, env-driven: GEMINI_API_KEY / GROQ_API_KEY
 *  - Never breaks the pipeline — falls back to heuristics
 *  - Images are downloaded transiently for vision, never stored
 */

import { TG_ITEM_TYPES } from "./types";
import { firstLineTitle, fileNameToTitle } from "./normalize";
import { resolveModuleByName, inferModuleFromText, looksLikeCourseContent, type ModuleCandidate } from "./module-match";
import { extractMeta, cleanTitle, isMeaningfulTitle } from "./pipeline";

export interface ClassifyInput {
  kind: string; // pdf | doc | ppt | image | video | audio | text | link | other
  caption: string; // نص المنشور أو الوصف
  fileName: string;
  /** صورة (base64 بدون prefix) للتحليل البصري — اختيارية */
  imageBase64?: string;
  imageMimeType?: string;
  /** سياق يساعد التصنيف: اسم القناة + اسم المقياس إن وُجد */
  context?: string;
  /**
   * r64: مقاييس التخصص المرشحة — حين يمررها المستدعي يطلب من النموذج
   * اختيار المقياس المطابق بالاسم، فترتبط المادة بمقياس تظهر تحت فلترته.
   * r71: القائمة الكاملة للتخصص (كل السنوات والملامح، مع وسْم السنة
   * والملمح في yearName) — فيختار النموذج المقياس الصحيح حتى لو وُجد
   * اسماً متطابقاً في سنة/ملمح آخر.
   */
  moduleCandidates?: ModuleCandidate[];
}

export interface ClassifyResult {
  itemType: string;
  title: string;
  extractedText: string;
  aiClassified: boolean;
  /** المقياس المطابق (مُعاد معرّفه من القائمة) أو null */
  moduleMatch: ModuleCandidate | null;
  /** هل هذا محتوى دراسي يخص مقياساً؟ */
  isCourse: boolean;
  /**
   * r71: البيانات الوصفية المستخرجة من نص المنشور — سنة/ملمح/فصل/درس.
   * تُشتق حتمياً (regex) من نص المنشور نفسه، وتُقاطَع مع ما يعيده
   * النموذج: الصريح في النص يفوز دائماً.
   */
  extracted: {
    yearOrdinal: number | null;
    trackCode: string | null;
    semester: number | null;
    lessonHint: string | null;
    typeHint: string | null;
  };
  /** r71: من نوّع الإجابة — gemini | groq | heuristic (للمراقبة) */
  engine: "gemini" | "groq" | "heuristic";
  /** r71: النموذج الفعلي المستعمل (للمراقبة فقط) */
  model: string;
}

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
/** مهلة النموذج الأول (قد يحمل صورة كبيرة لقراءة نصّها — OCR) */
const PRIMARY_MODEL_TIMEOUT_MS = 25_000;
/** مهلة بدائل السلسلة — أقصر حتى لا يتجاوز الإجمالي نافذة الويبهوك */
const FALLBACK_MODEL_TIMEOUT_MS = 10_000;
/** أقصى حجم صورة نُرسله للتصنيف (الألبومات المضغوطة أصغر بكثير من هذا) */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * سلسلة النماذج الافتراضية — مبنية على قياس فعلي (مسبار probe-models):
 * غوغل يحصر 2.5 وأقدم في المفاتيح القديمة (404) ويوصي بـ 3.6-flash، لكن
 * 3.6/3.7/latest تحت ضغط شديد حالياً (تعليق/503)، بينما 3.5-flash
 * و 3.1-flash-lite استجابا 200 بسرعة — لذا تتقدمان السلسلة، والأحدث
 * تُترك لتتحسن، و 2.5-flash أخيراً للمفاتيح القديمة.
 */
const DEFAULT_MODEL_CHAIN = [
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.7-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash",
];

/** r71: سلسلة Groq النصية — احتياط غوغل (كلاهما مجاني وسريع) */
const GROQ_CHAIN = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];

/** أقصى زمن إجمالي لتجربة السلسلة — هامش أمان تحت maxDuration=60 للويبهوك */
const CHAIN_DEADLINE_MS = 45_000;

/**
 * عائلة 2.5 فقط: نوقف «التفكير» بـ thinkingBudget: 0 (موثقة لها) — وإلا
 * استهلكت رموز التفكير الحد وعادت استجابة فارغة. عائلات 3.x لا نرسل لها
 * الحقل (قد يُرفض 400) ونعوّضه بهامش رموز أوسع (8192).
 */
const THINKING_MODEL_RE = /^gemini-2\.5/;

function generationConfigFor(model: string): Record<string, unknown> {
  const cfg: Record<string, unknown> = {
    temperature: 0.1,
    // هامش واسع: رموز التفكير الداخلية (للنماذج التي لا نوقف تفكيرها)
    // تُحسب ضمن الحد، والنص المستخرج من الصور قد يكون طويلاً أيضاً
    maxOutputTokens: 8192,
    responseMimeType: "application/json",
  };
  if (THINKING_MODEL_RE.test(model)) cfg.thinkingConfig = { thinkingBudget: 0 };
  return cfg;
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL_CHAIN[0];
}

/** النماذج المراد تجربتها: GEMINI_MODEL الصريح وحده، وإلا السلسلة كاملة */
function modelCandidates(): string[] {
  const configured = process.env.GEMINI_MODEL?.trim();
  return configured ? [configured] : DEFAULT_MODEL_CHAIN;
}

export function isGeminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY?.trim();
}

/** r71: هل Groq متاح كاحتياط نصي؟ */
export function isGroqConfigured(): boolean {
  return !!process.env.GROQ_API_KEY?.trim() && !process.env.GROQ_API_KEY!.trim().startsWith("xai-");
}

// ------------------------------------------------------------
// Heuristic fallback — كلمات مفتاحية عربية/فرنسية شائعة
// ------------------------------------------------------------

const TYPE_KEYWORDS: Array<{ type: string; words: string[] }> = [
  { type: "امتحان", words: ["امتحان", "إمتحان", "فرض", "اختبار", "فحص", "exam", "devoir", "controle", "rattrapage"] },
  { type: "أعمال موجهة TD", words: ["td", "اعمال موجهه", "أعمال موجهة", "اعمال موجهة", "أعمال تطبيقية", "works"] },
  { type: "تمارين", words: ["تمرين", "تمارين", "سلسلة", "سلاسل", "exercice", "serie", "exercises", "سؤال", "أسئلة"] },
  { type: "ملخص", words: ["ملخص", "ملخصات", "فريز", "résumé", "resume", "fiche"] },
  { type: "محاضرة", words: ["محاضرة", "محاضرات", "درس", "دروس", "cours", "lecture", "بيان"] },
  { type: "كتاب", words: ["كتاب", "كتب", "مرجع", "biblio", "book", "رواية", "مذكرات تخرج"] },
  { type: "إعلان", words: ["تنبيه", "إعلان", "اعلان", "موعد", "اجتماع", "تذكير", "urgent", "هام"] },
];

function normalizeForKeywords(s: string): string {
  return s
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase();
}

export function heuristicClassify(input: ClassifyInput): ClassifyResult {
  const haystack = normalizeForKeywords(`${input.fileName} \n ${input.caption}`);
  let itemType = "";
  for (const entry of TYPE_KEYWORDS) {
    if (entry.words.some((w) => haystack.includes(normalizeForKeywords(w)))) {
      itemType = entry.type;
      break;
    }
  }
  if (!itemType) {
    if (input.kind === "pdf" || input.kind === "doc" || input.kind === "ppt") itemType = "محاضرة";
    else if (input.kind === "text" || input.kind === "link") itemType = "إعلان";
    else itemType = "عام";
  }
  const rawTitle =
    firstLineTitle(input.caption, 60) ||
    fileNameToTitle(input.fileName, 60) ||
    (input.kind === "image" ? "صورة" : "منشور");
  // r64: مطابقة محلية بلا ذكاء اصطناعي — اسم مقياس كامل داخل النص/السياق
  const moduleMatch = input.moduleCandidates?.length
    ? inferModuleFromText(input.moduleCandidates, `${input.caption} ${input.fileName} ${input.context ?? ""}`)
    : null;
  // r65: بوابة المحتوى الدراسي — تُقيّم نص المنشور نفسه (لا السياق)
  const isCourse = looksLikeCourseContent({
    text: input.caption,
    fileName: input.fileName,
    moduleName: moduleMatch?.name ?? "",
    hasMedia: input.kind !== "text" && input.kind !== "link",
  });
  // r71: استخراج حتمي + تنظيف العنوان حتى في المسار المحلي
  const extracted = extractMeta(`${input.caption} ${input.fileName}`);
  const typeHint = extracted.typeHint;
  return {
    itemType: typeHint ?? itemType,
    title: cleanTitle(rawTitle) || rawTitle,
    extractedText: "",
    aiClassified: false,
    moduleMatch,
    isCourse,
    extracted,
    engine: "heuristic",
    model: "keywords",
  };
}

// ------------------------------------------------------------
// r71 — the structured prompt (Gemini + Groq share it)
// ------------------------------------------------------------

function buildPrompt(input: ClassifyInput): string {
  const ctx = input.context ? `\nالسياق: ${input.context}` : "";
  const fileName = input.fileName ? `\nاسم الملف: ${input.fileName}` : "";
  const caption = input.caption ? `\nنص المنشور:\n${input.caption.slice(0, 3000)}` : "";
  // r71: قائمة المقاييس الكاملة — كل مقياس موسوم بسنته وملمحه
  // («النحو العربي (السنة الأولى — PEP)») فيستطيع النموذج التمييز بين
  // المقياسين المتشاركين الاسم عبر السنة/الممح.
  const modules = input.moduleCandidates?.length
    ? `\nمقاييس التخصص (اختر مقياس المنشور إن كان يخص أحدها — انسخ الاسم حرفياً كما هو دون القوسين، أو أعد نصاً فارغاً):\n${input.moduleCandidates
        .map((c) => (c.yearName ? `${c.name} (${c.yearName})` : c.name))
        .slice(0, 60)
        .map((s) => `- ${s}`)
        .join("\n")}`
    : "";
  return `أنت أمين مكتبة أكاديمية في تطبيق جامعي جزائري. منشور تيليجرام وصل إليك، ومهمتك فهم محتواه و NOT وصفه حرفياً.

ما يجب أن تفصله بدقة:
- «title» = اسم المحتوى نفسه فقط، نظيف وقصير (٦ كلمات كحد أقصى). لا تضع فيه السنة ولا الممح ولا الفصل ولا رقم الدفعة — هذه بيانات تصنيف تُعاد في حقولها المنفصلة.
  مثال: «ملخص الإنجليزية - سنة أولى - ملمح ابتدائي» ← title = «ملخص الإنجليزية» و year = 1 و track = PEP.
- «year» = رقم السنة الدراسية المذكورة في المنشور (1 أو 2 أو 3)، أو 0 إن لم تُذكر.
- «track» = الممح إن ذُكر: "PEP" (ابتدائي) أو "PEM" (متوسط) أو "PES" (ثانوي)، أو نص فارغ إن لم يُذكر.
- «semester» = السداسي إن ذُكر (1 أو 2)، أو 0 إن لم يُذكر.
- «lesson» = اسم الدرس/الموضوع إن ذُكر صراحة (مثل «جمع التكسير»)، أو نص فارغ.
- «module_name» = اسم المقياس المطابق من قائمة المقاييس أدناه (بدون القوسين) إن كان المنشور محتوى أحد المقاييس، وإلا نص فارغ. إن وُجد المقياس نفسه في أكثر من سنة أو ممح فاختر الذي يوافق year و track المذكورين في المنشور.
- «item_type» = واحد بالضبط من: "محاضرة" أو "أعمال موجهة TD" أو "تمارين" أو "امتحان" أو "ملخص" أو "كتاب" أو "إعلان" أو "عام".
- «is_course» = true فقط إن كان المنشور محتوى دراسيّاً يخص مقياساً (ملف دراسة، امتحان، محاضرة، TD، ملخص، كتاب، أو إعلان يخص مقياساً بعينه). false إن كان نقاشاً عاماً أو ترحيباً أو إعلاناً إدارياً أو ذِكراً عرضياً لمقياس مثل «لدينا عشرة مقاييس لكن ليست الهندسة».
- «confidence» = تقديرك 0-100 لمدى certainty التصنيف كله.
- «text» = ${input.imageBase64 ? "انقل كل النص الظاهر في الصورة كما هو (OCR)" : "نص فارغ"}.

الوصف/النص يظهر ${input.imageBase64 ? "داخل الصورة المرفقة (اقرأه بالضبط)" : "أدناه"}${ctx}${fileName}${caption}${modules}

أعد JSON فقط بهذه الصيغة (بلا أي نص إضافي):
{"is_course": <true|false>, "item_type": "<النوع>", "title": "<العنوان النظيف>", "module_name": "<اسم المقياس أو فارغ>", "year": <0|1|2|3>, "track": "<PEP|PEM|PES|فارغ>", "semester": <0|1|2>, "lesson": "<الدرس أو فارغ>", "confidence": <0-100>, "text": "<OCR أو فارغ>"}`;
}

interface StructuredParsed {
  is_course?: boolean;
  item_type?: string;
  title?: string;
  module_name?: string;
  year?: number;
  track?: string;
  semester?: number;
  lesson?: string;
  confidence?: number;
  text?: string;
}

/** r71: يدمج إجابة النموذج مع الاستخراج الحتمي — الصريح في النص يفوز */
function mergeStructured(
  parsed: StructuredParsed,
  input: ClassifyInput,
  engine: "gemini" | "groq",
  model: string
): ClassifyResult | null {
  const itemType = TG_ITEM_TYPES.includes(parsed.item_type as never) ? parsed.item_type! : "";
  if (!itemType) return null; // إجابة غير صالحة → الباب التالي في السلسلة

  // الاستخراج الحتمي من نص المنشور — مرجع الحقيقة للسنة/الممح/الفصل.
  // r71: نص الصورة (OCR) الذي أعاده النموذج يُدخل الاستخراج أيضاً —
  // السنة المكتوبة داخل صورة بلا وصف تُحسب كأنها مكتوبة في المنشور.
  const deterministic = extractMeta(`${input.caption} ${input.fileName} ${parsed.text ?? ""}`);
  const yearOrdinal =
    deterministic.yearOrdinal ??
    (parsed.year && parsed.year >= 1 && parsed.year <= 3 ? parsed.year : null);
  const trackCode =
    deterministic.trackCode ??
    (["PEP", "PEM", "PES"].includes((parsed.track ?? "").toUpperCase()) ? (parsed.track ?? "").toUpperCase() : null);
  const semester =
    deterministic.semester ??
    (parsed.semester === 1 || parsed.semester === 2 ? parsed.semester : null);
  const lessonHint = (parsed.lesson ?? "").trim().slice(0, 120) || null;

  // العنوان النظيف: نموّل النموذج ثم نجرد ما تبقى من توكنات وصفية
  const rawTitle = (parsed.title ?? "").trim().slice(0, 120);
  const title =
    cleanTitle(rawTitle) ||
    cleanTitle(firstLineTitle(input.caption, 60)) ||
    cleanTitle(fileNameToTitle(input.fileName, 60)) ||
    (input.kind === "image" ? "صورة" : "منشور");

  // r64 + r71: ربط المقياس — مطابقة الاسم المعاد على قائمة المرشحين
  // (نص الصورة يدخل السياق أيضاً: مقياس مذكور داخل صورة يُطابق)
  const moduleMatch = input.moduleCandidates?.length
    ? resolveModuleByName(input.moduleCandidates, parsed.module_name ?? "", `${input.caption} ${parsed.text ?? ""} ${input.context ?? ""}`)
    : null;

  return {
    itemType,
    title,
    extractedText: (parsed.text ?? "").trim().slice(0, 4000),
    aiClassified: true,
    moduleMatch,
    isCourse:
      parsed.is_course === undefined
        ? looksLikeCourseContent({
            text: input.caption,
            fileName: input.fileName,
            moduleName: moduleMatch?.name ?? "",
            hasMedia: input.kind !== "text" && input.kind !== "link",
          })
        : !!parsed.is_course,
    extracted: {
      yearOrdinal,
      trackCode,
      semester,
      lessonHint,
      typeHint: deterministic.typeHint,
    },
    engine,
    model,
  };
}

// ------------------------------------------------------------
// Gemini REST call
// ------------------------------------------------------------

interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

export async function classifyWithGemini(input: ClassifyInput): Promise<ClassifyResult | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  if (input.imageBase64 && (input.imageBase64.length * 0.75 > MAX_IMAGE_BYTES)) return null;

  const parts: GeminiPart[] = [{ text: buildPrompt(input) }];
  if (input.imageBase64) {
    parts.push({
      inline_data: { mime_type: input.imageMimeType || "image/jpeg", data: input.imageBase64 },
    });
  }
  const contents = [{ role: "user", parts }];
  const deadline = Date.now() + CHAIN_DEADLINE_MS;

  let attempt = 0;
  for (const model of modelCandidates()) {
    if (Date.now() > deadline) break; // لا نتجاوز نافذة الويبهوك
    const timeoutMs = attempt === 0 ? PRIMARY_MODEL_TIMEOUT_MS : FALLBACK_MODEL_TIMEOUT_MS;
    const requestBody = JSON.stringify({ contents, generationConfig: generationConfigFor(model) });
    const result = await callGeminiModel(model, apiKey, requestBody, input, timeoutMs);
    if (result) return result;
    attempt++;
  }
  return null;
}

async function callGeminiModel(
  model: string,
  apiKey: string,
  requestBody: string,
  input: ClassifyInput,
  timeoutMs: number
): Promise<ClassifyResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `${GEMINI_ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: requestBody, signal: controller.signal }
    );
    if (!res.ok) return null; // نموذج غير متاح لهذا المفتاح — جرّب التالي في السلسلة
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
    };
    const raw = data.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text ?? "";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleaned) as StructuredParsed;
    return mergeStructured(parsed, input, "gemini", model);
  } catch {
    return null; // انقطاع/مهلة/JSON تالف → التالي في السلسلة أو الكلمات المفتاحية
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------
// r71: Groq text fallback (no vision — text-only inputs)
// ------------------------------------------------------------

async function classifyWithGroq(input: ClassifyInput): Promise<ClassifyResult | null> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey || apiKey.startsWith("xai-")) return null; // مفتاح Grok في غير موضعه — يتكفل به مسار آخر
  if (input.imageBase64) return null; // Groq هنا نصي فقط — الصور مسار Gemini

  const deadline = Date.now() + 15_000; // احتياط سريع لا يطيل الويبهوك
  for (const model of GROQ_CHAIN) {
    if (Date.now() > deadline) break;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FALLBACK_MODEL_TIMEOUT_MS);
    try {
      const res = await fetch(GROQ_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_tokens: 2048,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "أنت مصنف محتوى أكاديمي جزائري. أعد JSON فقط بلا أي نص إضافي." },
            { role: "user", content: buildPrompt(input) },
          ],
        }),
        signal: controller.signal,
      });
      if (!res.ok) continue; // 401/429/5xx → النموذج التالي
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const raw = data.choices?.[0]?.message?.content ?? "";
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      const parsed = JSON.parse(cleaned) as StructuredParsed;
      const merged = mergeStructured(parsed, input, "groq", model);
      if (merged) return merged;
    } catch {
      // المحاولة التالية
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/**
 * المدخل الموحد: Gemini ← Groq ← الكلمات المفتاحية المحلية.
 * لا يرمي استثناءً أبداً.
 */
export async function classifyItem(input: ClassifyInput): Promise<ClassifyResult> {
  try {
    const ai = await classifyWithGemini(input);
    if (ai) return ai;
  } catch {
    // defensive — classifyWithGemini already catches
  }
  // r71: احتياط Groq النصي — غوغل معطل ≠ تصنيف محلي فقير
  try {
    const groq = await classifyWithGroq(input);
    if (groq) return groq;
  } catch {
    // defensive
  }
  return heuristicClassify(input);
}

/**
 * مسبار تشخيصي: يجرّب نموذجاً (أو قائمة) بأصغر حمولة ويعيد رمز الحالة
 * والزمن وعنوان URL النهائي (كشف إعادة التوجيه) ونص الاستجابة كما هو —
 * حتى يُرى السبب الحقيقي لأي فشل: 404 محجوز / 429 حصة / 503 ضغط /
 * AbortError إغلاق مبكر / MAX_TOKENS ...
 */
export async function probeGeminiRaw(
  models?: string[],
  timeoutMs = 8_000
): Promise<Array<{ model: string; status: number; ms: number; url: string; body: string }>> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return [];
  const list = (models && models.length > 0 ? models : modelCandidates()).slice(0, 6);
  const attempts: Array<{ model: string; status: number; ms: number; url: string; body: string }> = [];
  for (const model of list) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    try {
      const res = await fetch(
        `${GEMINI_ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: 'صنّف هذا: امتحان محلول. أعد JSON فقط: {"item_type":"امتحان","title":"فحص اتصال","text":""}' }] }],
            generationConfig: generationConfigFor(model),
          }),
          signal: controller.signal,
        }
      );
      const body = (await res.text()).slice(0, 200);
      attempts.push({ model, status: res.status, ms: Date.now() - startedAt, url: res.url, body });
    } catch (e) {
      attempts.push({ model, status: 0, ms: Date.now() - startedAt, url: "", body: String(e).slice(0, 150) });
    } finally {
      clearTimeout(timer);
    }
  }
  return attempts;
}
