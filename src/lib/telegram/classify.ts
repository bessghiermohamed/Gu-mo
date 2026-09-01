/**
 * Gemini classification (round 7) — "AI sorting"
 *
 * Every incoming Telegram post gets classified into an academic item
 * type (محاضرة / أعمال موجهة TD / تمارين / امتحان / ملخص / كتاب / إعلان / عام),
 * gets a clean Arabic title, and — for IMAGES (TD scans, exercise
 * sheets, lecture photos) — the visible text is OCR-extracted so it
 * becomes searchable.
 *
 * Design constraints:
 *  - Uses the REST API (no SDK dependency), env-driven:
 *      GEMINI_API_KEY  (required to enable AI classification)
 *      GEMINI_MODEL    (optional — إن لم يُضبط نجرب سلسلة:
 *                       gemini-3.6-flash → 3.7-flash → flash-latest → 2.5-flash)
 *  - Falls back to local Arabic keyword heuristics when the key is
 *    missing or the call fails — the pipeline NEVER breaks.
 *  - Images are downloaded transiently for vision, passed inline to
 *    Gemini, and discarded. Only metadata + links are ever stored.
 */

import { TG_ITEM_TYPES } from "./types";
import { firstLineTitle, fileNameToTitle } from "./normalize";

export interface ClassifyInput {
  kind: string; // pdf | doc | ppt | image | video | audio | text | link | other
  caption: string; // نص المنشور أو الوصف
  fileName: string;
  /** صورة (base64 بدون prefix) للتحليل البصري — اختيارية */
  imageBase64?: string;
  imageMimeType?: string;
  /** سياق يساعد التصنيف: اسم القناة + اسم المقياس إن وُجد */
  context?: string;
}

export interface ClassifyResult {
  itemType: string;
  title: string;
  extractedText: string;
  aiClassified: boolean;
}

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_TIMEOUT_MS = 35_000; // نماذج 3.x قد تتأخر تحت الضغط — رأينا 3.6-flash يستغرق أكثر من 15 ثانية
/** أقصى حجم صورة نُرسله للتصنيف (الألبومات المضغوطة أصغر بكثير من هذا) */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * سلسلة النماذج الافتراضية — تُجرَّب بالترتيب حتى ينجح أحدها.
 * الدافع: غوغل يحصر نماذج 2.5 وأقدم في «المستخدمين القدامى» فقط (خطأ
 * 404 فعلي للمفاتيح الجديدة) ويوصي بـ gemini-3.6-flash — لذا تتقدمها
 * السلسلة، ويُترك 2.5-flash آخراً للمفاتيح القديمة.
 */
const DEFAULT_MODEL_CHAIN = ["gemini-3.6-flash", "gemini-3.7-flash", "gemini-flash-latest", "gemini-2.5-flash"];

/** أقصى زمن إجمالي لتجربة السلسلة — هامش أمان تحت maxDuration=60 للويبهوك */
const CHAIN_DEADLINE_MS = 50_000;

/**
 * نماذج «التفكير» الموثقة مع thinkingBudget: 0 — عائلة 2.5 والاسم المستعار
 * latest. عائلة 3.x لا نرسل لها الحقل (قد يُرفض)، ونعوّضه بهامش رموز أوسع.
 */
const THINKING_MODEL_RE = /(^gemini-2\.5)|(^gemini-flash-latest)/;

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
  const title =
    firstLineTitle(input.caption, 60) ||
    fileNameToTitle(input.fileName, 60) ||
    (input.kind === "image" ? "صورة" : "منشور");
  return { itemType, title, extractedText: "", aiClassified: false };
}

// ------------------------------------------------------------
// Gemini REST call
// ------------------------------------------------------------

