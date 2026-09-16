/**
 * استوديو المولّدات (r89) — «الاستوديو» الوحدــة النقية.
 *
 * WHY THIS EXISTS: the owner asked to COPY the capable services of
 * generation platforms (Alborihi AI نموذجاً) into the WEB app — until now
 * the platform's answer lived in the Telegram bot (r85/r86) and the owner
 * rightly noted he could not find those services in the application. This
 * module is the web studio's pure brain: it REUSES the proven bot pipelines
 * (runDiagramStudio / runTranslateStudio / runAnalyzeStudio / runDetectStudio
 * / runReviewStudio / runHtmlStudio) unchanged, and adds two web-first
 * capabilities:
 *
 *   • بحث موسّع (research) — a two-call pipeline (outline → report) that
 *     honestly frames itself as MODEL-KNOWLEDGE research: no web browsing,
 *     explicit cutoff honesty, mandatory «ما يجب التحقق منه» + «مصادر
 *     مقترحة للتوثيق» sections so the student can verify everything.
 *   • قارن النماذج (arena) — the SAME question answered by TWO configured
 *     providers in parallel (chatWithProvider), shown side by side with
 *     honest labels; the student judges, no auto-winner.
 *
 * PURITY: no Next.js imports — bun-testable outside the app (project rule
 * since bot-api). Guarding follows the bot exactly: generation tools are
 * guarded BEFORE any provider call and BEFORE any quota consumption.
 */

import type { ChatMessage, ProviderId } from "./providers";
import {
  studyGuard,
  DIAGRAM_PROMPT_MIN,
  DIAGRAM_PROMPT_MAX,
  TRANSLATE_PROMPT_MIN,
  TRANSLATE_PROMPT_MAX,
  ANALYZE_PROMPT_MIN,
  ANALYZE_PROMPT_MAX,
  DETECT_PROMPT_MIN,
  DETECT_PROMPT_MAX,
  REVIEW_PROMPT_MIN,
  REVIEW_PROMPT_MAX,
} from "./study-tools";
import {
  credentialsGuard,
  HTML_PROMPT_MIN,
  HTML_PROMPT_MAX,
} from "./html-studio";
import { createNotebookLimiter } from "./notebook";

// ---------------------------------------------------------------------------
// الكتالوج — الأفعال الثمانية
// ---------------------------------------------------------------------------

export type StudioAction =
  | "research"
  | "arena"
  | "diagram"
  | "translate"
  | "arabic"
  | "detect"
  | "review"
  | "html";

export type StudioPool = "research" | "arena" | "diagram" | "html" | "light";

export interface StudioActionSpec {
  id: StudioAction;
  label: string; // الاسم العربي في الواجهة
  tagline: string; // سطر وصفي تحت الاسم
  pool: StudioPool;
  min: number;
  max: number;
  field: "topic" | "question" | "prompt" | "text" | "code";
  /** أي حرس أمني يسبق المزوّد — نفس منطق البوت حرفياً */
  guard: "study" | "credentials" | "study-plus" | null;
}

export const STUDIO_ACTIONS: StudioActionSpec[] = [
  {
    id: "research",
    label: "بحث موسّع",
    tagline: "خطة محاور ثم تقرير مفصّل — مع ما يجب التحقق منه ومصادر مقترحة للتوثيق",
    pool: "research",
    min: 8,
    max: 300,
    field: "topic",
    guard: null,
  },
  {
    id: "arena",
    label: "قارن النماذج",
    tagline: "سؤالك يجيب عنه مزوّدان جنباً إلى جنب — والحكم لك",
    pool: "arena",
    min: 5,
    max: 2000,
    field: "question",
    guard: null,
  },
  {
    id: "diagram",
    label: "مخطط Mermaid",
    tagline: "رسم بياني من وصف قصير — مع فحص صياغة وتصحيح واحد",
    pool: "diagram",
    min: DIAGRAM_PROMPT_MIN,
    max: DIAGRAM_PROMPT_MAX,
    field: "prompt",
    guard: "study",
  },
  {
    id: "translate",
    label: "ترجمة أكاديمية",
    tagline: "اكتشاف تلقائي للغة — عربي↔فرنسي و11 لغة أكاديمية",
    pool: "light",
    min: TRANSLATE_PROMPT_MIN,
    max: TRANSLATE_PROMPT_MAX,
    field: "text",
    guard: null,
  },
  {
    id: "arabic",
    label: "تحليل عربي",
    tagline: "تصحيح، تشكيل، إعراب، صرف، معانٍ — في خمسة أقسام ثابتة",
    pool: "light",
    min: ANALYZE_PROMPT_MIN,
    max: ANALYZE_PROMPT_MAX,
    field: "text",
    guard: null,
  },
  {
    id: "detect",
    label: "كشف كتابة آلية",
    tagline: "تقدير صادق بسقف 85٪ — بلا إشارتين لا حكم، وتنبيه لا دليل",
    pool: "light",
    min: DETECT_PROMPT_MIN,
    max: DETECT_PROMPT_MAX,
    field: "text",
    guard: null,
  },
  {
    id: "review",
    label: "مراجعة كود",
    tagline: "ما يفعله الكود، مشاكل حقيقية بلا اختلاق، ونسخة محسّنة عند الاستحقاق",
    pool: "light",
    min: REVIEW_PROMPT_MIN,
    max: REVIEW_PROMPT_MAX,
    field: "code",
    guard: "study-plus",
  },
  {
    id: "html",
    label: "صفحة HTML",
    tagline: "صفحة عربية RTL كاملة (Tailwind) من وصف قصير — بنمط تختاره",
    pool: "html",
    min: HTML_PROMPT_MIN,
    max: HTML_PROMPT_MAX,
    field: "prompt",
    guard: "credentials",
  },
];

