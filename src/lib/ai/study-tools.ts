/**
 * حزمة الأدوات الدراسية (الجولة 86) — خمس أدوات مستلهمة من خدمات منصات
 * التوليد (Alborihi AI نموذجاً: استوديو الترجمة، محلّل اللغة، Visualize،
 * وكَلاء كشف الكتابة الآلية، مراجعات Karpathy)، مطبّقة على هوية «طالب»
 * وبمفاتيح المنصة نفسها (سلسلة المزوّدين في lib/ai/providers) — بلا أي
 * خدمة خارجية جديدة ولا أي تخزين.
 *
 * الأدوات الخمس:
 *   1. /مخطط  — مخطط Mermaid من فكرة (انسيابي، خريطة ذهنية، تسلسل…) يُسلَّم
 *      ملفاً .mmd مع تذييل يشرح كيفية العرض (mermaid.live).
 *   2. /ترجم  — ترجمة أكاديمية أمينة: اكتشاف تلقائي (عربي→فرنسي، غير عربي→عربي)
 *      أو لغة هدف صريحة (fr، en، ar، es…).
 *   3. /تحليل — تحليل نص عربي: تصحيح، تشكيل، إعراب، صرف، معاني.
 *   4. /كشف  — تقدير احتمالي صادق أن نصاً أكاديمياً مولّد آلياً، بإشارات
 *      لغوية ونصيحة — مع تنبيه صريح أنه تقدير لا دليل.
 *   5. /مراجعة — مراجعة كود بنمط مراجعات Karpathy: مشاكل حقيقية، تبسيط،
 *      نسخة محسّنة — بلا اختلاق مشاكل لتملأ القائمة.
 *
 * النقاء: تُستورد providers وisHarvestOrPhish فقط — تُختبر بـ bun خارج
 * Next.js (قاعدة bot-api)، ولا تخزّن شيئاً: الطلب يسافر للمزوّد ثم يُنسى.
 *
 * حدود المالك الأمنية: أدوات التوليد (مخطط، مراجعة كود) تفحص الطلب محلياً
 * قبل أي مزوّد — حصاد أسرار أو تصيّد أو كود اختراق يُرفض. أدوات التحليل
 * (ترجم/تحليل/كشف) تعالج نص المستخدم كما تعالجه الدردشة العامة — بلا حرس.
 */

import { chatComplete, type ChatMessage } from "./providers";
import { isHarvestOrPhish } from "./html-studio";

// ---------------------------------------------------------------------------
// الحرس الأمني المشترك (توليد فقط)
// ---------------------------------------------------------------------------

const MALWARE_RE =
  /(botnet|بوت نت|روبوت نت|ransomware|فدية رقمية|برنامج خبيث|برمجيات خبيثة|تروجان\s*(اختراق|تجسس)?|keylogger|تسجيل ضغطات المفاتيح|اختراق حسابات?|اختراق الأجهزة|أدوات? اختراق|كود اختراق|سكربت اختراق|ddos|هجوم حجب خدمة)/i;

