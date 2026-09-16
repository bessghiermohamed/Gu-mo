/**
 * استوديو HTML (الجولة 85) — «مولّد التطبيقات» بنمط خط الأنابيب ذي الممرّين:
 *
 *   الممرّ 1 (توليد): صفحة HTML كاملة تحت قيود النمط المختار (archetype) —
 *     كل نمط يحمل لوحة ألوان وسلّم خطوط وقواعد مسافات ومفردات مكوّنات محدّدة،
 *     فتنحصر قرارات التصميم مسبقاً ويبقى للنموذج المحتوى والبناء فقط.
 *   الممرّ 2 (نقد): الناتج يُقيَّم عبر خمسة أبعاد (الخطوط، التنسيق، تناسق
 *     الألوان، أمانة المحتوى، الإتاحة) بحكم صارم: PASS يُشحن، REFINE يعيد
 *     التوليد مرة واحدة كحد أقصى مع الملاحظات — بلا حلقات أبداً.
 *
 * المصدر المنهجي: تقرير «Alborihi AI Studio» الفني (سبتمبر 2026) — تقنيتا
 * «النمط كتوليد مقيّد» و«خط التوليد-النقد ذو الممرّين»، مطبّقتان على هوية
 * «طالب» البصرية (عربي RTL أكاديمي) بمفاتيح المنصة نفسها (سلسلة المزوّدين
 * في lib/ai/providers) — بلا أي خدمة خارجية جديدة.
 *
 * النقاء: هذه الوحدة تستورد providers فقط — تُختبر بـ bun خارج Next.js
 * (قاعدة bot-api)، ولا تخزّن شيئاً: الطلب يسافر للمزوّد ثم يُنسى،
 * والصفحة تُسلَّم ملفاً في المحادثة ولا تلمس قاعدة البيانات إطلاقاً.
 *
 * حدود المالك الأمنية الثابتة (بقيت بعد r83 لأنها قاعدة مالك لا ميزة
 * جولة): طلب صفحة لالتقاط كلمات المرور/البطاقات/المفاتيح أو صفحة تصيّد
 * يُرفض محلياً قبل أي مزوّد — الذكاء الاصطناعي لا يُستعمل سلاحاً.
 */

import { chatComplete, type ChatMessage } from "./providers";

// ---------------------------------------------------------------------------
// الأنماط الأربعة (archetypes) — هوية «طالب»: عربي RTL أكاديمي هادئ
// ---------------------------------------------------------------------------

export interface ArchetypeSpec {
  id: string;
  label: string; // الاسم العربي المعروض
  hint: string; // متى يُختار
  aliases: string[]; // كلمات الاختيار في الأمر /html
  palette: Record<string, string>; // ألوان hex صريحة
  typeScale: string; // سلّم الخطوط
  spacing: string; // قواعد المسافات
  components: string[]; // مفردات المكوّنات المسموحة
  constraints: string[]; // قواعد صارمة لل prompt
}

