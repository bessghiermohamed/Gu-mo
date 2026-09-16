/**
 * r87 — دفتر طالب test (bun, no Next.js, no real network unless stubbed).
 *
 * Verifies:
 *   A) Arabic normalization + tokenization (diacritics, alef/ya/ta, stopwords)
 *   B) Chunking (sizes, overlap, boundary, empty)
 *   C) Retrieval (IDF-ish scoring picks the right chunk, budget, spread
 *      fallback, disabled/empty sources)
 *   D) Study corpus (equal shares, truncation flag, budget)
 *   E) Grounded chat builders (system contract, excerpt numbering, history)
 *   F) Tolerant JSON extraction (plain, fenced, prose-wrapped, array, broken)
 *   G) Artifact validators (summary/guide/quiz/flashcards/timeline/faq/
 *      audio-script/mindmap — valid + honest failures + clamps)
 *   H) parseArtifact dispatch + formatArtifactMarkdown exports
 *   I) Rate limiter (gap, daily cap, day rollover, reset) with injected clock
 *   J) Request validation (chat + artifacts — sizes, roles, unknown action)
 *   K) Provider pipeline (stubbed fetch → chatComplete → parseArtifact)
 *      + isAiConfigured flips with env.
 *
 * Run from the repo root:  bun scripts/r87-check.ts
 */

import {
  normalizeArabicText,
  tokenize,
  chunkContent,
  retrieveExcerpts,
  buildStudyCorpus,
  corpusBlock,
  buildChatSystem,
  buildChatMessages,
  extractJson,
  validateSummary,
  validateStudyGuide,
  validateQuiz,
  validateFlashcards,
  validateTimeline,
  validateFaq,
  validateAudioScript,
  validateMindmap,
  parseArtifact,
  formatArtifactMarkdown,
  createNotebookLimiter,
  validateNotebookRequest,
  buildArtifactSystem,
  ARTIFACT_ACTIONS,
  CHAT_EXCERPT_BUDGET,
  EXCERPTS_SERVER_SLACK,
  CORPUS_BUDGET,
  CORPUS_SERVER_SLACK,
  NOTEBOOK_PARSE_ERROR,
  MINDMAP_TYPE_ERROR,
} from "../src/lib/ai/notebook";
import { isAiConfigured, chatComplete } from "../src/lib/ai/providers";

// ---------------------------------------------------------------------------
// Tiny harness
// ---------------------------------------------------------------------------

let pass = 0;
let fail = 0;
const failures: string[] = [];

function ok(cond: boolean, label: string) {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(label);
    console.error(`  FAIL: ${label}`);
  }
}

function eqStr(a: unknown, b: unknown, label: string) {
  ok(String(a) === String(b), `${label} (got «${String(a).slice(0, 80)}» want «${String(b).slice(0, 80)}»)`);
}

// ---------------------------------------------------------------------------
// Test fixtures — two Arabic study sources with distinct vocabularies
// ---------------------------------------------------------------------------

const SOURCE_A = `التركيب الضوئي هو عملية حيوية تتم في البلاستيدات الخضراء، تحوّل فيها النباتات طاقة الضوء إلى طاقة كيميائية.
يحتاج التركيب الضوئي إلى ثاني أكسيد الكربون والماء وضوء الشمس والكلوروفيل.
معادلة التركيب الضوئي: ستة جزيئات من ثاني أكسيد الكربون مع ستة جزيئات ماء تنتج جلوكوز وأكسجين.
يتم التركيب الضوئي على مرحلتين: المرحلة الضوئية في أغشية الثايلاكويد، ودورة كالفن في السديمة العليل.`.repeat(4);

const SOURCE_B = `التنفس الخلوي هو عملية أكسدة الغذاء داخل الميتوكوندريا لإطلاق الطاقة على شكل ATP.
مراحل التنفس الخلوي: التحلل السكري في السديمة، ودورة كريبس، وسلسلة نقل الإلكترونات.
التنفس الخلوي الهوائي يحتاج أكسجيناً، أما اللاهوائي فيتم بدونه وينتج حمض اللاكتيك أو الإيثانول.`.repeat(4);

function src(id: string, title: string, content: string) {
  return { id, title, content };
}

// ---------------------------------------------------------------------------
// A) normalization + tokenization
// ---------------------------------------------------------------------------

console.log("A) التطبيع والتقطيع الرمزي");