export function findStudioAction(id: string): StudioActionSpec | null {
  return STUDIO_ACTIONS.find((a) => a.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// الحصص — خمس برك مستقلة (نفس حدود البوت المعلنة)
// ---------------------------------------------------------------------------

export const STUDIO_POOL_LIMITS: Record<StudioPool, { gapMs: number; dailyCap: number }> = {
  research: { gapMs: 20_000, dailyCap: 10 },
  arena: { gapMs: 15_000, dailyCap: 20 },
  diagram: { gapMs: 15_000, dailyCap: 12 },
  html: { gapMs: 20_000, dailyCap: 8 },
  light: { gapMs: 10_000, dailyCap: 24 },
};

export const STUDIO_GAP_MESSAGES: Record<StudioPool, string> = {
  research: "انتظر لحظات بين بحث وآخر — البحث الموسّع خطّان متماسكان يحتاجان وقتاً.",
  arena: "انتظر ثوانٍ بين سؤال وسؤال — القارن يستدعي مزوّدين معاً.",
  diagram: "انتظر لحظات بين مخطط وآخر — الفحص والتصحيح يحتاجان وقتاً.",
  html: "انتظر لحظات بين صفحة وأخرى — التوليد والنقد يحتاجان وقتاً.",
  light: "انتظر ثوانٍ قليلة بين كل طلب وطلب.",
};

export const STUDIO_CAP_MESSAGES: Record<StudioPool, string> = {
  research: "وصلت إلى حد البحث الموسّع اليومي — عُد غداً.",
  arena: "وصلت إلى حد القارن اليومي — عُد غداً.",
  diagram: "وصلت إلى حد المخططات اليومي — عُد غداً.",
  html: "وصلت إلى حد صفحات HTML اليومي — عُد غداً.",
  light: "وصلت إلى حد الاستخدام اليومي للأدوات الخفيفة — عُد غداً.",
};

/** مصنع الحصص: نفس ليمتر الدفتر المُجرَّب (97/97) بحقن ساعة للاختبار. */
export function createStudioPoolLimiter(pool: StudioPool, now: () => number = () => Date.now()) {
  const lim = STUDIO_POOL_LIMITS[pool];
  return createNotebookLimiter(lim.gapMs, lim.dailyCap, STUDIO_GAP_MESSAGES[pool], STUDIO_CAP_MESSAGES[pool], now);
}

// ---------------------------------------------------------------------------
// التحقق من الطلب (نقي — تستخدمه الشبكة ويغطيه الفحص)
// ---------------------------------------------------------------------------

export type StudioRequest =
  | { action: "research"; topic: string }
  | { action: "arena"; question: string }
  | { action: "diagram"; prompt: string; typeId?: string }
  | { action: "translate"; text: string; lang?: string }
  | { action: "arabic"; text: string }
  | { action: "detect"; text: string }
  | { action: "review"; code: string; note?: string }
  | { action: "html"; prompt: string; archetypeId?: string };

const OPT_MAX = 60; // سقف الحقول الاختيارية القصيرة (معرّفات الأنماط واللغات)

function str(v: unknown): string | null {
  return typeof v === "string" ? v.trim() : null;
}

function optStr(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  if (s.length > OPT_MAX) return undefined; // قيمة شاذة تُهمل بدل رفض الطلب كله
  return s;
}

export function validateStudioRequest(raw: unknown): { ok: true; body: StudioRequest } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "طلب غير صالح" };
  const obj = raw as Record<string, unknown>;
  const spec = findStudioAction(str(obj.action) ?? "");
  if (!spec) return { ok: false, error: "أداة غير معروفة في الاستوديو" };
  const main = str(obj[spec.field]);
  if (!main) return { ok: false, error: `اكتب ${spec.field === "code" ? "الكود" : "النص"} المطلوب أولاً` };
  if (main.length < spec.min) {
    return { ok: false, error: `النص قصير جداً — الحد الأدنى ${spec.min} حرفاً لهذه الأداة.` };
  }
  if (main.length > spec.max) {
    return { ok: false, error: `النص طويل جداً — أقصى ${spec.max} حرفاً لهذه الأداة، والاختصار أصدق من الإحالة.` };
  }
  switch (spec.id) {
    case "research":
      return { ok: true, body: { action: "research", topic: main } };
    case "arena":
      return { ok: true, body: { action: "arena", question: main } };
    case "diagram":
      return { ok: true, body: { action: "diagram", prompt: main, typeId: optStr(obj.typeId) } };
    case "translate":
      return { ok: true, body: { action: "translate", text: main, lang: optStr(obj.lang) } };
    case "arabic":
      return { ok: true, body: { action: "arabic", text: main } };
    case "detect":
      return { ok: true, body: { action: "detect", text: main } };
    case "review": {
      const note = str(obj.note);
      return { ok: true, body: { action: "review", code: main, note: note ? note.slice(0, 500) : undefined } };
    }
    case "html":
      return { ok: true, body: { action: "html", prompt: main, archetypeId: optStr(obj.archetypeId) } };
  }
}