export const ARCHETYPES: ArchetypeSpec[] = [
  {
    id: "study-card",
    label: "بطاقة مراجعة",
    hint: "تلخيص مركّز لمراجعة سريعة قبل المحاضرة أو الامتحان",
    aliases: ["بطاقة", "مراجعة", "بطاقة مراجعة", "study", "card"],
    palette: {
      background: "#F8FAF7",
      surface: "#FFFFFF",
      primary: "#2F6B4F",
      accent: "#C97B2D",
      text: "#1F2937",
      border: "#E2E8E4",
    },
    typeScale:
      "عنوان رئيسي 28px عريض، عناوين أقسام 20px، متن 16px بسطر 1.7، ملاحظات جانبية 14px",
    spacing: "بطاقات بحد شعاع 12px ومسافة 16px بينها، حشو داخلي 20px، هوامش صفحة 24px",
    components: [
      "شريط علوي رفيع بلون primary يحمل العنوان",
      "شبكة بطاقات صغيرة للفكرة الواحدة (كل فكرة بطاقة)",
      "صناديق «تذكّر» بحافة يسرى سميكة بلون accent",
      "قائمة تحقق بعلامات مربعة في الختام",
    ],
    constraints: [
      "كل بطاقة تحمل فكرة واحدة لا أكثر",
      "الطول المستهدف: صفحة واحدة إلى صفحتين عند الطباعة",
    ],
  },
  {
    id: "lesson-page",
    label: "صفحة درس",
    hint: "درس كامل منظم بأقسام وأمثلة وتنبيهات",
    aliases: ["درس", "صفحة درس", "lesson", "صفحة"],
    palette: {
      background: "#FBF9F4",
      surface: "#FFFFFF",
      primary: "#1E4E8C",
      accent: "#B23A48",
      text: "#23272E",
      border: "#E7E2D6",
    },
    typeScale:
      "ترويسة درس 30px عريضة، عناوين أقسام 21px مرقّمة، متن 16px بسطر 1.8، أمثلة 15px",
    spacing: "أقسام مفصولة بحدود سفلية رقيقة، حشو قسم 24px، أمثلة داخل صناديق بحشو 16px",
    components: [
      "ترويسة تحمل عنوان الدرس والمادة والسنة",
      "صندوق «أهداف الدرس» بقائمة مرقّمة في المقدمة",
      "صناديق أمثلة بخلفية سطح وحد رقيق",
      "صناديق «أخطاء شائعة» بحافة حمراء هادئة بلون accent",
      "خلاصة من ثلاث نقاط في الختام",
    ],
    constraints: [
      "الأقسام مرقّمة تسلسلياً (١، ٢، ٣…) بالأرقام العربية",
      "كل قسم يبدأ بجملة تعرّف به قبل التفصيل",
    ],
  },
  {
    id: "exam-prep",
    label: "ملخص امتحان",
    hint: "كثيف ومنظم لليلة الامتحان: جداول وصيغ وقوائم سريعة",
    aliases: ["امتحان", "اختبار", "ملخص امتحان", "exam", "test"],
    palette: {
      background: "#F7F6FB",
      surface: "#FFFFFF",
      primary: "#4C3A8C",
      accent: "#D97706",
      text: "#24242E",
      border: "#E4E1F0",
    },
    typeScale: "عنوان 28px، عناوين محاور 19px، جدول 14px مكثّف، صيغ 17px في صناديق بارزة",
    spacing: "جداول بصفوف متناوبة الخلفية، حشو خلايا 10px، صناديق صيغ بهامش 14px",
    components: [
      "ترويسة تحمل المادة ونطاق المحتوى",
      "جداول مقارنة (مفهوم / تعريف / مثال)",
      "صناديق صيغ بخلفية primary فاتحة ونص عريض",
      "شريط «أسئلة متوقعة» بقائمة قصيرة في الأسفل",
    ],
    constraints: [
      "الكثافة مقبولة لكن بلا ازدحام: محور لكل قسم لا أكثر",
      "الصيغ والرموز نص عادي واضح — واجهة الطباعة لا تفهم LaTeX",
    ],
  },
  {
    id: "showcase",
    label: "صفحة عرض",
    hint: "تقديم موضوع بهدوء وأناقة: عناوين كبيرة ومساحات سخية",
    aliases: ["عرض", "تقديم", "صفحة عرض", "showcase", "landing"],
    palette: {
      background: "#FAFAF8",
      surface: "#FFFFFF",
      primary: "#244C5A",
      accent: "#D08C60",
      text: "#26302E",
      border: "#E5E7E4",
    },
    typeScale: "عنوان بطولي 40px، سطر تمهيدي 20px، عناوين أقسام 22px، متن 16px بسطر 1.9",
    spacing: "مسافات سخية: 64px بين الأقسام، حاوية بعرض 720px وسط الصفحة",
    components: [
      "قسم بطولي واحد: عنوان كبير + سطر تعريفي",
      "ثلاثة أعمدة (تتلاءم عمودياً على الهاتف) لركائز الموضوع",
      "اقتباس مميز بحرف اقتباس كبير بلون accent",
      "خاتمة بسطر واحد ودعوة صغيرة للمراجعة",
    ],
    constraints: [
      "قليلٌ محكم خير من كثير مبعثر: لا تتجاوز خمسة أقسام",
      "المساحة البيضاء جزء من التصميم — لا تملأها حشواً",
    ],
  },
];