eqStr(normalizeArabicText("السباتَةُ الأجمل"), "السباته الاجمل", "A1 تشكيل وتوحيد");
eqStr(normalizeArabicText("أَإِآ ى ة"), "ااا ي ه", "A2 ألف/ى/ة (الألف المتلاصقة كلمة واحدة)");
ok(tokenize("وفي هذا المقال نشرح التركيب الضوئي").includes("شرح") || tokenize("وفي هذا المقال نشرح التركيب الضوئي").includes("نشرح"), "A3 كلمات وظيفية مُزالة");
ok(!tokenize("في من على هذا الذي").includes("الذي"), "A4 لا stopwords");
ok(tokenize("H2O مهم جداً").includes("h2o"), "A5 لاتيني/أرقام");
ok(tokenize("أ ب ج").length === 0, "A6 رموز حرف واحد تُهمَل");

// ---------------------------------------------------------------------------
// B) chunking
// ---------------------------------------------------------------------------

console.log("B) التقطيع");

ok(chunkContent("").length === 0, "B1 فارغ ← بلا قطع");
ok(chunkContent("قصير جداً").length === 1, "B2 أقصر من الحجم ← قطعة واحدة");
const long = Array.from({ length: 40 }, (_, i) => `الفقرة رقم ${i} تتحدث عن موضوع مهم ومفصل للدراسة والمراجعة.`).join(" ");
const chunks = chunkContent(long);
ok(chunks.length > 1, "B3 نص طويل ← عدة قطع");
ok(chunks.every((c) => c.text.length <= 700), "B4 كل قطعة ضمن الحجم (كسر عند الفراغ)");
const overlapOk = chunks.length < 2 || chunks[1].start < chunks[0].start + chunks[0].text.length;
ok(overlapOk, "B5 تداخل بين القطع");

// ---------------------------------------------------------------------------
// C) retrieval
// ---------------------------------------------------------------------------

console.log("C) الاسترجاع");

const retrievalSources = [src("1", "التركيب الضوئي", SOURCE_A), src("2", "التنفس الخلوي", SOURCE_B)];

const photosyn = retrieveExcerpts(retrievalSources, "كيف يتم التركيب الضوئي وما هي مراحله؟");
ok(photosyn.length > 0, "C1 استرجاع يعيد مقتطفات");
ok(photosyn[0].sourceId === "1", "C2 سؤال التركيب الضوئي يختار المصدر الصحيح");
ok(!photosyn[0].sourceId || photosyn.every((e) => e.text.length > 0), "C3 المقتطفات غير فارغة");

const resp = retrieveExcerpts(retrievalSources, "ما هي مراحل التنفس الخلوي ودورة كريبس؟");
ok(resp[0].sourceId === "2", "C4 سؤال التنفس يختار المصدر الصحيح");

const mixed = retrieveExcerpts(retrievalSources, "الفرق بين التركيب الضوئي والتنفس الخلوي");
ok(mixed.length >= 2 && new Set(mixed.map((e) => e.sourceId)).size >= 2, "C5 سؤال مقارن يجمع المصدرين");

const none = retrieveExcerpts(retrievalSources, "اقتصاد الجزائر النفطي والغاز الطبيعي");
ok(none.length > 0, "C6 بلا تطابق ← توزيع على المصادر (لا فراغ)");
ok(new Set(none.map((e) => e.sourceId)).size >= 2, "C7 التوزيع يشمل المصدرين");

const budget = retrieveExcerpts(retrievalSources, "التركيب الضوئي التنفس الخلوي مراحل معادلة", 800, 10);
ok(budget.reduce((a, e) => a + e.text.length, 0) <= 800, "C8 احترام ميزانية الأحرف");

ok(retrieveExcerpts([src("x", "فارغ", "   ")], "سؤال").length === 0, "C9 مصدر فارغ ← لا مقتطفات");
const capped = retrieveExcerpts([src("1", "ضخم", "كلمة ".repeat(2000))], "كلمة", 500, 10);
ok(capped.length === 1 && capped[0].text.length <= 500, "C10 مقتطف أول يُقصّ للميزانية");

// ---------------------------------------------------------------------------
// D) study corpus
// ---------------------------------------------------------------------------

console.log("D) مُجلَّد الدراسة");