// ---------------------------------------------------------------------------
// الحرس الأمني — قبل أي مزوّد وقبل أي حصة (نفس منطق البوت)
// ---------------------------------------------------------------------------

export function studioGuard(body: StudioRequest): string | null {
  switch (body.action) {
    case "diagram":
      return studyGuard(body.prompt);
    case "html":
      return credentialsGuard(body.prompt);
    case "review":
      return studyGuard(body.code + " " + (body.note ?? ""));
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// بحث موسّع — خطّان (مخطط ← تقرير) بأمانة معلنة: من معرفة النموذج
// ---------------------------------------------------------------------------

export const RESEARCH_OUTLINE_TIMEOUT_MS = 10_000;
export const RESEARCH_REPORT_TIMEOUT_MS = 40_000;
export const RESEARCH_MIN_OUTLINE = 3;
export const RESEARCH_MAX_OUTLINE = 6;
export const RESEARCH_REPORT_MIN_CHARS = 1200;

export const RESEARCH_HONESTY_NOTE =
  "هذا البحث من معرفة النموذج (بتاريخ قطع) ولا يتصفح الإنترنت — راجع قسم «ما يجب التحقق منه» ووثّق من المصادر المقترحة قبل الاعتماد.";

export function buildResearchOutlineSystem(): string {
  return [
    "أنت باحث أكاديمي منظم يساعد طالباً جامعياً جزائرياً في إعداد بحث دراسي.",
    "مهمتك: تحويل موضوع البحث إلى مخطط محاور — من ٤ إلى ٦ أسطر فقط.",
    "كل سطر: رقم + عنوان المحور + سؤال فرعي واحد بين قوسين يحدد ما سيجيب عنه المحور.",
    "أخرج الأسطر فقط — بلا مقدمة ولا خاتمة ولا تنسيق إضافي ولا إيموجي.",
    "المحاور تتدرج منطقياً: تعريف/أساس ← تفصيل ← تطبيق أو تحليل ← خلاصة.",
  ].join(" ");
}

export function buildResearchOutlineMessages(topic: string): ChatMessage[] {
  return [{ role: "user", content: `موضوع البحث: ${topic}` }];
}

/** يُخرج أسطر المخطط من جواب النموذج — ينزع الترقيم وعلامات الماركداون
 *  طبقةً فوق طبقة، ويسقط الأسطر التمهيدية بلا سؤال فرعي تنتهي بنقطتين. */
export function parseResearchOutline(answer: string): string[] {
  const lines = answer
    .split("\n")
    .map((raw) => {
      let s = raw.trim();
      // طبقات الترقيم/الرموز قد تتكدس («1. - عنوان») — ثلاث مرات تكفي
      for (let i = 0; i < 3; i++) {
        s = s.replace(/^(?:[-*•]|\d+[).:-]?|\*\*|#+)\s*/, "").replace(/\*\*/g, "");
      }
      return s.trim();
    })
    .filter((l) => {
      if (l.length < 8) return false;
      // تمهيد النموذج («إليك مخططاً مقترحاً:») ليس محوراً
      if (l.endsWith(":") && !l.includes("(")) return false;
      return true;
    });
  return lines.slice(0, RESEARCH_MAX_OUTLINE);
}

export function outlineError(): string {
  return `لم تكتمل خطة المحاور — أعد المحاولة (المطلوب ${RESEARCH_MIN_OUTLINE} محاور على الأقل).`;
}

export function buildResearchReportSystem(): string {
  return [
    "أنت باحث أكاديمي يكتب لطالب جامعي جزائري تقريراً دراسياً متكاملاً بالعربية الفصحى المبسطة.",
    "اعتمد المخطط المعطى حرفياً كعناوين أقسام، واكتب لكل محور تفصيلاً وافياً بأمثلة وتوضيحات.",
    "افتح التقرير بفقرة «المقدمة:» تذكر صراحة أن المادة من معرفة النموذج التي لها تاريخ قطع وأنها للتحضير لا للاقتباس.",
    "اختم بقسمين إجباريين:",
    "«ما يجب التحقق منه:» — قائمة نقاط لكل معلومة قد تكون قديمة أو تقديرية أو تحتاج مرجعاً، بصراحة كاملة.",
    "«مصادر مقترحة للتوثيق:» — كتب ومؤسسات ودروس رسمية معروفة فعلاً بأسمائها، بلا روابط ولا أرقام نشر مخترعة.",
    "لا تختلق أرقاماً ولا دراسات ولا إحصاءات؛ إن لم تعرف قيمة بدقة فقل ذلك في موضعها.",
    "بلا إيموجي، وعناوين الأقسام بنفس صيغة المخطط.",
  ].join(" ");
}

export function buildResearchReportMessages(topic: string, outline: string[]): ChatMessage[] {
  const plan = outline.map((l, i) => `${i + 1}. ${l}`).join("\n");
  return [
    {
      role: "user",
      content: `موضوع البحث: ${topic}\n\nالمخطط المعتمد:\n${plan}\n\nاكتب التقرير الكامل وفق التعليمات.`,
    },
  ];
}

/** مدقق التقرير: القسمان الإجباريان + حد أدنى للطول — وإلا فشل صادق. */
export function validateResearchReport(answer: string): string | null {
  const t = answer.trim();
  if (t.length < RESEARCH_REPORT_MIN_CHARS) return "جاء التقرير قصيراً جداً — أعد المحاولة.";
  if (!t.includes("ما يجب التحقق منه")) return "التقرير نقص قسم «ما يجب التحقق منه» — أعد المحاولة.";
  if (!t.includes("مصادر مقترحة")) return "التقرير نقص قسم «مصادر مقترحة للتوثيق» — أعد المحاولة.";
  if (!t.includes("المقدمة")) return "التقرير نقص المقدمة — أعد المحاولة.";
  return null;
}

// ---------------------------------------------------------------------------
// قارن النماذج — نفس السؤال لمزوّدين اثنين بالتوازي
// ---------------------------------------------------------------------------

export const ARENA_TIMEOUT_MS = 40_000;

export function buildArenaSystem(): string {
  return [
    "أنت مساعد دراسي لطالب جامعي جزائري يجيب بالعربية الفصحى المبسطة.",
    "أجب إجابة مباشرة منظمة بفقرات قصيرة وقوائم عند الحاجة، بلا مقدمات زائدة وبلا إيموجي.",
    "إن كان السؤال غامضاً فاضبطه أنت بأفضل تفسير معقول وأجب عنه.",
    "معرفتك لها تاريخ قطع: في أسئلة «الأحدث» قل بصراحة أن معلوماتك قد تكون قديمة.",
    "إن لم تعرف الجواب بدقة فقل ذلك في موضعه ولا تخترع معلومات.",
  ].join(" ");
}

export function buildArenaMessages(question: string): ChatMessage[] {
  return [{ role: "user", content: question }];
}

/** أول مزوّدين مختلفين متاحين — وإلا null (لا قارن بمزوّد واحد). */
export function pickArenaProviders(configured: ProviderId[]): { a: ProviderId; b: ProviderId } | null {
  if (configured.length < 2) return null;
  return { a: configured[0], b: configured[1] };
}

export function arenaSingleProviderError(configured: ProviderId[]): string {
  const names: Record<string, string> = { groq: "Groq", gemini: "Gemini", xai: "Grok" };
  const one = configured[0] ? names[configured[0]] ?? configured[0] : "لا أحد";
  return `القارن يحتاج مزوّدين على الأقل — المتوفر الآن: ${one} فقط.`;
}

/** اسم المزوّد للعرض الصادق في بطاقة الجواب. */
export function providerDisplayName(p: string): string {
  const names: Record<string, string> = { groq: "Groq", gemini: "Gemini", xai: "Grok" };
  return names[p] ?? p;
}