export const DEFAULT_ARCHETYPE_ID = "study-card";

export function findArchetype(idOrAlias: string): ArchetypeSpec | null {
  const q = (idOrAlias || "").trim().toLowerCase();
  if (!q) return null;
  for (const a of ARCHETYPES) {
    if (a.id === q) return a;
    for (const al of a.aliases) if (al.toLowerCase() === q) return a;
  }
  return null;
}

// ---------------------------------------------------------------------------
// تحليل الأمر /html
// ---------------------------------------------------------------------------

export const HTML_PROMPT_MIN = 5;
export const HTML_PROMPT_MAX = 1500;

export type ParsedHtmlCommand =
  | { kind: "help" }
  | { kind: "ok"; archetype: ArchetypeSpec; prompt: string }
  | { kind: "bad-prompt"; archetype: ArchetypeSpec | null; reason: "empty" | "short" | "long" };

/**
 * يحلّل نص الأمر بعد كلمة /html: أول كلمة قد تكون اسماً لنمط، والباقي وصف
 * الصفحة المطلوبة. بلا نمطٍ صريح يُعتمد «بطاقة مراجعة» — الاختيار الأكثر
 * توارداً لطالب يطلب تلخيص شيء.
 */
export function parseHtmlCommand(rest: string): ParsedHtmlCommand {
  const text = (rest ?? "").trim();
  if (!text) return { kind: "help" };

  const firstSpace = text.search(/\s/);
  const firstWord = (firstSpace === -1 ? text : text.slice(0, firstSpace)).trim();
  const remainder = firstSpace === -1 ? "" : text.slice(firstSpace + 1).trim();

  const asArchetype = findArchetype(firstWord);
  if (asArchetype) {
    if (!remainder) return { kind: "help" };
    return validatePrompt(asArchetype, remainder);
  }
  return validatePrompt(findArchetype(DEFAULT_ARCHETYPE_ID), text);
}

function validatePrompt(
  archetype: ArchetypeSpec | null,
  prompt: string
): ParsedHtmlCommand {
  const p = prompt.trim();
  if (!p) return { kind: "help" };
  if (p.length < HTML_PROMPT_MIN) return { kind: "bad-prompt", archetype, reason: "short" };
  if (p.length > HTML_PROMPT_MAX) return { kind: "bad-prompt", archetype, reason: "long" };
  return { kind: "ok", archetype: archetype as ArchetypeSpec, prompt: p };
}

// ---------------------------------------------------------------------------
// حرس المالك الأمني — يُفحص محلياً قبل أي مزوّد
// ---------------------------------------------------------------------------

const HARVEST_RE =
  /(سرقة|يسرق|تسرّب|تسرب|يجمع|تجمع|تجميع|التقاط|يلتقط|رحل|ravel|إرسال|ترسل|يرسل|حفظ|يحفظ)\s*(بيانات\s*)?(كلمات?\s*(المرور|السر)|بيانات\s*الدخول|بيانات\s*البطاقة|أرقام\s*البطاقات?|مفاتيح|كود\s*الدخول|رموز?\s*التحقق)/i;
const PHISHING_RE =
  /(تصيّد|تصيد|phishing)|صفحة\s*تسجيل\s*دخول\s*(مزيفة|وهمية|مقلّدة)|صفحة\s*دخول\s*(مزيفة|وهمية|مقلّدة)|موقع\s*دخول\s*(مزيف|وهمي|مقلّد)/i;
const CREDENTIAL_PAGE_RE =
  /(كلمات?\s*(المرور|السر)|بيانات\s*الدخول|بطاقات?\s*(بنكية|الائتمان)|credit\s*cards?)[^.]{0,40}(يرسلها|ترسلها|يحفظها|تحفظها|يجمعها|تجميعها|إلى\s*أعطيها)/i;