ok(buildStudyCorpus([]).parts.length === 0, "D1 فارغ");
const corpus = buildStudyCorpus([
  { title: "أ", text: "ن".repeat(10_000) },
  { title: "ب", text: "م".repeat(10_000) },
]);
ok(corpus.parts.length === 2, "D2 مصدران يبقيان");
ok(!corpus.truncated, "D3 ضمن الميزانية ← بلا اقتصاص");
ok(corpus.totalChars <= CORPUS_BUDGET, "D4 احترام الميزانية");
const bigCorpus = buildStudyCorpus([
  { title: "أ", text: "س".repeat(40_000) },
  { title: "ب", text: "ص".repeat(40_000) },
]);
ok(bigCorpus.truncated, "D5 اقتصاص معلَم بأمانة");
ok(bigCorpus.parts.every((p) => p.text.length <= CORPUS_BUDGET / 2), "D6 حصص متساوية");
ok(corpusBlock([{ title: "الدرس", text: "المحتوى" }]).includes("【المصدر 1: الدرس】"), "D7 ترويسة المصادر");

// ---------------------------------------------------------------------------
// E) grounded chat builders
// ---------------------------------------------------------------------------

console.log("E) بنّاءات الحديث المُسنَد");

const chatSystem = buildChatSystem();
ok(chatSystem.includes("مصادر الطالب") && chatSystem.includes("[م1]"), "E1 عقد الاستشهاد في دور النظام");
ok(chatSystem.includes("غير موجود في المصادر"), "E2 صدق عدم الوجود");
const chatMsgs = buildChatMessages("ما هو ATP؟", [{ role: "user", content: "سابق" }, { role: "assistant", content: "جواب" }], [
  { title: "التنفس", text: "ATP هي طاقة" },
  { title: "أخرى", text: "نص آخر" },
]);
ok(chatMsgs.length === 3, "E3 التاريخ + رسالة المستخدم");
ok(chatMsgs[2].content.includes("【م1 — التنفس】") && chatMsgs[2].content.includes("【م2 — أخرى】"), "E4 ترقيم المقتطفات");
ok(chatMsgs[2].content.includes("سؤالي: ما هو ATP؟"), "E5 السؤال في الرسالة");
ok(chatMsgs[0].content === "سابق" && chatMsgs[1].content === "جواب", "E6 التاريخ خام بلا مقتطفات قديمة");

// ---------------------------------------------------------------------------
// F) tolerant JSON extraction
// ---------------------------------------------------------------------------

console.log("F) استخراج JSON");

ok(JSON.stringify(extractJson('{"a":1}')) === '{"a":1}', "F1 مباشر");
ok((extractJson('```json\n{"a":2}\n```') as { a: number }).a === 2, "F2 أسوار json");
ok((extractJson('الجواب:\n{"a":3}\nانتهى') as { a: number }).a === 3, "F3 نص محيط");
ok(Array.isArray(extractJson('[1,2,3]')), "F4 مصفوفة");
ok(extractJson("لا يوجد JSON هنا") === null, "F5 بلا JSON ← null");
ok(extractJson('{"a":1') === null, "F6 مكسور ← null");
ok((extractJson('نص {"a":{"b":4}} نص') as { a: { b: number } }).a.b === 4, "F7 متداخل");

// ---------------------------------------------------------------------------
// G) artifact validators
// ---------------------------------------------------------------------------

console.log("G) مدقّقات المخرجات");

// summary
const goodSummary = { title: "العنوان", summary: "هذا ملخص كافٍ في الطول يتجاوز الستين حرفاً بوضوح تام ليمر التحقق.", keyPoints: ["ن1", "ن2", "ن3"] };
ok(validateSummary(goodSummary).keyPoints.length === 3, "G1 ملخص سليم");
let threw = false;
try {
  validateSummary({ title: "x", summary: "قصير", keyPoints: ["ن"] });
} catch {
  threw = true;
}
ok(threw, "G2 ملخص ناقص ← خطأ صادق");

// study-guide
const goodGuide = {
  concepts: [{ term: "ATP", definition: "جزئ الطاقة" }, { term: "كريبس", definition: "دورة" }, { term: "ثايلاكويد", definition: "غشاء" }],
  questions: [{ question: "س1؟", answer: "ج1" }, { question: "س2؟", answer: "ج2" }, { question: "س3؟", answer: "ج3" }],
  tips: ["نصيحة"],
};
ok(validateStudyGuide(goodGuide).concepts.length === 3, "G3 دليل سليم");
ok(validateStudyGuide({ ...goodGuide, tips: [] }).tips.length === 0, "G4 بلا نصائح ← مقبول");
threw = false;
try {
  validateStudyGuide({ concepts: [{ term: "t", definition: "d" }], questions: [] });
} catch {
  threw = true;
}
ok(threw, "G5 دليل ناقص ← خطأ");