/** حرس أدوات التوليد (مخطط/مراجعة) — رسالة سياقية واحدة صادقة. */
export function studyGuard(prompt: string): string | null {
  if (isHarvestOrPhish(prompt)) {
    return "هذا خارج حدودي الأمنية مهما كان الغرض — لا أبني مخططات أو أراجع كوداً يخدم جمع كلمات المرور أو التصيّد. اعرض لي موضوعاً دراسياً نظيفاً وسأساعدك بكل سرور.";
  }
  if (MALWARE_RE.test(prompt)) {
    return "هذا خارج حدودي الأمنية مهما كان الغرض — لا أراجع أو أبني كوداً يهدف إلى الاختراق أو الإيذاء. إن كنت تدرس أمن المعلومات فاطلب مثلاً: «مخطط يشرح كيف يحمي الموقع نفسه من هجمات الحقن» — وسأساعدك بكل سرور.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// 1) استوديو المخططات (Visualize) — Mermaid
// ---------------------------------------------------------------------------

export interface DiagramTypeSpec {
  id: string;
  label: string; // الاسم العربي المعروض
  header: string; // أول سطر صالح في كود Mermaid
  aliases: string[]; // كلمات الاختيار في الأمر /مخطط
}

export const DIAGRAM_TYPES: DiagramTypeSpec[] = [
  { id: "flowchart", label: "مخطط انسيابي", header: "flowchart", aliases: ["انسيابي", "انسيابية", "flowchart", "flow"] },
  { id: "mindmap", label: "خريطة ذهنية", header: "mindmap", aliases: ["ذهنية", "خريطة", "mindmap", "mind"] },
  { id: "sequence", label: "مخطط تسلسل", header: "sequenceDiagram", aliases: ["تسلسل", "sequence", "seq"] },
  { id: "class", label: "مخطط أصناف", header: "classDiagram", aliases: ["أصناف", "كلاس", "class"] },
  { id: "er", label: "مخطط كيانات", header: "erDiagram", aliases: ["كيان", "كيانات", "er", "entity"] },
  { id: "state", label: "مخطط حالات", header: "stateDiagram-v2", aliases: ["حالة", "حالات", "state"] },
  { id: "gantt", label: "مخطط زمني", header: "gantt", aliases: ["زمني", "جانت", "gantt", "timeline"] },
  { id: "pie", label: "مخطط دائري", header: "pie", aliases: ["دائري", "pie", "نسب"] },
];

export function findDiagramType(idOrAlias: string): DiagramTypeSpec | null {
  const q = (idOrAlias || "").trim().toLowerCase();
  if (!q) return null;
  for (const t of DIAGRAM_TYPES) {
    if (t.id === q || t.header.toLowerCase() === q) return t;
    for (const al of t.aliases) if (al.toLowerCase() === q) return t;
  }
  return null;
}

export const DIAGRAM_PROMPT_MIN = 5;
export const DIAGRAM_PROMPT_MAX = 1000;
export const MERMAID_CODE_MAX = 12_000;
export const MERMAID_CODE_MIN = 15;

export type ParsedDiagramCommand =
  | { kind: "help" }
  | { kind: "ok"; type: DiagramTypeSpec | null; prompt: string } // type=null ← النموذج يختار
  | { kind: "bad-prompt"; reason: "short" | "long" };

/** يحلّل نص الأمر بعد كلمة /مخطط: أول كلمة قد تكون نوعاً، والباقي وصف الفكرة. */
export function parseDiagramCommand(rest: string): ParsedDiagramCommand {
  const text = (rest ?? "").trim();
  if (!text) return { kind: "help" };

  const firstSpace = text.search(/\s/);
  const firstWord = (firstSpace === -1 ? text : text.slice(0, firstSpace)).trim();
  const remainder = firstSpace === -1 ? "" : text.slice(firstSpace + 1).trim();

  const asType = findDiagramType(firstWord);
  if (asType) {
    if (!remainder) return { kind: "help" };
    return validateDiagramPrompt(asType, remainder);
  }
  return validateDiagramPrompt(null, text);
}

function validateDiagramPrompt(
  type: DiagramTypeSpec | null,
  prompt: string
): ParsedDiagramCommand {
  const p = prompt.trim();
  if (!p) return { kind: "help" };
  if (p.length < DIAGRAM_PROMPT_MIN) return { kind: "bad-prompt", reason: "short" };
  if (p.length > DIAGRAM_PROMPT_MAX) return { kind: "bad-prompt", reason: "long" };
  return { kind: "ok", type, prompt: p };
}

// ---- استخراج وتحقق من كود Mermaid ----

const MERMAID_HEADERS = [
  "flowchart", "graph", "mindmap", "sequencediagram", "classdiagram",
  "erdiagram", "statediagram-v2", "statediagram", "gantt", "pie",
];

/** يخرّج كود Mermaid من جواب النموذج: يزيل الأسوار، ويبدأ من أول سطر ترويسة معروفة. */
export function extractMermaid(text: string): string | null {
  if (!text) return null;
  let t = text.trim();
  t = t.replace(/^```[a-zA-Z]*\s*/m, "").replace(/```\s*$/m, "").trim();
  const lines = t.split("\n");
  const startIdx = lines.findIndex((l) => {
    const first = l.trim().toLowerCase().split(/\s+/, 1)[0] ?? "";
    return MERMAID_HEADERS.includes(first);
  });
  if (startIdx === -1) return null;
  const code = lines.slice(startIdx).join("\n").trim();
  if (code.length < MERMAID_CODE_MIN || code.length > MERMAID_CODE_MAX) return null;
  return code;
}

/** تحقق بنّي خفيف: ترويسة معروفة، بلا روابط خارجية، بلا أوامر تفاعل. */
export function validateMermaid(code: string): string | null {
  const c = (code ?? "").trim();
  if (!c) return "الكود فارغ.";
  const first = c.split("\n", 1)[0]?.trim().toLowerCase().split(/\s+/, 1)[0] ?? "";
  if (!MERMAID_HEADERS.includes(first)) return `أول سطر يجب أن يبدأ بنوع Mermaid معروف (مثل flowchart أو mindmap) — وجدت: «${first}».`;
  if (c.length < MERMAID_CODE_MIN) return "الكود قزم جداً — لا يكفي لمخطط مفيد.";
  if (c.length > MERMAID_CODE_MAX) return "الكود أطول من الحد المسموح (١٢ ألف حرف).";
  if (/https?:\/\//i.test(c)) return "المخططات النقية بلا روابط خارجية — أزل أي http/https من الكود.";
  if (/^\s*click\b/m.test(c)) return "أوامر التفاعل (click) غير مسموحة — مخطط قراءة ساكن فقط.";
  return null;
}

// ---- بناء رسائل المزوّد ----

export function buildDiagramSystem(type: DiagramTypeSpec | null): string {
  const typeRule = type
    ? `النوع مفروض: ${type.label} — أول سطر من الكود يجب أن يبدأ بـ ${type.header} حرفياً.`
    : "اختر النوع الأنسب للفكرة من: flowchart، mindmap، sequenceDiagram، classDiagram، erDiagram، stateDiagram-v2، gantt، pie — وأول سطر يبدأ به حرفياً.";
  return [
    "أنت مهندس مخططات Mermaid داخل بوت «طالب» التعليمي الجزائري.",
    "مهمتك: تحويل فكرة الطالب إلى كود Mermaid صحيح وبلا أخطاء صياغة.",
    "",
    "عقد المخرجات (صارم):",
    "• أخرج كود Mermaid وحده — بلا شرح ولا نص حوله ولا أسوار كود.",
    `• ${typeRule}`,
    '• التسميات العربية تُوضع بين علامتي تنصيص داخل العقد (مثال: A["المرحلة الأولى"]) — لا تترك نصاً عربياً فضفاضاً في الصياغة.',
    "• بلا روابط خارجية (http/https) وبلا أوامر تفاعل (click) وبلا استيراد ملفات — مخطط قراءة ساكن.",
    "• لا تزيد عن ٤٠ عقدة — مخطط مفهوم خير من مخطط شامل مبعثر.",
    "",
    "قواعد المحتوى:",
    "• مشتق المخطط بأمانة من فكرة الطالب — إن نقص تفصيل جوهري فاختر البنية التعليمية الأكثر رجحاناً للموضوع ولا تسأل.",
    "• عربية فصحى مبسطة في التسميات، والمصطلح التقني يبقى بأصله اللاتيني.",
  ].join("\n");
}

export function buildDiagramMessages(type: DiagramTypeSpec | null, prompt: string): ChatMessage[] {
  return [
    {
      role: "user",
      content: `فكرة الطالب: «${prompt}»\n\nولّد كود Mermaid الآن وفق العقد أعلاه — الكود فقط.`,
    },
  ];
}

// ---- المنسّق ----

export interface DiagramStudioInput {
  prompt: string;
  type: DiagramTypeSpec | null; // null ← النموذج يختار
  deadlineMs: number;
}

export interface DiagramStudioResult {
  code: string;
  typeLabel: string; // النوع الفعلي (المفروض أو المُكتشف من الكود)
  corrected: boolean; // هل احتاج جولة تصحيح صياغة؟
  provider: string;
  model: string;
}

const DIAGRAM_TIMEOUT_MS = 26_000;
const DIAGRAM_RETRY_MIN_MS = 20_000;

export async function runDiagramStudio(input: DiagramStudioInput): Promise<DiagramStudioResult> {
  const { prompt, type, deadlineMs } = input;

  let gen = await chatComplete(
    buildDiagramSystem(type),
    buildDiagramMessages(type, prompt),
    AbortSignal.timeout(DIAGRAM_TIMEOUT_MS),
    { maxTokens: 4096, temperature: 0.4 }
  );
  let answer = gen.answer;

  let code = extractMermaid(answer);
  let corrected = false;

  // جولة تصحيح صياغة واحدة (بلا حلقات) — إن كان الكود مكسوراً وبقيت ميزانية وقت
  if (!code || validateMermaid(code) !== null) {
    const remaining = deadlineMs - Date.now();
    if (remaining > DIAGRAM_RETRY_MIN_MS) {
      const reason = code ? validateMermaid(code) : "الجواب لم يحتوي كود Mermaid أصلاً.";
      const retryMessages: ChatMessage[] = [
        ...buildDiagramMessages(type, prompt),
        { role: "assistant", content: (code ?? answer).slice(0, 4000) },
        {
          role: "user",
          content: `فحص الصياغة وجد مشكلة: ${reason}\n\nأعد إخراج كود Mermaid كاملاً من الصفر مصلحاً هذا الخلل — الكود فقط بلا أي نص حوله.`,
        },
      ];
      try {
        const retry = await chatComplete(
          buildDiagramSystem(type),
          retryMessages,
          AbortSignal.timeout(DIAGRAM_TIMEOUT_MS),
          { maxTokens: 4096, temperature: 0.3 }
        );
        const retryCode = extractMermaid(retry.answer);
        if (retryCode && validateMermaid(retryCode) === null) {
          code = retryCode;
          corrected = true;
          gen = retry;
        }
      } catch {
        // فشل التصحيح — نحاول الشحن من الأول إن كان صالحاً
      }
    }
  }

  if (!code) {
    throw new Error(
      "لم أتمكن من بناء مخطط سليم هذه المرة — النموذج أعاد شيئاً آخر غير كود Mermaid. أعد المحاولة، وإن تكرر فجرّب وصفاً أقصر وأوضح."
    );
  }
  const finalReason = validateMermaid(code);
  if (finalReason) throw new Error(`تعذّر بناء مخطط سليم: ${finalReason} أعد المحاولة بوصف أوضح.`);

  // النوع الفعلي من ترويسة الكود النهائية
  const firstHeader = code.split("\n", 1)[0]?.trim().toLowerCase().split(/\s+/, 1)[0] ?? "";
  const actual = DIAGRAM_TYPES.find((t) => t.header.toLowerCase() === firstHeader);
  return {
    code,
    typeLabel: actual?.label ?? type?.label ?? "مخطط",
    corrected,
    provider: gen.provider,
    model: gen.model,
  };
}

export function diagramFileName(prompt: string): string {
  const base = (prompt || "talib-diagram")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, "-")
    .slice(0, 40)
    .replace(/^-+|-+$/g, "");
  return `${base || "talib-diagram"}.mmd`;
}

export function diagramCaption(r: DiagramStudioResult): string {
  const lines = [
    `🧭 ${r.typeLabel}${r.corrected ? " (بعد جولة تصحيح صياغة واحدة)" : " — اجتاز فحص الصياغة"}`,
    "",
    "للعرض: افتح mermaid.live أو أي محرر يدعم Mermaid (GitHub، Obsidian…) والصق الكود.",
    "لا شيء من طلبك يُحفظ عندي — الكود يُسلَّم في المحادثة ثم يُنسى كل شيء.",
  ];
  return lines.join("\n").slice(0, 1000);
}

export function diagramHelpText(): string {
  return [
    "أحوّل فكرتك إلى مخطط Mermaid جاهز للعرض — تصوّر بنّي، بلا روابط، بلا تفاعل.",
    "",
    "الاستعمال:",
    "/مخطط <وصف الفكرة>",
    "أو اختر النوع أولاً:",
    "",
    ...DIAGRAM_TYPES.map((t) => `• ${t.label} — مثال: /مخطط ${t.aliases[0]} <وصفك>`),
    "",
    "ملاحظة: بلا نوعٍ صريح أختار الأنسب للفكرة. تستلم ملفاً ‎.mmd‎ تفتحه في mermaid.live أو GitHub أو Obsidian.",
  ].join("\n");
}

export const DIAGRAM_ERROR_TEXT =
  "تعذّر بناء المخطط هذه المرة — خدمة التوليد مثقلة أو غير مضبوطة. أعد المحاولة بعد قليل.";

// ---------------------------------------------------------------------------
// 2) استوديو الترجمة الأكاديمية
// ---------------------------------------------------------------------------

export interface TargetLang {
  code: string;
  label: string; // الاسم العربي الذي يظهر في المساعدة
  prompt: string; // الاسم في تعليمات المزوّد
  aliases: string[];
}

export const TARGET_LANGS: TargetLang[] = [
  { code: "ar", label: "العربية", prompt: "العربية الفصحى", aliases: ["ar", "عربي", "عربية", "العربية", "arabic"] },
  { code: "fr", label: "الفرنسية", prompt: "الفرنسية (français académique)", aliases: ["fr", "فرنسي", "فرنسية", "الفرنسية", "french", "francais", "français"] },
  { code: "en", label: "الإنجليزية", prompt: "الإنجليزية (academic English)", aliases: ["en", "إنجليزي", "إنجليزية", "الإنجليزية", "انجليزي", "english"] },
  { code: "es", label: "الإسبانية", prompt: "الإسبانية (español)", aliases: ["es", "إسباني", "إسبانية", "الإسبانية", "spanish"] },
  { code: "de", label: "الألمانية", prompt: "الألمانية (Deutsch)", aliases: ["de", "ألماني", "ألمانية", "الألمانية", "german"] },
  { code: "it", label: "الإيطالية", prompt: "الإيطالية (italiano)", aliases: ["it", "إيطالي", "إيطالية", "الإيطالية", "italian"] },
  { code: "tr", label: "التركية", prompt: "التركية (Türkçe)", aliases: ["tr", "تركي", "تركية", "التركية", "turkish"] },
  { code: "pt", label: "البرتغالية", prompt: "البرتغالية (português)", aliases: ["pt", "برتغالي", "برتغالية", "البرتغالية", "portuguese"] },
  { code: "ru", label: "الروسية", prompt: "الروسية (русский)", aliases: ["ru", "روسي", "روسية", "الروسية", "russian"] },
  { code: "zh", label: "الصينية", prompt: "الصينية المبسطة", aliases: ["zh", "صيني", "صينية", "الصينية", "chinese"] },
  { code: "ja", label: "اليابانية", prompt: "اليابانية (日本語)", aliases: ["ja", "ياباني", "يابانية", "اليابانية", "japanese"] },
];

export function findLang(token: string): TargetLang | null {
  const q = (token || "").trim().toLowerCase();
  if (!q) return null;
  for (const l of TARGET_LANGS) {
    if (l.code === q) return l;
    for (const al of l.aliases) if (al.toLowerCase() === q) return l;
  }
  return null;
}

export const TRANSLATE_PROMPT_MIN = 2;
export const TRANSLATE_PROMPT_MAX = 4000;

export type ParsedTranslateCommand =
  | { kind: "help" }
  | { kind: "ok"; target: TargetLang | null; text: string } // target=null ← اكتشاف تلقائي
  | { kind: "bad-prompt"; reason: "short" | "long" };

/** بعد كلمة /ترجم: أول كلمة قد تكون لغة الهدف، والباقي هو النص. */
export function parseTranslateCommand(rest: string): ParsedTranslateCommand {
  const text = (rest ?? "").trim();
  if (!text) return { kind: "help" };

  const firstSpace = text.search(/\s/);
  const firstWord = (firstSpace === -1 ? text : text.slice(0, firstSpace)).trim();
  const remainder = firstSpace === -1 ? "" : text.slice(firstSpace + 1).trim();

  const asLang = findLang(firstWord);
  if (asLang) {
    if (!remainder) return { kind: "help" };
    return validateTranslatePrompt(asLang, remainder);
  }
  return validateTranslatePrompt(null, text);
}

function validateTranslatePrompt(
  target: TargetLang | null,
  text: string
): ParsedTranslateCommand {
  const t = text.trim();
  if (!t) return { kind: "help" };
  if (t.length < TRANSLATE_PROMPT_MIN) return { kind: "bad-prompt", reason: "short" };
  if (t.length > TRANSLATE_PROMPT_MAX) return { kind: "bad-prompt", reason: "long" };
  return { kind: "ok", target, text: t };
}

/** نسبة الحروف العربية من مجموع الحروف — العتبة ٣٠٪ تكفي لتمييز النص العربي. */
export function mostlyArabic(text: string): boolean {
  const letters = (text || "").replace(/[^\p{L}]/gu, "");
  if (!letters.length) return false;
  const ar = letters.match(/[\u0600-\u06FF]/gu)?.length ?? 0;
  return ar / letters.length >= 0.3;
}

/** اللغة الفعلية للهدف: الصريحة تسبق الاكتشاف — عربي→فرنسي وغير عربي→عربي (سياق جزائري). */
export function resolveTarget(text: string, explicit: TargetLang | null): TargetLang {
  if (explicit) return explicit;
  return mostlyArabic(text) ? findLang("fr") as TargetLang : findLang("ar") as TargetLang;
}

export function buildTranslateSystem(target: TargetLang): string {
  return [
    "أنت مترجم أكاديمي محترف داخل بوت «طالب» التعليمي الجزائري.",
    `مهمتك: ترجمة النص الذي سيرده الطالب إلى ${target.prompt} — ترجمة أمينة دقيقة، لا تفسير ولا شرح ولا تحسين خارج ما كتبه.`,
    "",
    "عقد المخرجات (صارم):",
    "• أخرج الترجمة وحدها — بلا مقدمات ولا خاتمة ولا تعليق على اللغة الأصل.",
    "• حافظ على البنية سطراً بسطر: قائمة تبقى قائمة، وجدول يبقى جدولاً، وتعداد يبقى تعداداً.",
    "• الأرقام والصيغ والرموز تبقى كما هي (مثال: F = m × a لا تُترجم ولا تُعاد صياغتها).",
    "• المصطلح العلمي/التقني الذي لا مقابل شائع له في اللغة الهدف: اتركه بأصله اللاتيني بين قوسين بعد أقرب مقابل.",
    "• إن كان النص مبتوراً أو غامضاً فترجمه بأمانة بلا تعويض النقص — أمانة المترجم فوق الكمال.",
  ].join("\n");
}

export function buildTranslateMessages(text: string): ChatMessage[] {
  return [{ role: "user", content: text.slice(0, TRANSLATE_PROMPT_MAX) }];
}

export interface TranslateStudioResult {
  translation: string;
  targetLabel: string; // اللغة الفعلية التي تُرجم إليها
  autoDetected: boolean;
  provider: string;
  model: string;
}

export async function runTranslateStudio(
  text: string,
  explicit: TargetLang | null
): Promise<TranslateStudioResult> {
  const target = resolveTarget(text, explicit);
  const { answer, provider, model } = await chatComplete(
    buildTranslateSystem(target),
    buildTranslateMessages(text),
    AbortSignal.timeout(40_000),
    { maxTokens: 4096, temperature: 0.3 }
  );
  const translation = answer.trim().replace(/^["«]([\s\S]*)["»]$/, "$1").trim();
  if (!translation) {
    throw new Error("جاءت الترجمة فارغة من المزوّد — أعد المحاولة بعد قليل.");
  }
  return {
    translation,
    targetLabel: target.label,
    autoDetected: !explicit,
    provider,
    model,
  };
}

export function translateHelpText(): string {
  const langs = TARGET_LANGS.slice(0, 6).map((l) => l.code).join("، ");
  return [
    "أترجم نصوصك الدراسية ترجمة أكاديمية أمينة — بلا شرح ولا حشو.",
    "",
    "الاستعمال:",
    "/ترجم <النص> ← ترجمة تلقائية: عربي→فرنسي، وفرنسي/إنجليزي→عربي.",
    `/ترجم <لغة> <النص> ← إلى لغة صريحة. اللغات: ${langs}… (مثال: /ترجم en النص)`,
    "",
    "أمثلة:",
    "• /ترجم وصف تجربة المقاومة الكهربائية",
    "• /ترجم fr لن نهاية الخطة العلاجية",
    "",
    "الترجمة تصل نصاً هنا مباشرة — لا شيء يُحفظ عندي.",
  ].join("\n");
}

export const TRANSLATE_ERROR_TEXT =
  "تعذّرت الترجمة هذه المرة — خدمة الترجمة مثقلة أو غير مضبوطة. أعد المحاولة بعد قليل.";

// ---------------------------------------------------------------------------
// 3) محلّل اللغة العربية
// ---------------------------------------------------------------------------

export const ANALYZE_PROMPT_MIN = 3;
export const ANALYZE_PROMPT_MAX = 1500;

export type ParsedAnalyzeCommand =
  | { kind: "help" }
  | { kind: "ok"; text: string }
  | { kind: "bad-prompt"; reason: "short" | "long" };

export function parseAnalyzeCommand(rest: string): ParsedAnalyzeCommand {
  const t = (rest ?? "").trim();
  if (!t) return { kind: "help" };
  if (t.length < ANALYZE_PROMPT_MIN) return { kind: "bad-prompt", reason: "short" };
  if (t.length > ANALYZE_PROMPT_MAX) return { kind: "bad-prompt", reason: "long" };
  return { kind: "ok", text: t };
}

export const ANALYZE_SECTION_HEADERS = [
  "التصحيح:",
  "التشكيل:",
  "الإعراب:",
  "الصرف:",
  "المعاني:",
];

export function buildAnalyzeSystem(): string {
  return [
    "أنت نحوي وصرفي عربي خبير داخل بوت «طالب» التعليمي الجزائري، تشرح ببساطة وضبط للطلاب.",
    "مهمتك: تحليل النص العربي الذي سيرده الطالب، وإخراج الأقسام الخمسة التالية بهذه العناوين حرفياً — بلا أي مقدمة:",
    ...ANALYZE_SECTION_HEADERS.map((h, i) => `${i + 1}. ${h}`),
    "",
    "قواعد كل قسم:",
    "• التصحيح: النص مصححاً إن كان فيه أخطاء إملائية أو نحوية، أو عبارة «بلا أخطاء تُذكر» إن كان سليماً.",
    "• التشكيل: النص مشكولاً تشكيلاً علمياً دقيقاً — وإن طال النص فشكّل أول ٣٠ كلمة ثم اكتب (…).",
    "• الإعراب: إعراب مختصر لأدوار الجملة الأولى (٢ إلى ٥ أسطر) — كل دور في سطر.",
    "• الصرف: حتى ٤ كلمات مختارة، لكل واحدة: الجذر، الوزن، النوع (اسم/فعل/حرف).",
    "• المعاني: ٣ كلمات من النص، لكل واحدة مرادف واضح أو معنى موجز.",
    "",
    "حالات خاصة:",
    "• إن لم يكن النص عربياً فأخرج سطراً واحداً: «النص ليس عربياً — أرسله عبر /ترجم لأترجمه، أو أرسل نصاً عربياً لأحلله.»",
    "• اجمع كل الأقسام في ٢٠٠٠ حرف كحد أقصى — الاختصار المفيد خير من الإطناب.",
    "• الرياضيات والرموز نص عادي واضح — واجهة تيليجرام لا تعرض LaTeX.",
  ].join("\n");
}

export interface AnalyzeStudioResult {
  analysis: string;
  provider: string;
  model: string;
}

export async function runAnalyzeStudio(text: string): Promise<AnalyzeStudioResult> {
  const { answer, provider, model } = await chatComplete(
    buildAnalyzeSystem(),
    [{ role: "user", content: text.slice(0, ANALYZE_PROMPT_MAX) }],
    AbortSignal.timeout(40_000),
    { maxTokens: 2048, temperature: 0.2 }
  );
  const analysis = answer.trim();
  if (!analysis) throw new Error("جاء التحليل فارغاً من المزوّد — أعد المحاولة بعد قليل.");
  return { analysis, provider, model };
}

export function analyzeHelpText(): string {
  return [
    "أحلل نصك العربي تحليلاً نحوياً صرفياً كاملاً:",
    "• التصحيح — الإملاء والنحو",
    "• التشكيل — تشكيل علمي دقيق",
    "• الإعراب — أدوار الجملة الأولى",
    "• الصرف — الجذر والوزن والنوع",
    "• المعاني — مرادفات مختارة",
    "",
    "الاستعمال: /تحليل <نص عربي>",
    "مثال: /تحليل إن الطلاب المجتهدين يناجحون بامتياز",
    "",
    "التحليل يصل نصاً هنا مباشرة — لا شيء يُحفظ عندي.",
  ].join("\n");
}

export const ANALYZE_ERROR_TEXT =
  "تعذّر التحليل هذه المرة — خدمة الذكاء الاصطناعي مثقلة أو غير مضبوطة. أعد المحاولة بعد قليل.";

// ---------------------------------------------------------------------------
// 4) كاشف الكتابة الآلية — تقدير صادق لا دليل
// ---------------------------------------------------------------------------

export const DETECT_PROMPT_MIN = 120; // النص القصير لا يحمل إشارات كافية — الصدق قبل الميزة
export const DETECT_PROMPT_MAX = 6000;

export type ParsedDetectCommand =
  | { kind: "help" }
  | { kind: "ok"; text: string }
  | { kind: "bad-prompt"; reason: "short" | "long" };

export function parseDetectCommand(rest: string): ParsedDetectCommand {
  const t = (rest ?? "").trim();
  if (!t) return { kind: "help" };
  if (t.length < DETECT_PROMPT_MIN) return { kind: "bad-prompt", reason: "short" };
  if (t.length > DETECT_PROMPT_MAX) return { kind: "bad-prompt", reason: "long" };
  return { kind: "ok", text: t };
}

export type DetectVerdictKind = "human-leaning" | "mixed" | "ai-leaning";

export interface DetectVerdict {
  probability: number; // 0..100 — تقدير أن النص مولّد آلياً
  verdict: DetectVerdictKind;
  signals: string[]; // 2..4 إشارات لغوية من النص نفسه
  advice: string;
}

export function buildDetectSystem(): string {
  return [
    "أنت خبير في تمييز النصوص الأكاديمية المولّدة بالنماذج اللغوية، تخدم منصة «طالب» الأكاديمية الجزائرية.",
    "تستقبل نصاً أكاديمياً (عربي أو فرنسي أو إنجليزي) وتقدّر احتمال أن نموذجاً لغوياً تولّده.",
    "",
    "قواعد الصدق (حاسمة):",
    "• التقدير احتمالي دائماً — النماذج تتطور والتمييز غير مضمون. لا تضع يقيناً أبداً.",
    "• اعتمد إشارات لغوية ملموسة في النص نفسه فقط: تكرار تركيبي، انتقالات نمطية، غياب أمثلة شخصية أو محلية، دقة لغوية غير معتادة، علامات ترقيم مثالية، عمودية البنية.",
    "• النص البشري المحترف قد يحكم على نفسه خطأً — لذلك لا يتجاوز التقدير الحاسم ٩٠٪ أبداً: اكتب ٨٥ كحد أقصى للنصوص الأشد آلية.",
    "",
    "أخرج JSON وحده بلا أي نص حوله، بهذا الشكل بالضبط:",
    '{"probability":0,"verdict":"human-leaning","signals":["",""],"advice":""}',
    "",
    "• probability: عدد من 0 إلى 100 — النسبة التقديرية أن النص مولّد آلياً.",
    '• verdict: "human-leaning" إن كان probability أقل من 35، و"mixed" بين 35 و 65، و"ai-leaning" فوق 65.',
    "• signals: من 2 إلى 4 إشارات، كل واحدة ≤ 120 حرفاً، مشتقة من النص ذاته لا من الظن.",
    '• advice: سطر واحد عملي للطالب أو الأستاذ (≤ 200 حرف) بلا تجريم — مثل: «أضف أمثلتك المحلية وتجربتك الشخصية ليصبح النص أكثر أصالة».',
  ].join("\n");
}

export const DETECT_VERDICT_LABELS: Record<DetectVerdictKind, string> = {
  "human-leaning": "الأرجح نص بشري الكتابة",
  mixed: "مزيج محتمل — تحرير بشري على مسودة آلية أو العكس",
  "ai-leaning": "الأرجح نص مولّد آلياً",
};

function clampProbability(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(85, Math.round(n)));
}

function normalizeVerdict(v: unknown, probability: number): DetectVerdictKind {
  const s = String(v ?? "").toLowerCase();
  if (s === "human-leaning" || s === "mixed" || s === "ai-leaning") return s;
  return probability < 35 ? "human-leaning" : probability <= 65 ? "mixed" : "ai-leaning";
}

/** يحلل جواب المزوّد إلى حكم منظّم — null إن لم يوجد JSON مفهوم. */
export function parseDetectVerdict(text: string): DetectVerdict | null {
  if (!text) return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const raw = JSON.parse(m[0]) as Record<string, unknown>;
    const probability = clampProbability(raw.probability);
    const signals = Array.isArray(raw.signals)
      ? raw.signals
          .map((s) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 120))
          .filter(Boolean)
          .slice(0, 4)
      : [];
    if (signals.length < 2) return null; // بلا إشارات ملموسة لا حكم — الصدق قبل الميزة
    const advice = String(raw.advice ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
    return { probability, verdict: normalizeVerdict(raw.verdict, probability), signals, advice };
  } catch {
    return null;
  }
}