/** يرجّع رسالة الرفض إن كان الطلب يحاول أداة لالتقاط أسرار، أو null إن سلم. */
export function credentialsGuard(prompt: string): string | null {
  const p = prompt ?? "";
  if (isHarvestOrPhish(p)) {
    return "لا أستطيع بناء صفحة تجمع كلمات المرور أو بيانات البطاقات أو المفاتيح — هذا خارج حدودي الأمنية مهما كان الغرض. اعرض لي موضوعاً دراسياً وسأبني لك صفحة نظيفة له.";
  }
  return null;
}

/**
 * منطق الحرس بلا رسالة — للأدوات الأخرى (r86) التي تحتاج الحد نفسه
 * برسالة تناسب سياقها. صحيح = الطلب يحاول حصاد أسرار أو تصيّداً.
 */
export function isHarvestOrPhish(prompt: string): boolean {
  const p = prompt ?? "";
  return HARVEST_RE.test(p) || PHISHING_RE.test(p) || CREDENTIAL_PAGE_RE.test(p);
}

// ---------------------------------------------------------------------------
// بناء رسائل المزوّد — ممرّ التوليد وممرّ النقد
// ---------------------------------------------------------------------------

const ARABIC_FONT_STACK =
  '"Segoe UI", "Tahoma", "Noto Naskh Arabic", "Amiri", system-ui, sans-serif';

export function buildGeneratorSystem(archetype: ArchetypeSpec): string {
  const colors = Object.entries(archetype.palette)
    .map(([k, v]) => `${k}=${v}`)
    .join("، ");
  return [
    "أنت مهندس واجهات عربي دقيق داخل بوت «طالب» التعليمي الجزائري.",
    "مهمتك: توليد صفحة HTML5 كاملة واحدة من طلب الطالب، ملتزماً حرفياً بالنمط البصري المفروض أدناه.",
    "",
    "عقد المخرجات (صارم):",
    "• أخرج مستند HTML واحداً فقط: يبدأ بـ <!DOCTYPE html> وينتهي بـ </html> — بلا أي شرح أو نص أو أسوار كود حوله.",
    '• <html lang="ar" dir="rtl"> و <meta charset="UTF-8"> و <title> عربي معبّر.',
    "• التنسيق بأصناف Tailwind عبر السطر: <script src=\"https://cdn.tailwindcss.com\"></script> في <head>.",
    `• خط عربي من مكدس النظام فقط (font-family: ${ARABIC_FONT_STACK}) — بلا خطوط خارجية.`,
    "• بلا صور خارجية إطلاقاً وبلا جافاسكربت خارجي وبلا مكتبات إضافية — الصفحة نص وبصمة CSS خالصة،",
    "• بلا نماذج إرسال (form) وبلا تخزين محلي: صفحة قراءة ساكنة تماماً.",
    "• متجاوبة من الهاتف أولاً، وتبدو سليمة بعرض 360px.",
    "",
    `النمط المفروض: ${archetype.label} — ${archetype.hint}.`,
    `لوحة الألوان (التزم بها حرفياً): ${colors}.`,
    `سلّم الخطوط: ${archetype.typeScale}.`,
    `قواعد المسافات: ${archetype.spacing}.`,
    `مفردات المكوّنات (استعمل منها ولا تخترع عناصر غريبة عن النمط): ${archetype.components.join("؛ ")}.`,
    `قيود إضافية: ${archetype.constraints.join("؛ ")}.`,
    "",
    "قواعد المحتوى:",
    "• عربية فصحى مبسطة دقيقة، والمصطلح التقني يُترك بأصله اللاتيني بين قوسين عند الحاجة.",
    "• محتوى حقيقي مفيد مشتق من طلب الطالب بأمانة — لا نص حشو (Lorem) ولا فقرات فارغة عموماً.",
    "• إن نقص تفصيل جوهري في الطلب فاختر المحتوى التعليمي الأكثر رجحاناً للموضوع ولا تسأل.",
    "• الرياضيات والرموز نص عادي واضح (مثال: F = m × a) — بلا LaTeX ولا علامات دولار.",
  ].join("\n");
}

