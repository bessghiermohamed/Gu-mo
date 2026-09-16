/**
 * دفتر طالب (الجولة 87) — مساحة دراسية بأسلوب NotebookLM داخل «أدواتي»:
 * الطالب يضيف مصادره (لصق، ملفات نصية، استخراج PDF داخل جهازه)، ثم يحادث
 * المقتطفات باستشهاد صادق [م1] [م2]، أو يولّد مخرجات دراسية جاهزة (ملخّص،
 * دليل دراسة، اختبار، بطاقات استذكار، خط زمني، أسئلة شائعة، ملخّص صوتي
 * حواري، خريطة ذهنية Mermaid).
 *
 * النقاء (قاعدة bot-api/study-tools): تُستورد providers وstudy-tools فقط —
 * تُختبر بـ bun خارج Next.js، ولا تخزّن شيئاً: الطلب يسافر للمزوّد ثم يُنسى.
 *
 * تقسيم العمل بين الجهاز والخادم (أمانة خصوصية المنصة):
 *   - التقطيع والاسترجاع يعملان في متصفح الطالب (هذان الملفان نفسهما) —
 *     الخادم لا يرى مصادره كاملة أبداً، بل المقتطفات المختارة لهذا السؤال فقط.
 *   - الخادم يتحقق من الأحجام والحصص ويضبط دور النظام ويوصل بالمزوّد.
 *
 * حدود المالك الأمنية: الدفتر أداة تحليل لمحتوى الطالب نفسه (كالترجمة
 * والتحليل في r86) — بلا حرس توليد؛ المزوّد نفسه يبقى الحدود النهائية،
 * والخصوصية تعود لكون المقتطفات تُرسل لهذا الطلب ثم تُنسى.
 */

import { type ChatMessage } from "./providers";
import { extractMermaid, validateMermaid } from "./study-tools";

// ---------------------------------------------------------------------------
// الحدود — ثوابت معلنة يُبنى عليها في العميل والخادم معاً
// ---------------------------------------------------------------------------

export const MAX_SOURCES = 8;
export const SOURCE_MAX_CHARS = 30_000;
export const CHUNK_SIZE = 600;
export const CHUNK_OVERLAP = 80;

export const CHAT_EXCERPT_BUDGET = 9_000;
export const CHAT_MAX_EXCERPTS = 10;
export const CHAT_HISTORY_MAX_TURNS = 12;
export const CHAT_HISTORY_MAX_CHARS = 12_000;
export const QUESTION_MAX_CHARS = 2_000;

export const CORPUS_BUDGET = 26_000;

/** حدود الفحص على الخادم = حدود العميل + هامش انسياب بسيط (لا رفض كاذب). */
export const EXCERPTS_SERVER_SLACK = 2_000;
export const CORPUS_SERVER_SLACK = 4_000;

export const MIN_QUIZ_QUESTIONS = 4;
export const MAX_QUIZ_QUESTIONS = 12;
export const MIN_FLASHCARDS = 4;
export const MAX_FLASHCARDS = 20;
export const MIN_FAQ_ITEMS = 3;
export const MAX_FAQ_ITEMS = 10;
export const MIN_TIMELINE_EVENTS = 3;
export const MAX_TIMELINE_EVENTS = 14;
export const MIN_CONCEPTS = 3;
export const MAX_CONCEPTS = 10;
export const MIN_GUIDE_QUESTIONS = 3;
export const MAX_GUIDE_QUESTIONS = 10;
export const MIN_AUDIO_SEGMENTS = 5;
export const MAX_AUDIO_SEGMENTS = 18;

export const AUDIO_SPEAKERS = ["المذيع", "الخبيرة"] as const;

export const NOTEBOOK_PARSE_ERROR =
  "خرجت المخرجات بصيغة غير مفهومة هذه المرة — أعد المحاولة، وإن تكرر فجرّب مصادر أقصر أو أوضح.";
export const MINDMAP_TYPE_ERROR =
  "المخرج ليس خريطة ذهنية (mindmap) — أعد المحاولة ليُبنى المخطط بالنوع المطلوب.";
export const NO_EXCERPTS_ERROR = "أضف مصدراً واحداً على الأقل إلى الدفتر أولاً — الحديث يعمل من مصادرك لا من الخيال.";

// ---------------------------------------------------------------------------
// الأنواع
// ---------------------------------------------------------------------------

export type ArtifactAction =
  | "summary"
  | "study-guide"
  | "quiz"
  | "flashcards"
  | "timeline"
  | "faq"
  | "audio-script"
  | "mindmap";

export type NotebookAction = "chat" | ArtifactAction;

export const ARTIFACT_ACTIONS: ArtifactAction[] = [
  "summary",
  "study-guide",
  "quiz",
  "flashcards",
  "timeline",
  "faq",
  "audio-script",
  "mindmap",
];

export function isArtifactAction(a: unknown): a is ArtifactAction {
  return typeof a === "string" && (ARTIFACT_ACTIONS as string[]).includes(a);
}

export function isNotebookAction(a: unknown): a is NotebookAction {
  return a === "chat" || isArtifactAction(a);
}

