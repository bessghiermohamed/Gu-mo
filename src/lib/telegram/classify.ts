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
 *      GEMINI_MODEL    (optional, default "gemini-2.0-flash")
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
const GEMINI_TIMEOUT_MS = 15000;
/** أقصى حجم صورة نُرسله للتصنيف (الألبومات المضغوطة أصغر بكثير من هذا) */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${GEMINI_ENDPOINT}/${geminiModel()}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2048, responseMimeType: "application/json" },
        }),
        signal: controller.signal,
      }
    );
    if (!res.ok) return null;
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
    return null; // انقطاع/مهلة/JSON تالف → fallback
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