export function buildGeneratorMessages(
  archetype: ArchetypeSpec,
  prompt: string
): ChatMessage[] {
  return [
    {
      role: "user",
      content: `طلب الطالب: «${prompt}»\n\nولّد الصفحة الآن وفق العقد والنمط أعلاه — مستند HTML كامل فقط.`,
    },
  ];
}

const CRITIC_SYSTEM = [
  "أنت ناقد واجهات صارم لكن عادل، يقيّم صفحات HTML تعليمية عربية (RTL) لمنصة «طالب».",
  "تستقبل طلب الطالب الأصلي ورمز صفحة HTML، وتحكم عبر خمسة أبعاد من 0 إلى 5:",
  "1. typography: الخطوط والتسلسل الهرمي للعناوين ووضوح العربية.",
  "2. layout: التنسيق والمسافات والتجاوب للهاتف والقارئ.",
  "3. color: تناسق الألوان والتزامها بالنمط المطلوب وتباين النص.",
  "4. content: أمانة المحتوى للطلب — هل الصفحة تسلّم ما طُلب فعلاً بلا حشو؟",
  "5. accessibility: بنية دلالية (header/main/section)، لغة واتجاه صحيحان، تباين كافٍ.",
  "",
  "قواعد الحكم:",
  '• اجمع الحكم في الحقل verdict: "PASS" إذا كان كل بُعد ≥ 4 ولا خلل جوهري في أمانة المحتوى، وإلا "REFINE".',
  "• الصفحة بلا dir=\"rtl\" على عنصر html أو بلغة غير عربية = REFINE حتمي مهما كان الباقي.",
  '• إن كان الحكم REFINE فاكتب في notes ثلاث ملاحظات كحد أقصى قابلة للتنفيذ مباشرة (ماذا يغيّر بالضبط).',
  "",
  'أخرج JSON وحده بلا أي نص حوله، بهذا الشكل بالضبط:',
  '{"typography":0,"layout":0,"color":0,"content":0,"accessibility":0,"verdict":"PASS","notes":""}',
].join("\n");

export function buildCriticMessages(
  archetype: ArchetypeSpec,
  prompt: string,
  html: string
): ChatMessage[] {
  const trimmed = html.length > 24_000 ? html.slice(0, 24_000) + "\n<!-- مقطوع للعرض على الناقد -->" : html;
  return [
    {
      role: "user",
      content: [
        `النمط المطلوب: ${archetype.label} (${archetype.id}).`,
        `طلب الطالب الأصلي: «${prompt}»`,
        "رمز الصفحة:",
        "```html",
        trimmed,
        "```",
        "قيّم الصفحة عبر الأبعاد الخمسة وأخرج JSON الحكم فقط.",
      ].join("\n"),
    },
  ];
}

// ---------------------------------------------------------------------------
// استخراج HTML وتحليل حكم الناقد
// ---------------------------------------------------------------------------

export const HTML_SIZE_MAX = 250_000;

/** يستخرج مستند HTML كاملاً من جواب النموذج (يتجاهل الأسوار والشرح). */
export function extractHtml(text: string): { html: string; title: string } | null {
  if (!text) return null;
  let t = text.trim();
  // أزل أسوار الكود إن وُجدت
  t = t.replace(/^```[a-zA-Z]*\s*/m, "").replace(/```\s*$/m, "");
  const lower = t.toLowerCase();
  const start = lower.indexOf("<!doctype html") >= 0 ? lower.indexOf("<!doctype html") : lower.indexOf("<html");
  const end = lower.lastIndexOf("</html>");
  if (start === -1 || end === -1 || end <= start) return null;
  const html = t.slice(start, end + "</html>".length).trim();
  if (html.length < 400 || html.length > HTML_SIZE_MAX) return null;
  const tm = html.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i);
  const title = (tm?.[1] ?? "").replace(/\s+/g, " ").trim();
  return { html, title };
}