export interface ArtifactMeta {
  action: ArtifactAction;
  label: string;
  desc: string;
}

/** كتالوج المخرجات — يعرضه زر «أدوات الدراسة» بالترتيب نفسه. */
export const ARTIFACT_CATALOG: ArtifactMeta[] = [
  { action: "summary", label: "ملخّص شامل", desc: "فقرة تلخيص وأهم النقاط" },
  { action: "study-guide", label: "دليل الدراسة", desc: "مفاهيم مفتاحية وأسئلة بنماذج إجابة" },
  { action: "quiz", label: "اختبار تدريبي", desc: "اختيار من متعدد بتصحيح فوري" },
  { action: "flashcards", label: "بطاقات استذكار", desc: "بطاقات أمام/خلف للمراجعة السريعة" },
  { action: "timeline", label: "خط زمني", desc: "مراحل وأحداث مرتّبة زمنياً" },
  { action: "faq", label: "أسئلة شائعة", desc: "أسئلة متوقعة بنماذج أجوبتها" },
  { action: "audio-script", label: "ملخّص صوتي", desc: "حوار مذيع وخبيرة يُقرأ بصوت جهازك" },
  { action: "mindmap", label: "خريطة ذهنية", desc: "مخطط Mermaid جاهز للاستعراض" },
];

export interface SummaryResult {
  title: string;
  summary: string;
  keyPoints: string[];
}
export interface StudyGuideResult {
  concepts: Array<{ term: string; definition: string }>;
  questions: Array<{ question: string; answer: string }>;
  tips: string[];
}
export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}
export interface QuizResult {
  questions: QuizQuestion[];
}
export interface FlashcardsResult {
  cards: Array<{ front: string; back: string }>;
}
export interface TimelineResult {
  events: Array<{ label: string; detail: string }>;
}
export interface FaqResult {
  items: Array<{ question: string; answer: string }>;
}
export interface AudioScriptResult {
  segments: Array<{ speaker: string; text: string }>;
}
export interface MindmapResult {
  code: string;
}

export type ArtifactResult =
  | { kind: "summary"; data: SummaryResult }
  | { kind: "study-guide"; data: StudyGuideResult }
  | { kind: "quiz"; data: QuizResult }
  | { kind: "flashcards"; data: FlashcardsResult }
  | { kind: "timeline"; data: TimelineResult }
  | { kind: "faq"; data: FaqResult }
  | { kind: "audio-script"; data: AudioScriptResult }
  | { kind: "mindmap"; data: MindmapResult };

// ---------------------------------------------------------------------------
// تطبيع عربي + تقطيع + استرجاع (يعملان في المتصفح والاختبار)
// ---------------------------------------------------------------------------