// quiz
const goodQuiz = {
  questions: [
    { question: "س؟", options: ["أ", "ب", "ج", "د"], correctIndex: 0, explanation: "لأن" },
    { question: "س؟", options: ["أ", "ب", "ج", "د"], correctIndex: 3, explanation: "" },
    { question: "س؟", options: ["أ", "ب", "ج", "د"], correctIndex: 1, explanation: "" },
    { question: "س؟", options: ["أ", "ب", "ج", "د"], correctIndex: 2, explanation: "" },
  ],
};
ok(validateQuiz(goodQuiz).questions.length === 4, "G6 اختبار سليم");
const mixedQuiz = {
  questions: [
    ...goodQuiz.questions,
    { question: "سيء", options: ["أ", "ب", "ج"], correctIndex: 0, explanation: "" }, // 3 options → يُسقط
    { question: "سيء", options: ["أ", "ب", "ج", "د"], correctIndex: 9, explanation: "" }, // index خاطئ → يُسقط
  ],
};
ok(validateQuiz(mixedQuiz).questions.length === 4, "G7 الأسئلة غير الصالحة تُسقط بلا انهيار");
threw = false;
try {
  validateQuiz({ questions: goodQuiz.questions.slice(0, 2) });
} catch {
  threw = true;
}
ok(threw, "G8 أقل من الحد الأدنى ← خطأ");

// flashcards
ok(validateFlashcards({ cards: [{ front: "أ", back: "ب" }, { front: "ج", back: "د" }, { front: "هـ", back: "و" }, { front: "ز", back: "ح" }] }).cards.length === 4, "G9 بطاقات سليمة");
threw = false;
try {
  validateFlashcards({ cards: [{ front: "أ", back: "ب" }] });
} catch {
  threw = true;
}
ok(threw, "G10 بطاقات ناقصة ← خطأ");

// timeline + faq
ok(validateTimeline({ events: [{ label: "أ", detail: "ب" }, { label: "ج", detail: "د" }, { label: "هـ", detail: "و" }] }).events.length === 3, "G11 خط زمني سليم");
ok(validateFaq({ items: [{ question: "س", answer: "ج" }, { question: "س", answer: "ج" }, { question: "س", answer: "ج" }] }).items.length === 3, "G12 أسئلة شائعة سليمة");

// audio-script
const goodAudio = {
  segments: [
    { speaker: "المذيع", text: "أهلاً بكم في ملخص اليوم" },
    { speaker: "الخبيرة", text: "اليوم نناقش التركيب الضوئي بتفصيل" },
    { speaker: "مذيع", text: "ما هي المرحلة الأولى؟" },
    { speaker: "خبيرة", text: "المرحلة الضوئية في أغشية الثايلاكويد" },
    { speaker: "host", text: "وشكراً لكم على المتابعة" },
  ],
};
const audio = validateAudioScript(goodAudio);
ok(audio.segments.length === 5, "G13 نص صوتي سليم");
eqStr(audio.segments[2].speaker, "المذيع", "G14 توحيد «مذيع»");
eqStr(audio.segments[4].speaker, "المذيع", "G15 توحيد host");
threw = false;
try {
  validateAudioScript({ segments: [{ speaker: "المذيع", text: "نص قصير وحيد" }] });
} catch {
  threw = true;
}
ok(threw, "G16 نص صوتي ناقص ← خطأ");
const unknownSpeaker = validateAudioScript({
  segments: [
    { speaker: "غريب", text: "أول نص طويل بما يكفي للمرور" },
    { speaker: "مجهول", text: "ثاني نص طويل بما يكفي للمرور" },
    { speaker: "غريب", text: "ثالث نص طويل بما يكفي للمرور" },
    { speaker: "مجهول", text: "رابع نص طويل بما يكفي للمرور" },
    { speaker: "غريب", text: "خامس نص طويل بما يكفي للمرور" },
  ],
});
eqStr(unknownSpeaker.segments[0].speaker, "المذيع", "G17 متحدث مجهول ← تناوب");
eqStr(unknownSpeaker.segments[1].speaker, "الخبيرة", "G18 تناوب ثانٍ");