export function formatDetectMessage(v: DetectVerdict): string {
  return [
    `تقدير احتمال الكتابة الآلية: ${v.probability}٪ — ${DETECT_VERDICT_LABELS[v.verdict]}`,
    "",
    "الإشارات الملموسة:",
    ...v.signals.map((s) => `• ${s}`),
    ...(v.advice ? ["", `نصيحة: ${v.advice}`] : []),
    "",
    "تنبيه صادق: هذا تقدير لغوي احتمالي لا يُعد دليلاً قاطعاً — لا تُحاسب أحداً بناءً عليه وحده، واستعمله لتحسين الكتابة لا للاتهام.",
  ].join("\n").slice(0, 3800);
}

export interface DetectStudioResult {
  verdict: DetectVerdict;
  provider: string;
  model: string;
}

export async function runDetectStudio(text: string): Promise<DetectStudioResult> {
  const { answer, provider, model } = await chatComplete(
    buildDetectSystem(),
    [{ role: "user", content: `النص المراد فحصه:\n${text.slice(0, DETECT_PROMPT_MAX)}` }],
    AbortSignal.timeout(40_000),
    { maxTokens: 1024, temperature: 0.2 }
  );
  const verdict = parseDetectVerdict(answer);
  if (!verdict) {
    throw new Error(
      "لم أستطع تكوين حكم سليم على هذا النص هذه المرة — لم تكتمل الإشارات. أعد المحاولة، وإن تكرر فجرّب نصاً أطول قليلاً."
    );
  }
  return { verdict, provider, model };
}