export interface CriticVerdict {
  typography: number;
  layout: number;
  color: number;
  content: number;
  accessibility: number;
  verdict: "PASS" | "REFINE";
  notes: string;
}

function clampScore(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(5, Math.round(n)));
}

/**
 * يحلّل جواب الناقد إلى حكم منظّم. يرجّع null إذا لم يوجد JSON مفهوم —
 * والمتصل يعامل null بوصفه «نقد غير متاح» فيشحن الناتج بدل إهدار جولة
 * تحسين على ناقدٍ مكسور (الفشل مفتوح بعد نجاح التحقق البنيوي).
 */
export function parseCriticVerdict(text: string): CriticVerdict | null {
  if (!text) return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const raw = JSON.parse(m[0]) as Record<string, unknown>;
    const verdictRaw = String(raw.verdict ?? "").toUpperCase();
    const verdict: "PASS" | "REFINE" = verdictRaw === "PASS" ? "PASS" : "REFINE";
    const notes = String(raw.notes ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 600);
    return {
      typography: clampScore(raw.typography),
      layout: clampScore(raw.layout),
      color: clampScore(raw.color),
      content: clampScore(raw.content),
      accessibility: clampScore(raw.accessibility),
      verdict,
      notes,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// المنسّق — خط الأنابيب الكامل بميزانية وقت
// ---------------------------------------------------------------------------

export interface HtmlStudioInput {
  prompt: string;
  archetype: ArchetypeSpec;
  /** لحظة الانتهاء الصارمة (Date.now() بالمللي) — يُتخطى التحسين إن شارف الوقت على النفاد */
  deadlineMs: number;
}

export interface HtmlStudioResult {
  html: string;
  title: string;
  archetypeId: string;
  archetypeLabel: string;
  refined: boolean;
  attempts: number; // كم صفحة وُلّدت فعلاً
  critique: CriticVerdict | null; // حكم الناقد الأخير (null = نقد غير متاح)
  provider: string;
  model: string;
}

const GEN_TIMEOUT_MS = 26_000;
const CRIT_TIMEOUT_MS = 13_000;
const REFINE_MIN_REMAINING_MS = 32_000;

/**
 * يشغّل خط الممرّين كاملاً: توليد ← نقد ← (تحسين واحد إن حكم الناقد REFINE
 * وبقيت ميزانية وقت) ← نقد ختامي. يرمي Error برسالة عربية صادقة عند فشل
 * التوليد أصلاً — والمتصل (البوت) يعرضها للطالب كما هي.
 */
export async function runHtmlStudio(input: HtmlStudioInput): Promise<HtmlStudioResult> {
  const { prompt, archetype, deadlineMs } = input;

  // ---- الممرّ 1: التوليد تحت القيود ----
  let gen = await generateOnce(archetype, prompt, GEN_TIMEOUT_MS);
  const first = extractHtml(gen.answer);
  if (!first) {
    throw new Error(
      "لم أتمكن من توليد صفحة سليمة هذه المرة — النموذج أعاد شيئاً آخر غير مستند HTML. أعد المحاولة، وإن تكرر فجرّب صياغة أقصر لطلبك."
    );
  }
  let current = first;
  let attempts = 1;

  // ---- الممرّ 2: النقد الخماسي ----
  let critique = await critiqueOnce(archetype, prompt, current.html);

  // ---- جولة التحسين الوحيدة (بلا حلقات) ----
  const remaining = deadlineMs - Date.now();
  if (critique && critique.verdict === "REFINE" && remaining > REFINE_MIN_REMAINING_MS) {
    const notes = critique.notes || "حسّن التنسيق والتجاوب والتزاماً بالنمط المطلوب.";
    const refineMessages: ChatMessage[] = [
      ...buildGeneratorMessages(archetype, prompt),
      { role: "assistant", content: current.html.slice(0, 30_000) },
      {
        role: "user",
        content: `تقرير الناقد على نسختك (${critique.verdict}): ${notes}\n\nأعد توليد الصفحة كاملة من الصفر معالجاً هذه الملاحظات كلها، بنفس عقد المخرجات حرفياً: مستند HTML كامل فقط.`,
      },
    ];
    try {
      const gen2 = await chatComplete(
        buildGeneratorSystem(archetype),
        refineMessages,
        AbortSignal.timeout(GEN_TIMEOUT_MS),
        { maxTokens: 8192 }
      );
      const second = extractHtml(gen2.answer);
      if (second) {
        current = second;
        attempts = 2;
        critique = await critiqueOnce(archetype, prompt, current.html);
      }
    } catch {
      // فشل التحسين أو نقدُه — نبقى على النسخة الأولى ونشحنها بصدق
    }
  }

  return {
    html: current.html,
    title: current.title || prompt.slice(0, 60),
    archetypeId: archetype.id,
    archetypeLabel: archetype.label,
    refined: attempts > 1,
    attempts,
    critique,
    provider: gen.provider,
    model: gen.model,
  };
}

async function generateOnce(
  archetype: ArchetypeSpec,
  prompt: string,
  timeoutMs: number
): Promise<{ answer: string; provider: string; model: string }> {
  return chatComplete(
    buildGeneratorSystem(archetype),
    buildGeneratorMessages(archetype, prompt),
    AbortSignal.timeout(timeoutMs),
    { maxTokens: 8192 }
  );
}

async function critiqueOnce(
  archetype: ArchetypeSpec,
  prompt: string,
  html: string
): Promise<CriticVerdict | null> {
  try {
    const res = await chatComplete(
      CRITIC_SYSTEM,
      buildCriticMessages(archetype, prompt, html),
      AbortSignal.timeout(CRIT_TIMEOUT_MS),
      { maxTokens: 2048, temperature: 0.2 }
    );
    return parseCriticVerdict(res.answer);
  } catch {
    return null; // النقد تحسينٌ لا شرط — غيابه لا يُسقط صفحة سليمة
  }
}

// ---------------------------------------------------------------------------
// نصوص البوت الجاهزة (عربية، صادقة، بلا تفاصيل المالك)
// ---------------------------------------------------------------------------

export function htmlHelpText(): string {
  const lines = [
    "أبني لك صفحة ويب عربية كاملة من وصف قصير — توليد ثم نقد خماسي (خطوط، تنسيق، ألوان، أمانة المحتوى، إتاحة) ثم تسليم الملف.",
    "",
    "الاستعمال:",
    "/html <وصف الصفحة>",
    "أو اختر النمط أولاً:",
    "",
    ...ARCHETYPES.map(
      (a) => `• ${a.label} — ${a.hint}\n  مثال: /html ${a.aliases[0]} <وصفك>`
    ),
    "",
    "ملاحظة: بلا نمطٍ صريح أستعمل «بطاقة مراجعة». الصفحة ملف HTML تعمل محلياً في متصفحك ولا يُحفظ شيء منها عندي.",
  ];
  return lines.join("\n");
}

export function htmlCaption(r: HtmlStudioResult): string {
  const critiqueLine = r.critique
    ? r.refined
      ? "اجتاز النقد الخماسي بعد جولة تحسين واحدة."
      : "اجتاز النقد الخماسي من الجولة الأولى."
    : "النقد الخماسي غير متاح هذه المرة — الشحن بعد التحقق البنيوي فقط.";
  const lines = [
    `📄 ${r.title}`,
    `النمط: ${r.archetypeLabel} · ${critiqueLine}`,
    "",
    "افتح الملف في متصفحك لرؤية الصفحة (تحتاج اتصالاً عند الفتح لتحميل Tailwind).",
    "لا شيء من طلبك يُحفظ عندي — الصفحة تُسلَّم في المحادثة ثم يُنسى كل شيء.",
  ];
  return lines.join("\n").slice(0, 1000);
}

export const HTML_ERROR_TEXT =
  "تعذّر بناء الصفحة هذه المرة — خدمة التوليد مثقلة أو غير مضبوطة. أعد المحاولة بعد قليل، أو اكتب /help لتعرف قدراتي الأخرى.";