// mindmap
const validMindmap = "mindmap\n  root((النبات))\n    الأوراق\n      التركيب الضوئي\n    الجذور\n      الامتصاص";
ok(validateMindmap(validMindmap).code.startsWith("mindmap"), "G19 خريطة ذهنية سليمة");
threw = false;
try {
  validateMindmap("flowchart TD\n  A[نقطة] --> B[نقطة ثانية واضحة]");
} catch (e) {
  threw = true;
  ok((e as Error).message.includes(MINDMAP_TYPE_ERROR.slice(0, 20)), "G20 نوع مخالف ← خطأ النوع");
}
ok(threw, "G21 النوع المخالف يُرفض فعلاً");
threw = false;
try {
  validateMindmap("هذا ليس كوداً إطلاقاً");
} catch {
  threw = true;
}
ok(threw, "G22 بلا Mermaid ← خطأ صادق");

// ---------------------------------------------------------------------------
// H) parseArtifact dispatch + markdown export
// ---------------------------------------------------------------------------

console.log("H) التفريغ والتصدير");

const parsedSummary = parseArtifact("summary", `هنا تفسير زائد\n\`\`\`json\n${JSON.stringify(goodSummary)}\n\`\`\``);
ok(parsedSummary.kind === "summary", "H1 dispatch ملخص من جواب مزوّد ملفوف");
const parsedMap = parseArtifact("mindmap", `بالتأكيد:\n${validMindmap}\nملاحظة للطالب.`);
ok(parsedMap.kind === "mindmap", "H2 dispatch خريطة من جواب محيط");
threw = false;
try {
  parseArtifact("summary", "نص بلا JSON");
} catch (e) {
  threw = true;
  ok((e as Error).message === NOTEBOOK_PARSE_ERROR, "H3 رسالة الصيغة الصادقة");
}
ok(threw, "H4 التفريغ يرفض الفوضى");

const md = formatArtifactMarkdown(parsedSummary as ReturnType<typeof parseArtifact>);
ok(md.includes("# العنوان") && md.includes("## أهم النقاط"), "H5 تصدير الملخص");
const mapMd = formatArtifactMarkdown(parseArtifact("mindmap", validMindmap));
ok(mapMd.includes("```mermaid") && mapMd.includes("mermaid.live"), "H6 تصدير الخريطة بتعليمة العرض");
const audioMd = formatArtifactMarkdown({ kind: "audio-script", data: audio });
ok(audioMd.includes("**المذيع:**") && audioMd.includes("**الخبيرة:**"), "H7 تصدير النص الصوتي بمتحدثين");
const quizMd = formatArtifactMarkdown({ kind: "quiz", data: validateQuiz(goodQuiz) });
ok(quizMd.includes("— الإجابة: أ"), "H8 تصدير الاختبار بالإجابات");

// ---------------------------------------------------------------------------
// I) limiter (injected clock)
// ---------------------------------------------------------------------------

console.log("I) الحصص");

let now = 1_000_000;
const clock = () => now;
const lim = createNotebookLimiter(1_000, 2, "GAP", "CAP", clock);
ok(lim.check("u1") === null, "I1 أول طلب يمر");
ok(lim.check("u1") === "GAP", "I2 داخل الفاصل ← رسالة الفاصل");
now += 1_500;
ok(lim.check("u1") === null, "I3 بعد الفاصل يمر");
now += 1_500;
ok(lim.check("u1") === "CAP", "I4 السقف اليومي (الثالث) ← رسالة السقف");
ok(lim.check("u2") === null, "I5 مستخدم آخر له حصته");
const day1 = new Date(2026, 8, 16, 10, 0, 0).getTime();
now = day1;
lim.reset();
ok(lim.check("u1") === null, "I6 reset ينظف");
const day2 = day1 + 26 * 60 * 60 * 1000;
now = day2;
ok(lim.check("u1") === null, "I7 غد جديد ← حصة جديدة");

// ---------------------------------------------------------------------------
// J) request validation
// ---------------------------------------------------------------------------

console.log("J) التحقق من الطلب");