export function detectHelpText(): string {
  return [
    "أقدّر احتمال أن نصاً أكاديمياً مولّد آلياً — بتقدير نسبة وإشارات لغوية ونصيحة.",
    "",
    "الاستعمال: /كشف <النص> (من ١٢٠ حرفاً فأكثر)",
    "",
    "أصدقك صراحة: النتيجة تقدير لغوي احتمالي لا دليل قاطعاً — النماذج تتطور والنص البشري المحترف قد يُظنّ آلياً. استعمله لتحسين كتابتك لا للاتهام.",
    "",
    "لا شيء من النص يُحفظ عندي — يُفحص ثم يُنسى.",
  ].join("\n");
}

export const DETECT_ERROR_TEXT =
  "تعذّر الفحص هذه المرة — خدمة الذكاء الاصطناعي مثقلة أو غير مضبوطة. أعد المحاولة بعد قليل.";

// ---------------------------------------------------------------------------
// 5) مراجع الكود — بنمط مراجعات Karpathy
// ---------------------------------------------------------------------------

export const REVIEW_PROMPT_MIN = 10;
export const REVIEW_PROMPT_MAX = 6000;

export type ParsedReviewCommand =
  | { kind: "help" }
  | { kind: "ok"; code: string; note: string } // note وصف الطالب قبل/بعد الكود (إن وجد)
  | { kind: "bad-prompt"; reason: "short" | "long" };