function buildPrompt(input: ClassifyInput): string {
  const ctx = input.context ? `\nالسياق: ${input.context}` : "";
  const fileName = input.fileName ? `\nاسم الملف: ${input.fileName}` : "";
  const caption = input.caption ? `\nنص المنشور:\n${input.caption.slice(0, 3000)}` : "";
  return `أنت مساعد أكاديمي في تطبيق جامعي جزائري. صنّف المحتوى التالي القادم من تيليجرام إلى واحد من هذه الأنواع بالضبط:
"محاضرة" أو "أعمال موجهة TD" أو "تمارين" أو "امتحان" أو "ملخص" أو "كتاب" أو "إعلان" أو "عام"
— الوصف/النص يظهر ${input.imageBase64 ? "داخل الصورة المرفقة (اقرأه بالضبط)" : "أدناه"}${ctx}${fileName}${caption}

أعد JSON فقط بهذه الصيغة (بدون أي نص إضافي):
{"item_type": "<النوع من القائمة>", "title": "<عنوان قصير واضح بالعربية، 6 كلمات كحد أقصى، من محتوى المنشور نفسه>", "text": "${input.imageBase64 ? "<انقل كل النص الظاهر في الصورة كما هو>" : "<نص فارغ>"}"}`;
}

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

  for (const model of modelCandidates()) {
    if (Date.now() > deadline) break; // لا نتجاوز نافذة الويبهوك
    const requestBody = JSON.stringify({ contents, generationConfig: generationConfigFor(model) });
    const result = await callGeminiModel(model, apiKey, requestBody, input);
    if (result) return result;
  }
  return null;
}

async function callGeminiModel(
  model: string,
  apiKey: string,
  requestBody: string,
  input: ClassifyInput
): Promise<ClassifyResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
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
    const parsed = JSON.parse(cleaned) as { item_type?: string; title?: string; text?: string };
    const itemType = TG_ITEM_TYPES.includes(parsed.item_type as never) ? parsed.item_type! : "";
    if (!itemType) return null;
    const title = (parsed.title ?? "").trim().slice(0, 120);
    return {
      itemType,
      title: title || firstLineTitle(input.caption, 60) || fileNameToTitle(input.fileName, 60) || "منشور",
      extractedText: (parsed.text ?? "").trim().slice(0, 4000),
      aiClassified: true,
    };
  } catch {
    return null; // انقطاع/مهلة/JSON تالف → التالي في السلسلة أو الكلمات المفتاحية
  } finally {
    clearTimeout(timer);
  }
}

/**
 * المدخل الموحد: جرّب Gemini، وإن فشل أو لم يُضبط المفتاح فالكلمات
 * المفتاحية المحلية. لا يرمي استثناءً أبداً.
 */
export async function classifyItem(input: ClassifyInput): Promise<ClassifyResult> {
  try {
    const ai = await classifyWithGemini(input);
    if (ai) return ai;
  } catch {
    // defensive — classifyWithGemini already catches
  }
  return heuristicClassify(input);
}

/**
 * مسبار تشخيصي: يجرّب كل نموذج في السلسلة بأصغر حمولة ويعيد رمز الحالة
 * ونص الاستجابة من غوغل كما هو (حتى أول نجاح) — حتى يُرى السبب الحقيقي
 * لأي فشل: 404 نموذج محجوز / 429 حصة / 400 حقل مرفوض / MAX_TOKENS ...
 */
export async function probeGeminiRaw(): Promise<Array<{ model: string; status: number; body: string }>> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return [];
  const attempts: Array<{ model: string; status: number; body: string }> = [];
  // ميزانية قصيرة: المسبار تشخيصي ولا يجوز أن يدفع الطلب فوق maxDuration
  for (const model of modelCandidates().slice(0, 3)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
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
      const body = (await res.text()).slice(0, 300);
      attempts.push({ model, status: res.status, body });
      if (res.ok) break; // أول نموذج ناجح يكفي
    } catch (e) {
      attempts.push({ model, status: 0, body: String(e).slice(0, 200) });
    } finally {
      clearTimeout(timer);
    }
  }
  return attempts;
}