ok(!validateNotebookRequest(null).ok, "J1 null ← رفض");
ok(!validateNotebookRequest({ action: "hack" }).ok, "J2 فعل مجهول ← رفض");
ok(
  !validateNotebookRequest({ action: "chat", question: "  " }).ok,
  "J3 سؤال فارغ ← رفض"
);
const validChat = {
  action: "chat",
  question: "ما هي مراحل التركيب الضوئي؟",
  history: [{ role: "user", content: "سابق" }],
  excerpts: [{ title: "الدرس", text: "المرحلة الضوئية ودورة كالفن." }],
};
const vChat = validateNotebookRequest(validChat);
ok(vChat.ok && vChat.body.action === "chat", "J4 حديث سليم");
ok(vChat.ok && vChat.body.action === "chat" && vChat.body.excerpts.length === 1, "J5 المقتطفات تنجو");
ok(
  !validateNotebookRequest({ ...validChat, excerpts: [] }).ok,
  "J6 بلا مقتطفات ← رفض (لا حديث بلا مصادر)"
);
ok(
  !validateNotebookRequest({ ...validChat, history: [{ role: "assistant", content: "أنا آخر رسالة" }] }).ok,
  "J7 التاريخ ينتهي بمساعد ← رفض الترتيب"
);
const bigExcerpts = Array.from({ length: 10 }, (_, i) => ({ title: `م${i}`, text: "س".repeat(3_000) }));
ok(
  !validateNotebookRequest({ ...validChat, excerpts: bigExcerpts }).ok,
  `J8 مقتطفات فوق ${CHAT_EXCERPT_BUDGET + EXCERPTS_SERVER_SLACK} ← رفض`
);
const validArtifact = {
  action: "summary",
  corpus: [
    { title: "أ", text: "محتوى المصدر الأول بالتفصيل".repeat(10) },
    { title: "ب", text: "محتوى المصدر الثاني بالتفصيل".repeat(10) },
  ],
};
const vArt = validateNotebookRequest(validArtifact);
ok(vArt.ok && vArt.body.action === "summary", "J9 مخرج سليم");
ok(
  !validateNotebookRequest({ action: "summary", corpus: [] }).ok,
  "J10 مُجلَّد فارغ ← رفض"
);
ok(
  !validateNotebookRequest({
    action: "summary",
    corpus: [
      { title: "أ", text: "س".repeat(30_000) },
      { title: "ب", text: "م".repeat(30_000) },
    ],
  }).ok,
  `J11 مُجلَّد فوق ${CORPUS_BUDGET + CORPUS_SERVER_SLACK} ← رفض`
);
ok(ARTIFACT_ACTIONS.length === 8, "J12 ثمانية أفعال");

// prompts — every action has a JSON/mermaid contract
ok(
  ARTIFACT_ACTIONS.every((a) => buildArtifactSystem(a).length > 80),
  "J13 لكل فعل دور نظام مكتمل"
);
ok(buildArtifactSystem("quiz").includes("correctIndex") && buildArtifactSystem("mindmap").includes("mindmap"), "J14 العقود صريحة في الأدوار");

// ---------------------------------------------------------------------------
// K) provider pipeline (stubbed) + isAiConfigured
// ---------------------------------------------------------------------------

console.log("K) خط المزوّد (مُعقّم)");

const hadGroq = !!process.env.GROQ_API_KEY;
process.env.GROQ_API_KEY = "gsk_r87_test";
const realFetch = global.fetch;
let capturedSystem = "";
global.fetch = (async (url: unknown, init?: { body?: string }) => {
  const body = JSON.parse(init?.body ?? "{}");
  capturedSystem = body.messages?.[0]?.content ?? "";
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: "```json\n" + JSON.stringify(goodSummary) + "\n```" } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}) as typeof fetch;

try {
  ok(isAiConfigured(), "K1 مفتاح واحد يكفي لتفعيل السلسلة");
  const r = await chatComplete("نظام", [{ role: "user", content: "لخّص" }]);
  eqStr(r.provider, "groq", "K2 المزوّد المُعقّم يجيب");
  ok(capturedSystem === "نظام", "K3 دور النظام يُمرّر كما هو");
  const artifact = parseArtifact("summary", r.answer);
  ok(artifact.kind === "summary" && (artifact.data as { title: string }).title === "العنوان", "K4 خط كامل: جواب المزوّد ← مدقّق ← نتيجة");
} finally {
  global.fetch = realFetch;
  if (hadGroq) process.env.GROQ_API_KEY = "gsk_real";
  else delete process.env.GROQ_API_KEY;
}

const savedGemini = process.env.GEMINI_API_KEY;
const savedXai = process.env.XAI_API_KEY;
delete process.env.GEMINI_API_KEY;
delete process.env.XAI_API_KEY;
delete process.env.GROQ_API_KEY;
ok(!isAiConfigured(), "K5 بلا مفاتيح ← غير مُفعّل (يُعيد needsConfig للعميل)");
if (savedGemini) process.env.GEMINI_API_KEY = savedGemini;
if (savedXai) process.env.XAI_API_KEY = savedXai;

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log(`\n=== r87-check: ${pass}/${pass + fail} ===`);
if (fail > 0) {
  console.error("Failures:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("دفتر طالب: كل الفحوص خضراء ✓");