/** يستخرج الكود من أسوار ``` إن وُجدت، وإلا فالنص كله هو الكود. */
export function extractReviewCode(rest: string): { code: string; note: string } {
  const t = (rest ?? "").trim();
  const fence = t.match(/```[a-zA-Z0-9+#-]*\s*\n([\s\S]*?)```/);
  if (fence) {
    const note = t.replace(/```[a-zA-Z0-9+#-]*\s*\n[\s\S]*?```/g, "").trim();
    return { code: fence[1].trim(), note: note.slice(0, 400) };
  }
  return { code: t, note: "" };
}

export function parseReviewCommand(rest: string): ParsedReviewCommand {
  const t = (rest ?? "").trim();
  if (!t) return { kind: "help" };
  const { code, note } = extractReviewCode(t);
  if (code.length < REVIEW_PROMPT_MIN) return { kind: "bad-prompt", reason: "short" };
  if (code.length > REVIEW_PROMPT_MAX) return { kind: "bad-prompt", reason: "long" };
  return { kind: "ok", code, note };
}

export const REVIEW_SECTION_HEADERS = ["ما يفعله:", "مشاكل:", "تبسيط:", "نسخة محسّنة:"];

export function buildReviewSystem(): string {
  return [
    "أنت مراجع كود صارم لكن عادل (بنمط مراجعات Karpathy) داخل بوت «طالب» التعليمي الجزائري — تخدم طلاب علوم الحاسوب والإلكترونيك والمهن التقنية.",
    "تستقبل كود الطالب (أي لغة برمجة) مع وصفه إن كتبه، وتراجعه بالعربية مع إبقاء المعرّفات والكود بأصلها اللاتيني.",
    "",
    "أخرج الأقسام الأربعة بهذه العناوين حرفياً — بلا أي مقدمة:",
    "1. ما يفعله:",
    "2. مشاكل:",
    "3. تبسيط:",
    "4. نسخة محسّنة:",
    "",
    "قواعد كل قسم:",
    "• ما يفعله: سطر إلى سطرين بأمانة — بلا مبالغة في الثناء.",
    "• مشاكل: من 0 إلى 4 مشاكل حقيقية مرقّمة (أخطاء منطقية، حالات حدّية، استثناءات غير معالجة، أداء) — كل واحدة مع موضعها إن أمكن. لا مشاكل جوهرية؟ اكتب «لا مشاكل جوهرية ظاهرة» — الصمت عند السلامة أصدق من الاختلاق.",
    "• تبسيط: من 1 إلى 3 اقتراحات ملموسة تجعله أقصر أو أوضح — بلا تفضّل أسلوبي مبالغ فيه.",
    "• نسخة محسّنة: نسخة كاملة في كتلة كود واحدة — فقط إذا كانت التغييرات ذات معنى فعلاً؛ وإلا اكتب «الكود جيد كما هو».",
    "",
    "قواعد عامة:",
    "• التعليقات داخل الكود المُحسَّن بالعربية إن أضفتها، والمعرّفات بالأصل اللاتيني.",
    "• بلا ملاحظات عن أسلوب كتابة الشخص أو تفضيلات مكتبات — المشكلة الحقيقية أولى.",
    "• الرياضيات في الشرح نص عادي واضح — واجهة تيليجرام لا تعرض LaTeX.",
  ].join("\n");
}