/** نفس قواعد تطبيع البحث في أدواتي: بلا تشكيل، ألف/ى/ة موحّدة، تطويل مُزال. */
export function normalizeArabicText(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

/** كلمات وظيفية عربية/فرنسية/إنجليزية لا تحمل معنى استرجاعياً. */
const STOPWORDS = new Set([
  "من", "في", "على", "عن", "الى", "هذا", "هذه", "ذلك", "التي", "الذي",
  "و", "او", "ثم", "قد", "كل", "بعض", "غير", "بين", "حيث", "كما", "ان",
  "ما", "لا", "لم", "لن", "هو", "هي", "نحن", "هم", "كان", "كانت", "يكون",
  "تكون", "هناك", "به", "له", "مع", "عند", "بعد", "قبل", "حتى", "اذا",
  "لكن", "بل", "اي", "مثل", "حسب", "دون", "عبر", "نحو", "اما", "اذ",
  "حين", "لدى", "الي", "هذان", "هاتان", "الذين", "اللتان", "الذي", "التي",
  "the", "of", "and", "to", "in", "is", "are", "de", "la", "le", "les",
  "et", "un", "une", "des", "du", "en", "que", "qui", "pour", "dans",
  "sur", "est", "au", "ce", "il", "elle", "on", "nous", "vous", "ils",
  "elles", "sont", "avec", "pas", "par", "plus",
]);

const TOKEN_RE = /[\p{L}\p{N}]+/gu;

/** رموز مُطبَّعة بلا كلمات وظيفية ولا رموز من حرف واحد. */
export function tokenize(text: string): string[] {
  return (normalizeArabicText(text).match(TOKEN_RE) ?? []).filter(
    (t) => t.length > 1 && !STOPWORDS.has(t)
  );
}

export interface Chunk {
  text: string;
  start: number;
}

/** تقطيع بحجم ثابت مع تداخل، وكسر عند حد الفراغ الأخير كي لا تُقطع الكلمات. */
export function chunkContent(content: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): Chunk[] {
  const text = (content ?? "").trim();
  if (!text) return [];
  if (text.length <= size) return [{ text, start: 0 }];
  const chunks: Chunk[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      const slice = text.slice(start, end);
      const brk = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(". "), slice.lastIndexOf(" "));
      if (brk > size * 0.6) end = start + brk + 1;
    }
    const piece = text.slice(start, end).trim();
    if (piece) chunks.push({ text: piece, start });
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

export interface RetrievalSource {
  id: string;
  title: string;
  content: string;
}

export interface Excerpt {
  sourceId: string;
  sourceTitle: string;
  text: string;
}

/**
 * استرجاع المقتطفات لسؤال محدد: تقطيع كل مصدر مُفعَّل، ترجيح IDF خفيف
 * لتوكنات السؤال داخل كل قطعة، وأعلى القطع حتى سقف الأحرف والعدد.
 * بلا تطابق (سؤال بمفردات غريبة) → توزيع دائري على المصادر (بداياتها).
 */
export function retrieveExcerpts(
  sources: RetrievalSource[],
  query: string,
  budgetChars = CHAT_EXCERPT_BUDGET,
  maxExcerpts = CHAT_MAX_EXCERPTS
): Excerpt[] {
  const all: Excerpt[] = [];
  for (const s of sources) {
    const content = (s.content ?? "").trim().slice(0, SOURCE_MAX_CHARS);
    for (const c of chunkContent(content)) {
      all.push({ sourceId: s.id, sourceTitle: s.title, text: c.text });
    }
  }
  if (all.length === 0) return [];

  const chunkTokens = all.map((c) => new Set(tokenize(c.text)));
  const df = new Map<string, number>();
  for (const toks of chunkTokens) {
    for (const t of toks) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const qTokens = [...new Set(tokenize(query))];
  const N = all.length;

  if (qTokens.length === 0) {
    return spreadAcrossSources(all, budgetChars, maxExcerpts);
  }

  const scored = all.map((c, i) => {
    let score = 0;
    for (const t of qTokens) {
      if (chunkTokens[i].has(t)) score += 1 + Math.log(N / (1 + (df.get(t) ?? 0)));
    }
    return { index: i, score };
  });
  const best = Math.max(...scored.map((s) => s.score));
  if (best <= 0) {
    return spreadAcrossSources(all, budgetChars, maxExcerpts);
  }

  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  const out: Excerpt[] = [];
  let used = 0;
  for (const s of scored) {
    if (out.length >= maxExcerpts) break;
    const text = all[s.index].text;
    if (used + text.length > budgetChars) {
      if (out.length === 0 && budgetChars > 400) {
        out.push({ ...all[s.index], text: text.slice(0, budgetChars) });
        used = budgetChars; // الميزانية استُهلكت كاملة في القصّة الأولى
      }
      continue;
    }
    out.push(all[s.index]);
    used += text.length;
  }
  return out;
}

/** توزيع دائري على المصادر — بداية كل مصدر ثم التالي، حتى السقف. */
function spreadAcrossSources(all: Excerpt[], budgetChars: number, maxExcerpts: number): Excerpt[] {
  // نحافظ على تجميع كل مصدر معاً (المقتطفات مُبنية بالمصدر بالترتيب)
  const bySource = new Map<string, Excerpt[]>();
  for (const c of all) {
    const list = bySource.get(c.sourceId) ?? [];
    list.push(c);
    bySource.set(c.sourceId, list);
  }
  const queues = [...bySource.values()];
  const out: Excerpt[] = [];
  let used = 0;
  let progressed = true;
  while (out.length < maxExcerpts && progressed) {
    progressed = false;
    for (const q of queues) {
      const next = q.shift();
      if (!next) continue;
      progressed = true;
      if (used + next.text.length > budgetChars) continue;
      out.push(next);
      used += next.text.length;
      if (out.length >= maxExcerpts) break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// حديث مُسنَد بالمصادر
// ---------------------------------------------------------------------------

export function buildChatSystem(): string {
  return [
    "أنت «دفتر طالب» — مساعد دراسي أمين داخل منصة طالب يعمل من مصادر الطالب الخاصة حصراً.",
    "قواعد الإجابة:",
    "• أجب فقط من «المقتطفات» المرفقة في رسالة الطالب، واستشهد بأرقامها بين قوسين في موضع المعلومة نفسه مثل [م1] أو [م1، م3].",
    "• إن لم تكفِّ المقتطفات لإجابة مؤكدة فقل بصراحة إن الجواب غير موجود في المصادر الحالية، ويمكنك عرض ما يُرجَّح استنتاجه بحذر مع تمييزه بعبارة «استنتاج» واضحة.",
    "• لا تعتمد معرفتك العامة في المعلومات الجوهرية — تُسمح فقط لشرح مصطلح ورد في المصدر مع الإشارة إلى أنه شرح خارجي.",
    "• عربية فصحى مبسطة بأسلوب ودود، بلا إيموجي وبلا مقدمات زائدة، بعناوين وقوائم عند الحاجة، والمعادلات بين علامتي دولار عند ورودها.",
    "• إن كان السؤال غامضاً فاسأل سؤال توضيح واحداً قبل الإجابة.",
  ].join("\n");
}

export interface ChatExcerptInput {
  title: string;
  text: string;
}

export function buildChatMessages(
  question: string,
  history: ChatMessage[],
  excerpts: ChatExcerptInput[]
): ChatMessage[] {
  const block = excerpts
    .map((e, i) => `【م${i + 1} — ${e.title}】\n${e.text}`)
    .join("\n\n");
  const msgs: ChatMessage[] = history.map((h) => ({ role: h.role, content: h.content }));
  msgs.push({
    role: "user",
    content: `المقتطفات من مصادري:\n\n${block}\n\nسؤالي: ${question}`,
  });
  return msgs;
}

// ---------------------------------------------------------------------------
// مُجلَّد الدراسة (للمخرجات المولَّدة — بلا سؤال فالاختيار حصص متساوية)
// ---------------------------------------------------------------------------

export interface CorpusPart {
  title: string;
  text: string;
}

export interface StudyCorpus {
  parts: CorpusPart[];
  totalChars: number;
  truncated: boolean;
}

/** حصص متساوية من كل مصدر حتى الميزانية — القطع من البداية، مع علم الاقتصاص. */
export function buildStudyCorpus(parts: CorpusPart[], budget = CORPUS_BUDGET): StudyCorpus {
  const usable = parts.filter((p) => (p.text ?? "").trim());
  if (usable.length === 0) return { parts: [], totalChars: 0, truncated: false };
  const cap = Math.max(2_000, Math.floor(budget / usable.length));
  let truncated = false;
  let totalChars = 0;
  const out: CorpusPart[] = usable.map((p) => {
    const text = p.text.trim().slice(0, cap);
    if (text.length < p.text.trim().length) truncated = true;
    totalChars += text.length;
    return { title: p.title, text };
  });
  return { parts: out, totalChars, truncated };
}

export function corpusBlock(parts: CorpusPart[]): string {
  return parts.map((p, i) => `【المصدر ${i + 1}: ${p.title}】\n${p.text}`).join("\n\n");
}

// ---------------------------------------------------------------------------
// دور النظام لكل مخرج + بناء الرسائل
// ---------------------------------------------------------------------------

const ARTIFACT_BASE = [
  "أنت «دفتر طالب» — مساعد دراسي داخل منصة طالب لطالب جامعي جزائري.",
  "اعتمد حصراً على محتوى المصادر المرفقة ولا تضف معلومات من خارجها؛ إن كانت المصادر أقصر من أن تنتج عدداً كافياً من العناصر فأنتج ما تستطيع بأمانة بدل الاختراع.",
  "عربية فصحى مبسطة، بلا إيموجي، والمصطلح التقني يبقى بأصله اللاتيني بين قوسين.",
].join(" ");

const JSON_ONLY = "أعد JSON صالحاً وحده — بلا أي نص حوله وبلا أسوار كود.";

export function buildArtifactSystem(action: ArtifactAction): string {
  switch (action) {
    case "summary":
      return [
        ARTIFACT_BASE,
        "المطلوب: ملخّص دراسي مركّز لكل المحتوى.",
        `المخطط: {"title": "عنوان وجيز للمحتوى", "summary": "فقرة إلى فقرتين (٨٠-١٦٠ كلمة)", "keyPoints": ["٥-٨ نقاط قصيرة مستقلة"]}`,
        JSON_ONLY,
      ].join("\n");
    case "study-guide":
      return [
        ARTIFACT_BASE,
        "المطلوب: دليل مراجعة يجهّز الطالب للامتحان.",
        `المخطط: {"concepts": [{"term": "مصطلح", "definition": "تعريف دقيق من المصدر"}], "questions": [{"question": "سؤال امتحاني", "answer": "نموذج جواب مركّز"}], "tips": ["٣-٥ نصائح دراسية مبنية على المحتوى"]}`,
        `الكميات: ٤-٨ مفاهيم، ٣-٨ أسئلة، ١-٥ نصائح.`,
        JSON_ONLY,
      ].join("\n");
    case "quiz":
      return [
        ARTIFACT_BASE,
        "المطلوب: اختبار اختيار من متعدد يغطي المحتوى تغطية عادلة (ليس باباً واحداً).",
        `المخطط: {"questions": [{"question": "نص السؤال", "options": ["أ", "ب", "ج", "د"], "correctIndex": 0, "explanation": "لماذا هذه الإجابة صحيحة في سطر"}]}`,
        "الشروط: خيارات أربعة بالضبط لكل سؤال، بلا تكرار في المعنى، correctIndex رقم 0-3، ٦-١٠ أسئلة، والمشّتتات منطقية لا سخيفة.",
        JSON_ONLY,
      ].join("\n");
    case "flashcards":
      return [
        ARTIFACT_BASE,
        "المطلوب: بطاقات استذكار أمام/خلف — الوجه سؤال أو مصطلح، والخلف جواب أو تعريف قصير قابل للحفظ.",
        `المخطط: {"cards": [{"front": "سؤال أو مصطلح", "back": "جواب قصير"}]}`,
        `الكميات: ٦-١٤ بطاقة، كل بطاقة بفكرة واحدة فقط.`,
        JSON_ONLY,
      ].join("\n");
    case "timeline":
      return [
        ARTIFACT_BASE,
        "المطلوب: خط زمني مرتّب زمنياً أو منطقياً (مراحل، خطوات، أحداث) حسب طبيعة المحتوى — وإن لم يصلح الزمن فالترتيب المنطقي للسلسلة.",
        `المخطط: {"events": [{"label": "اسم المرحلة/الحدث", "detail": "شرح في سطر أو سطرين"}]}`,
        `الكميات: ٣-١٠ أحداث.`,
        JSON_ONLY,
      ].join("\n");
    case "faq":
      return [
        ARTIFACT_BASE,
        "المطلوب: أسئلة شائعة يتوقعها الطالب عن المحتوى (التعريفات، الشروط، الفروق، الاستثناءات) بنماذج أجوبة مركّزة.",
        `المخطط: {"items": [{"question": "السؤال", "answer": "الجواب في سطر إلى ثلاثة"}]}`,
        `الكميات: ٤-٨ أسئلة.`,
        JSON_ONLY,
      ].join("\n");
    case "audio-script":
      return [
        ARTIFACT_BASE,
        "المطلوب: نص حوار صوتي بين «المذيع» و«الخبيرة» (٢-٣ دقائق استماع) يلخّص المصادر لطالب يستمع أثناء الطريق.",
        `المخطط: {"segments": [{"speaker": "المذيع", "text": "..."}, {"speaker": "الخبيرة", "text": "..."}]}`,
        "الشروط: يبدأ بمقدمة ترحيبية قصيرة، حوار طبيعي (أسئلة المذيع وشرح الخبيرة)، يغطي أهم النقاط، وخاتمة تحفيزية؛ كل جملة ١٥-٦٠ كلمة؛ ٨-١٤ مقطعاً؛ بلا أرقام استشهاد داخل النص.",
        JSON_ONLY,
      ].join("\n");
    case "mindmap":
      return [
        ARTIFACT_BASE,
        "المطلوب: خريطة ذهنية Mermaid من نوع mindmap حصراً تغطي بنية المحتوى: جذر بالموضوع العام، ٣-٦ فروع أولى، أوراق قصيرة (٢-٥ كلمات) منسدلة التفصيل.",
        "عقد المخرجات (صارم): أخرج كود Mermaid وحده بلا أي نص حوله وبلا أسوار كود، وأول سطر يبدأ بـ mindmap حرفياً، والتسميات العربية بين قوسين مربعين عند الحاجة [نص]، وبلا روابط خارجية وبلا أوامر تفاعل، وبلا أكثر من ٣٠ عقدة.",
      ].join("\n");
  }
}

export function buildArtifactMessages(action: ArtifactAction, corpus: StudyCorpus): ChatMessage[] {
  return [
    {
      role: "user",
      content: `محتوى مصادري:\n\n${corpusBlock(corpus.parts)}\n\nولّد المخرج المطلوب الآن وفق العقد أعلاه.`,
    },
  ];
}

// ---------------------------------------------------------------------------
// استخراج JSON متسامح + مدقّقات المخرجات
// ---------------------------------------------------------------------------

/** يزيل الأسوار والنص المحيط ثم يحاول قراءة أول كائن أو مصفوفة JSON. */
export function extractJson<T = Record<string, unknown>>(raw: string): T | null {
  if (!raw) return null;
  let t = raw.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(t) as T;
  } catch {
    /* نكمل بالبحث عن الحدود */
  }
  const objStart = t.indexOf("{");
  const arrStart = t.indexOf("[");
  let start = -1;
  let endChar = "";
  if (objStart === -1 && arrStart === -1) return null;
  if (objStart === -1 || (arrStart !== -1 && arrStart < objStart)) {
    start = arrStart;
    endChar = "]";
  } else {
    start = objStart;
    endChar = "}";
  }
  const end = t.lastIndexOf(endChar);
  if (end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

function str(v: unknown, max = 4_000): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function strList(v: unknown, min: number, max: number, itemMax = 400): string[] | null {
  if (!Array.isArray(v)) return null;
  const out = v.map((x) => str(x, itemMax)).filter((s) => s.length > 0).slice(0, max);
  return out.length >= min ? out : null;
}

function pairList(
  v: unknown,
  keys: [string, string],
  min: number,
  max: number
): Array<{ a: string; b: string }> | null {
  if (!Array.isArray(v)) return null;
  const out: Array<{ a: string; b: string }> = [];
  for (const item of v) {
    const obj = item as Record<string, unknown> | null;
    if (!obj || typeof obj !== "object") continue;
    const a = str(obj[keys[0]], 500);
    const b = str(obj[keys[1]], 1_500);
    if (a && b) out.push({ a, b });
    if (out.length >= max) break;
  }
  return out.length >= min ? out : null;
}

export function validateSummary(data: Record<string, unknown>): SummaryResult {
  const title = str(data.title, 200);
  const summary = str(data.summary, 4_000);
  const keyPoints = strList(data.keyPoints, 3, 8);
  if (!summary || summary.length < 60 || !keyPoints) {
    throw new Error(NOTEBOOK_PARSE_ERROR);
  }
  return { title: title || "ملخّص", summary, keyPoints };
}

export function validateStudyGuide(data: Record<string, unknown>): StudyGuideResult {
  const conceptsRaw = pairList(data.concepts, ["term", "definition"], MIN_CONCEPTS, MAX_CONCEPTS);
  const questionsRaw = pairList(data.questions, ["question", "answer"], MIN_GUIDE_QUESTIONS, MAX_GUIDE_QUESTIONS);
  if (!conceptsRaw || !questionsRaw) throw new Error(NOTEBOOK_PARSE_ERROR);
  const tips = strList(data.tips, 1, 5) ?? [];
  return {
    concepts: conceptsRaw.map((c) => ({ term: c.a, definition: c.b })),
    questions: questionsRaw.map((q) => ({ question: q.a, answer: q.b })),
    tips,
  };
}

export function validateQuiz(data: Record<string, unknown>): QuizResult {
  if (!Array.isArray(data.questions)) throw new Error(NOTEBOOK_PARSE_ERROR);
  const out: QuizQuestion[] = [];
  for (const item of data.questions) {
    const obj = item as Record<string, unknown> | null;
    if (!obj || typeof obj !== "object") continue;
    const question = str(obj.question, 500);
    const options = Array.isArray(obj.options)
      ? obj.options.map((o) => str(o, 200)).filter((o) => o.length > 0)
      : [];
    const idx = obj.correctIndex;
    const correctIndex = typeof idx === "number" && Number.isInteger(idx) ? idx : -1;
    if (!question || options.length !== 4 || correctIndex < 0 || correctIndex > 3) continue;
    out.push({ question, options, correctIndex, explanation: str(obj.explanation, 600) });
    if (out.length >= MAX_QUIZ_QUESTIONS) break;
  }
  if (out.length < MIN_QUIZ_QUESTIONS) throw new Error(NOTEBOOK_PARSE_ERROR);
  return { questions: out };
}

export function validateFlashcards(data: Record<string, unknown>): FlashcardsResult {
  const cards = pairList(data.cards, ["front", "back"], MIN_FLASHCARDS, MAX_FLASHCARDS);
  if (!cards) throw new Error(NOTEBOOK_PARSE_ERROR);
  return { cards: cards.map((c) => ({ front: c.a, back: c.b })) };
}

export function validateTimeline(data: Record<string, unknown>): TimelineResult {
  const events = pairList(data.events, ["label", "detail"], MIN_TIMELINE_EVENTS, MAX_TIMELINE_EVENTS);
  if (!events) throw new Error(NOTEBOOK_PARSE_ERROR);
  return { events: events.map((e) => ({ label: e.a, detail: e.b })) };
}

export function validateFaq(data: Record<string, unknown>): FaqResult {
  const items = pairList(data.items, ["question", "answer"], MIN_FAQ_ITEMS, MAX_FAQ_ITEMS);
  if (!items) throw new Error(NOTEBOOK_PARSE_ERROR);
  return { items: items.map((i) => ({ question: i.a, answer: i.b })) };
}

/** توحيد أسماء المتحدثين — وما لا يُعرَف يتناوب حسب الموضع. */
export function normalizeSpeaker(raw: string, index: number): string {
  const t = normalizeArabicText(raw || "");
  if (t.includes("مذيع") || t.includes("host") || t.includes("presenter") || t.includes("مقدم")) {
    return AUDIO_SPEAKERS[0];
  }
  if (t.includes("خبير") || t.includes("expert")) {
    return AUDIO_SPEAKERS[1];
  }
  return AUDIO_SPEAKERS[index % 2];
}

export function validateAudioScript(data: Record<string, unknown>): AudioScriptResult {
  if (!Array.isArray(data.segments)) throw new Error(NOTEBOOK_PARSE_ERROR);
  const out: Array<{ speaker: string; text: string }> = [];
  for (let i = 0; i < data.segments.length && out.length < MAX_AUDIO_SEGMENTS; i++) {
    const obj = data.segments[i] as Record<string, unknown> | null;
    if (!obj || typeof obj !== "object") continue;
    const text = str(obj.text, 900);
    if (text.length < 10) continue;
    out.push({ speaker: normalizeSpeaker(str(obj.speaker, 60), i), text });
  }
  if (out.length < MIN_AUDIO_SEGMENTS) throw new Error(NOTEBOOK_PARSE_ERROR);
  return { segments: out };
}

/** مسار الخريطة الذهنية: Mermaid من نوع mindmap حصراً — إعادة استخدام فحص r86. */
export function validateMindmap(raw: string): MindmapResult {
  const code = extractMermaid(raw ?? "");
  if (!code) throw new Error(NOTEBOOK_PARSE_ERROR);
  const reason = validateMermaid(code);
  if (reason) throw new Error(`${NOTEBOOK_PARSE_ERROR} (${reason})`);
  const first = code.split("\n", 1)[0]?.trim().toLowerCase().split(/\s+/, 1)[0] ?? "";
  if (first !== "mindmap") throw new Error(MINDMAP_TYPE_ERROR);
  return { code };
}

/** يفرّغ جواب المزوّد إلى نتيجة مدقّقة أو يرمي خطأ عربياً صادقاً. */
export function parseArtifact(action: ArtifactAction, raw: string): ArtifactResult {
  if (action === "mindmap") return { kind: "mindmap", data: validateMindmap(raw) };
  const data = extractJson<Record<string, unknown>>(raw);
  if (!data || typeof data !== "object") throw new Error(NOTEBOOK_PARSE_ERROR);
  switch (action) {
    case "summary":
      return { kind: "summary", data: validateSummary(data) };
    case "study-guide":
      return { kind: "study-guide", data: validateStudyGuide(data) };
    case "quiz":
      return { kind: "quiz", data: validateQuiz(data) };
    case "flashcards":
      return { kind: "flashcards", data: validateFlashcards(data) };
    case "timeline":
      return { kind: "timeline", data: validateTimeline(data) };
    case "faq":
      return { kind: "faq", data: validateFaq(data) };
    case "audio-script":
      return { kind: "audio-script", data: validateAudioScript(data) };
  }
}

// ---------------------------------------------------------------------------
// تصدير نصّي (.md / .mmd) للنسخ والتحميل
// ---------------------------------------------------------------------------

export function formatArtifactMarkdown(result: ArtifactResult): string {
  switch (result.kind) {
    case "summary":
      return [
        `# ${result.data.title}`,
        "",
        result.data.summary,
        "",
        "## أهم النقاط",
        ...result.data.keyPoints.map((p) => `- ${p}`),
      ].join("\n");
    case "study-guide":
      return [
        "# دليل الدراسة",
        "",
        "## المفاهيم المفتاحية",
        ...result.data.concepts.map((c) => `- **${c.term}**: ${c.definition}`),
        "",
        "## أسئلة بنماذج إجابة",
        ...result.data.questions.map((q, i) => `${i + 1}. ${q.question}\n   ${q.answer}`),
        ...(result.data.tips.length
          ? ["", "## نصائح", ...result.data.tips.map((t) => `- ${t}`)]
          : []),
      ].join("\n");
    case "quiz":
      return [
        "# اختبار تدريبي",
        "",
        ...result.data.questions.map(
          (q, i) =>
            `${i + 1}. ${q.question}\n` +
            q.options.map((o, j) => `   ${"أبجد"[j] ?? j + 1}. ${o}`).join("\n") +
            `\n   — الإجابة: ${q.options[q.correctIndex]}${q.explanation ? ` (${q.explanation})` : ""}`
        ),
      ].join("\n");
    case "flashcards":
      return [
        "# بطاقات استذكار",
        "",
        ...result.data.cards.map((c, i) => `${i + 1}. **${c.front}**\n   ${c.back}`),
      ].join("\n");
    case "timeline":
      return [
        "# خط زمني",
        "",
        ...result.data.events.map((e, i) => `${i + 1}. **${e.label}** — ${e.detail}`),
      ].join("\n");
    case "faq":
      return [
        "# أسئلة شائعة",
        "",
        ...result.data.items.map((i) => `**س: ${i.question}**\nج: ${i.answer}`),
      ].join("\n");
    case "audio-script":
      return [
        "# النص الصوتي — حوار المذيع والخبيرة",
        "",
        ...result.data.segments.map((s) => `**${s.speaker}:** ${s.text}`),
      ].join("\n");
    case "mindmap":
      return `# خريطة ذهنية (Mermaid)\n\n\`\`\`mermaid\n${result.data.code}\n\`\`\`\n\nللعرض: افتح mermaid.live والصق الكود، أو أي محرر يدعم Mermaid (GitHub، Obsidian…).`;
  }
}

// ---------------------------------------------------------------------------
// الحصص — مصانع قابلة للحقن الزمني (اختبار بلا نوم)
// ---------------------------------------------------------------------------

export interface NotebookLimiter {
  check(userId: string | number): string | null;
  reset(): void;
}

export function createNotebookLimiter(
  gapMs: number,
  dailyCap: number,
  gapMessage: string,
  capMessage: string,
  now: () => number = () => Date.now()
): NotebookLimiter {
  const hits = new Map<string, { last: number; day: string; count: number }>();
  return {
    check(userId: string | number): string | null {
      const t = now();
      const day = new Date(t).toISOString().slice(0, 10);
      const key = String(userId);
      const rec = hits.get(key) ?? { last: 0, day, count: 0 };
      if (rec.day !== day) {
        rec.day = day;
        rec.count = 0;
      }
      if (t - rec.last < gapMs) return gapMessage;
      rec.count += 1;
      if (rec.count > dailyCap) return capMessage;
      rec.last = t;
      hits.set(key, rec);
      return null;
    },
    reset() {
      hits.clear();
    },
  };
}

export const CHAT_LIMIT = { gapMs: 4_000, dailyCap: 80 };
export const ARTIFACT_LIMIT = { gapMs: 12_000, dailyCap: 30 };

export const CHAT_GAP_MESSAGE = "انتظر ثوانٍ قليلة بين سؤال وسؤال — الدفتر يعالج مصادرك الآن.";
export const CHAT_CAP_MESSAGE = "وصلت إلى حد الاستخدام اليومي لحديث الدفتر — عُد غداً.";
export const ARTIFACT_GAP_MESSAGE = "انتظر لحظات بين كل مخرج وآخر — التوليد يحتاج وقتاً.";
export const ARTIFACT_CAP_MESSAGE = "وصلت إلى حد الإنتاج اليومي لأدوات الدفتر — عُد غداً.";

// ---------------------------------------------------------------------------
// التحقق من الطلب (نقي — تستخدمه الشبكة ويغطيه الفحص)
// ---------------------------------------------------------------------------

export interface ChatRequestBody {
  action: "chat";
  question: string;
  history: ChatMessage[];
  excerpts: ChatExcerptInput[];
}
export interface ArtifactRequestBody {
  action: ArtifactAction;
  corpus: CorpusPart[];
}
export type NotebookRequestBody = ChatRequestBody | ArtifactRequestBody;
export type NotebookValidation = { ok: true; body: NotebookRequestBody } | { ok: false; error: string };

export function validateNotebookRequest(raw: unknown): NotebookValidation {
  const body = raw as Partial<NotebookRequestBody> | null;
  if (!body || typeof body !== "object") return { ok: false, error: "طلب غير صالح" };
  if (!isNotebookAction(body.action)) return { ok: false, error: "عملية غير معروفة" };

  if (body.action === "chat") {
    const question = typeof body.question === "string" ? body.question.trim().slice(0, QUESTION_MAX_CHARS) : "";
    if (!question) return { ok: false, error: "اكتب سؤالك أولاً" };

    const history = Array.isArray(body.history) ? body.history : [];
    if (history.length > CHAT_HISTORY_MAX_TURNS * 2) {
      return { ok: false, error: "المحادثة طويلة — ابدأ حديثاً جديداً" };
    }
    const cleanHistory: ChatMessage[] = [];
    let total = 0;
    for (const h of history) {
      const role = (h as ChatMessage)?.role;
      const content = typeof (h as ChatMessage)?.content === "string" ? (h as ChatMessage).content.trim() : "";
      if (role !== "user" && role !== "assistant") return { ok: false, error: "رسالة بنوع غير معروف" };
      const cut = content.slice(0, 2_000);
      total += cut.length;
      if (total > CHAT_HISTORY_MAX_CHARS) return { ok: false, error: "المحادثة طويلة — ابدأ حديثاً جديداً" };
      cleanHistory.push({ role, content: cut });
    }
    if (cleanHistory.length && cleanHistory[cleanHistory.length - 1].role !== "user") {
      return { ok: false, error: "ترتيب الرسائل غير صحيح" };
    }

    const excerpts = Array.isArray(body.excerpts) ? body.excerpts : [];
    if (excerpts.length === 0) return { ok: false, error: NO_EXCERPTS_ERROR };
    if (excerpts.length > CHAT_MAX_EXCERPTS + 2) {
      return { ok: false, error: "عدد المقتطفات أكبر من الحد" };
    }
    const cleanExcerpts: ChatExcerptInput[] = [];
    let chars = 0;
    for (const e of excerpts) {
      const title = str((e as ChatExcerptInput)?.title, 120) || "مصدر";
      const text = str((e as ChatExcerptInput)?.text, 3_000);
      if (!text) return { ok: false, error: "هناك مقتطف فارغ في الطلب" };
      chars += text.length;
      if (chars > CHAT_EXCERPT_BUDGET + EXCERPTS_SERVER_SLACK) {
        return { ok: false, error: "المقتطفات أكبر من الحد المسموح — قلّل المصادر المُفعَّلة" };
      }
      cleanExcerpts.push({ title, text });
    }
    return { ok: true, body: { action: "chat", question, history: cleanHistory, excerpts: cleanExcerpts } };
  }

  // مخرجات مولَّدة — مُجلَّد الدراسة
  const artBody = body as Partial<ArtifactRequestBody>;
  const corpus = Array.isArray(artBody.corpus) ? artBody.corpus : [];
  if (corpus.length === 0) return { ok: false, error: NO_EXCERPTS_ERROR };
  if (corpus.length > MAX_SOURCES) return { ok: false, error: `أقصى عدد للمصادر هو ${MAX_SOURCES}` };
  const parts: CorpusPart[] = [];
  let chars = 0;
  for (const p of corpus) {
    const title = str((p as CorpusPart)?.title, 120) || "مصدر";
    const text = str((p as CorpusPart)?.text, SOURCE_MAX_CHARS);
    if (!text) return { ok: false, error: "هناك مصدر فارغ في الطلب" };
    chars += text.length;
    if (chars > CORPUS_BUDGET + CORPUS_SERVER_SLACK) {
      return { ok: false, error: "محتوى المصادر أكبر من الحد المسموح لهذه العملية" };
    }
    parts.push({ title, text });
  }
  return { ok: true, body: { action: body.action, corpus: parts } };
}