export function buildReviewMessages(code: string, note: string): ChatMessage[] {
  return [
    {
      role: "user",
      content: [
        note ? `وصف الطالب: «${note}»` : "",
        "الكود:",
        "```",
        code.slice(0, REVIEW_PROMPT_MAX),
        "```",
        "راجع الكود وفق العقد أعلاه — الأقسام الأربعة فقط.",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
}

export interface ReviewStudioResult {
  review: string;
  provider: string;
  model: string;
}

export async function runReviewStudio(code: string, note: string): Promise<ReviewStudioResult> {
  const { answer, provider, model } = await chatComplete(
    buildReviewSystem(),
    buildReviewMessages(code, note),
    AbortSignal.timeout(45_000),
    { maxTokens: 3072, temperature: 0.2 }
  );
  const review = answer.trim();
  if (!review) throw new Error("جاءت المراجعة فارغة من المزوّد — أعد المحاولة بعد قليل.");
  return { review, provider, model };
}

export function reviewHelpText(): string {
  return [
    "أراجع كودك مراجعة هادئة صارمة: ما يفعله، مشاكل حقيقية، تبسيط، ونسخة محسّنة إن استحق.",
    "",
    "الاستعمال:",
    "/مراجعة ثم ألصق الكود (مع أسوار ``` أفضل — يحفظ التنسيق)",
    "",
    "مثال:",
    "/مراجعة ```\ndef somme(l): return sum(l)```",
    "",
    "أي لغة: Python، JavaScript، C، Java، MATLAB… المراجعة تصل نصاً هنا مباشرة — لا شيء يُحفظ عندي.",
  ].join("\n");
}

export const REVIEW_ERROR_TEXT =
  "تعذّرت المراجعة هذه المرة — خدمة الذكاء الاصطناعي مثقلة أو غير مضبوطة. أعد المحاولة بعد قليل.";
