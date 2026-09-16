/**
 * r86 — study tools test (bun, no Next.js, no real network).
 *
 * Patches global.fetch: Telegram API calls are RECORDED, AI provider
 * endpoints return canned answers while RECORDING the system prompts.
 * Only GROQ_API_KEY is set (OpenAI-shape responses) — deterministic chain.
 *
 * Verifies:
 *   A) Diagram studio: command parsing (types, auto, lengths), Mermaid
 *      extraction/validation (headers, http, click, size), pipeline
 *      (pass / correct-once / honest failure).
 *   B) Translation: parsing (explicit target, auto), Arabic detection,
 *      target resolution (ar→fr, fr→ar), pipeline.
 *   C) Analyzer: parsing + pipeline (five section headers pass through).
 *   D) Detector: 120-char floor, verdict parsing (garbage, missing
 *      signals, 90→85 clamp), formatted message carries the disclaimer,
 *      honest failure when signals are incomplete.
 *   E) Review: fenced/plain code extraction, malware guard refusal with
 *      ZERO provider calls, pipeline sections.
 *   F) Bot wiring: all five commands route, helps cost nothing, files
 *      (.mmd) delivered with captions, quotas (gap + daily cap), /help
 *      lists the tools, no-keys fallback.
 *
 * Run from the repo root:  bun scripts/r86-check.ts
 */

import {
  parseDiagramCommand,
  extractMermaid,
  validateMermaid,
  findDiagramType,
  runDiagramStudio,
  parseTranslateCommand,
  mostlyArabic,
  resolveTarget,
  findLang,
  runTranslateStudio,
  parseAnalyzeCommand,
  runAnalyzeStudio,
  parseDetectCommand,
  parseDetectVerdict,
  formatDetectMessage,
  runDetectStudio,
  parseReviewCommand,
  studyGuard,
  runReviewStudio,
} from "../src/lib/ai/study-tools";
import {
  handlePrivateMessage,
  __resetToolLimits,
  __limitCheck,
} from "../src/lib/telegram/bot-chat";
import type { TgMessage } from "../src/lib/telegram/types";

// ---------------------------------------------------------------------------
// fetch harness — canned dispatch by system-prompt fingerprint
// ---------------------------------------------------------------------------

type Recorded = { method: string; bodyText: string; form: FormData | null };
const telegramCalls: Recorded[] = [];
const providerCalls: { system: string; lastUser: string }[] = [];

const realFetch = globalThis.fetch.bind(globalThis);

const CANNED_MERMAID = 'flowchart TD\n  A["البداية"] --> B["حساب المجموع"] --> C["النهاية"]';
const CANNED_TRANSLATION = "Traduction académique : le vecteur vitesse est la dérivée de la position.";
const CANNED_ANALYSIS =
  "التصحيح: بلا أخطاء تُذكر\nالتشكيل: إنَّ الطالِبَينِ مُجْتَهِدَانِ\nالإعراب: إنَّ: حرف توكيد ونصب.\nالصرف: مجتهدان: جَدّ، وزن فَعِيل.\nالمعاني: المجتهد: الكثير العناية بالدرس.";
const CANNED_DETECT = JSON.stringify({
  probability: 78,
  verdict: "ai-leaning",
  signals: ["بنية عمودية متكررة بلا انحراف", "انتقالات نمطية في أول كل فقرة"],
  advice: "أضف أمثلتك المحلية وتجربتك الشخصية ليصبح النص أكثر أصالة.",
});
const CANNED_REVIEW =
  "ما يفعله: يحسب مجموع قائمة أعداد.\nمشاكل: لا مشاكل جوهرية ظاهرة\nتبسيط: استعمل الدالة sum مباشرة بدل الحلقة.\nنسخة محسّنة: الكود جيد كما هو.";

let diagramQueue: string[] = []; // للتسلسل: أول جواب بلا كود ← تصحيح
let detectMode: "ok" | "no-signals" = "ok";

function providerAnswer(system: string): string {
  if (system.includes("Mermaid")) {
    const next = diagramQueue.shift();
    return next ?? CANNED_MERMAID;
  }
  if (system.includes("مترجم أكاديمي")) return CANNED_TRANSLATION;
  if (system.includes("نحوي وصرفي")) return CANNED_ANALYSIS;
  if (system.includes("تمييز النصوص الأكاديمية")) {
    if (detectMode === "no-signals") {
      return JSON.stringify({ probability: 40, verdict: "mixed", signals: ["إشارة وحيدة فقط"], advice: "" });
    }
    return CANNED_DETECT;
  }
  if (system.includes("مراجع كود")) return CANNED_REVIEW;
  return "جواب عام";
}

(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
  const u = String(url);
  if (u.includes("api.telegram.org")) {
    const method = u.split("/").pop() ?? "";
    const isForm = init?.body instanceof FormData;
    telegramCalls.push({
      method,
      bodyText: isForm ? "(form)" : String(init?.body ?? "{}"),
      form: isForm ? (init?.body as FormData) : null,
    });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
  }
  if (u.includes("api.groq.com")) {
    const parsed = JSON.parse(String(init?.body ?? "{}")) as {
      messages?: Array<{ role: string; content: string }>;
    };
    const system = parsed.messages?.[0]?.content ?? "";
    const lastUser = [...(parsed.messages ?? [])].reverse().find((m) => m.role === "user")?.content ?? "";
    providerCalls.push({ system, lastUser });
    return new Response(
      JSON.stringify({ choices: [{ message: { content: providerAnswer(system) } }] }),
      { status: 200 }
    );
  }
  return realFetch(url, init);
}) as typeof fetch;

// ---------------------------------------------------------------------------
// tiny test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = ""): void {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

function privateMsg(userId: number, text: string): TgMessage {
  return {
    message_id: 1,
    date: 0,
    from: { id: userId, is_bot: false, first_name: "Test" },
    chat: { id: userId, type: "private", first_name: "Test" },
    text,
  } as TgMessage;
}

function lastCall(method: string): Recorded | null {
  for (let i = telegramCalls.length - 1; i >= 0; i--) {
    if (telegramCalls[i].method === method) return telegramCalls[i];
  }
  return null;
}

function lastBotText(): string {
  const c = lastCall("sendMessage");
  if (!c) return "";
  try {
    return String(JSON.parse(c.bodyText).text ?? "");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// A) diagram
// ---------------------------------------------------------------------------

function diagramUnitTests(): void {
  console.log("A) diagram — parsing & validation");
  check("empty → help", parseDiagramCommand("").kind === "help");
  const typed = parseDiagramCommand("انسيابي دورة الماء في الطبيعة");
  check("«انسيابي» → flowchart type + prompt", typed.kind === "ok" && typed.type?.id === "flowchart" && typed.prompt.includes("دورة الماء"));
  const latin = parseDiagramCommand("mindmap خريطة درس المقاومة");
  check("«mindmap» latin alias works", latin.kind === "ok" && latin.type?.id === "mindmap");
  const auto = parseDiagramCommand("خطوات تجربة المعايرة الحمضية القاعدية");
  check("no type → auto (null)", auto.kind === "ok" && auto.type === null);
  check("type word alone → help", parseDiagramCommand("انسيابي").kind === "help");
  check("short → bad-prompt", parseDiagramCommand("انسيابي دورة").kind === "bad-prompt");
  const long = parseDiagramCommand("انسيابي " + "طويل ".repeat(300));
  check("long → bad-prompt", long.kind === "bad-prompt" && long.reason === "long");

  check("findDiagramType aliases", findDiagramType("زمني")?.id === "gantt" && findDiagramType("class")?.id === "class" && findDiagramType("نسب")?.id === "pie");

  const fenced = extractMermaid("```mermaid\n" + CANNED_MERMAID + "\n```");
  check("fenced mermaid extracted", fenced !== null && fenced.startsWith("flowchart TD"));
  const proseMixed = extractMermaid("إليك المخطط:\n" + CANNED_MERMAID);
  check("prose+code → starts at header", proseMixed !== null && proseMixed.startsWith("flowchart"));
  check("no header → null", extractMermaid("شرح نصي كامل بلا كود إطلاقاً") === null);

  check("valid code → null reason", validateMermaid(CANNED_MERMAID) === null);
  check("bad header → reason", validateMermaid("drawing thing\nA --> B") !== null);
  check("http → reason", validateMermaid(CANNED_MERMAID + '\nA --> B["http://x.com"]') !== null);
  check("click → reason", validateMermaid("flowchart TD\n click A callback") !== null);
  check("tiny code → reason", validateMermaid("flowchart TD") !== null);
}

async function diagramPipelineTests(): Promise<void> {
  console.log("B) diagram — pipeline");
  const deadline = Date.now() + 52_000;

  diagramQueue = [CANNED_MERMAID];
  const r1 = await runDiagramStudio({ prompt: "دورة الماء", type: findDiagramType("انسيابي"), deadlineMs: deadline });
  check("valid first pass → corrected=false", !r1.corrected && r1.typeLabel === "مخطط انسيابي");
  check("result carries provider", r1.provider === "groq");

  diagramQueue = ["إليك شرحاً نصياً بلا كود للأسف", CANNED_MERMAID];
  const r2 = await runDiagramStudio({ prompt: "دورة الماء", type: null, deadlineMs: deadline });
  check("invalid then retry → corrected=true", r2.corrected, JSON.stringify(r2).slice(0, 100));
  const retryUser = providerCalls[providerCalls.length - 1].lastUser;
  check("retry call carries validation feedback", retryUser.includes("لم يحتوي كود Mermaid") || retryUser.includes("فحص الصياغة"));

  diagramQueue = ["نص أول بلا كود", "نص ثانٍ بلا كود أيضاً"];
  let threw = "";
  try {
    await runDiagramStudio({ prompt: "دورة الماء", type: null, deadlineMs: deadline });
  } catch (e) {
    threw = e instanceof Error ? e.message : "";
  }
  check("garbage twice → honest error", threw.includes("لم أتمكن من بناء مخطط سليم"), threw.slice(0, 80));
}

// ---------------------------------------------------------------------------
// B) translation
// ---------------------------------------------------------------------------

function translateUnitTests(): void {
  console.log("C) translate — parsing & target resolution");
  check("empty → help", parseTranslateCommand("").kind === "help");
  const explicit = parseTranslateCommand("en The speed vector is the derivative");
  check("«en» → explicit target", explicit.kind === "ok" && explicit.target?.code === "en");
  const arabicAlias = parseTranslateCommand("فرنسي وصف التجربة كاملاً مع النتائج");
  check("«فرنسي» → fr", arabicAlias.kind === "ok" && arabicAlias.target?.code === "fr");
  const auto = parseTranslateCommand("وصف التجربة كاملاً");
  check("no lang → auto", auto.kind === "ok" && auto.target === null);
  check("lang word alone → help", parseTranslateCommand("en").kind === "help");

  check("mostlyArabic true", mostlyArabic("إن الطلاب المجتهدين يناجحون بامتياز"));
  check("mostlyArabic false (French)", !mostlyArabic("Le vecteur vitesse est la dérivée de la position par rapport au temps."));

  const t1 = resolveTarget("وصف التجربة كاملاً", null);
  check("Arabic text → fr (auto)", t1.code === "fr");
  const t2 = resolveTarget("Le vecteur vitesse", null);
  check("French text → ar (auto)", t2.code === "ar");
  const t3 = resolveTarget("وصف التجربة", findLang("en"));
  check("explicit overrides auto", t3.code === "en");
}

async function translatePipelineTests(): Promise<void> {
  console.log("D) translate — pipeline");
  const r1 = await runTranslateStudio("Le vecteur vitesse est la dérivée de la position.", null);
  check("auto target label = العربية", r1.targetLabel === "العربية" && r1.autoDetected);
  check("translation text passes through", r1.translation.includes("Traduction académique"));
  const r2 = await runTranslateStudio("الوصف الكامل للتجربة", findLang("en"));
  check("explicit en target", r2.targetLabel === "الإنجليزية" && !r2.autoDetected);
}

// ---------------------------------------------------------------------------
// C) analyzer
// ---------------------------------------------------------------------------

function analyzeTests(): void {
  console.log("E) analyze");
  check("empty → help", parseAnalyzeCommand("").kind === "help");
  check("short → bad", parseAnalyzeCommand("نم").kind === "bad-prompt");
  const ok = parseAnalyzeCommand("إن الطلاب المجتهدين يناجحون بامتياز في كل المواد هذا العام");
  check("valid → ok", ok.kind === "ok");
  const long = parseAnalyzeCommand("طويل ".repeat(400));
  check("long → bad", long.kind === "bad-prompt" && long.reason === "long");
}

async function analyzePipelineTests(): Promise<void> {
  const r = await runAnalyzeStudio("إن الطلاب المجتهدين يناجحون بامتياز");
  check("five sections in output", r.analysis.includes("التصحيح:") && r.analysis.includes("المعاني:"));
  check("provider recorded", r.provider === "groq");
}

// ---------------------------------------------------------------------------
// D) detector
// ---------------------------------------------------------------------------

const DETECT_SAMPLE =
  "يعتبر التحول الرقمي من أهم الموضوعات التي تشغل المؤسسات التعليمية اليوم. حيث تسعى كل مؤسسة إلى تطوير أنظمتها الرقمية لتحسين جودة التعليم. ونتيجة لذلك أصبحت المنصات التعليمية جزءاً أساسياً من العملية التعليمية في مختلف المستويات. ومع ذلك تبقى هناك تحديات كبيرة أمام هذا التحول.";

function detectUnitTests(): void {
  console.log("F) detect — parsing & verdict");
  check("empty → help", parseDetectCommand("").kind === "help");
  check("short (<120) → bad", parseDetectCommand("نص قصير جداً لا يحمل إشارات كافية للحكم") .kind === "bad-prompt");
  check("valid → ok", parseDetectCommand(DETECT_SAMPLE).kind === "ok");
  const long = parseDetectCommand("طويل ".repeat(1500));
  check("long → bad", long.kind === "bad-prompt");

  const v1 = parseDetectVerdict(CANNED_DETECT);
  check("valid JSON → verdict", v1 !== null && v1.verdict === "ai-leaning" && v1.probability === 78 && v1.signals.length === 2);
  check("garbage → null", parseDetectVerdict("تحليل نصي بلا JSON") === null);
  const v2 = parseDetectVerdict('{"probability":40,"verdict":"mixed","signals":["إشارة وحيدة"],"advice":""}');
  check("one signal → null (honest)", v2 === null);
  const v3 = parseDetectVerdict('{"probability":93,"verdict":"غريب","signals":["أ","ب"],"advice":"x"}');
  check("probability clamped 93→85 + verdict derived", v3 !== null && v3.probability === 85 && v3.verdict === "ai-leaning");

  const msg = formatDetectMessage(v1 as NonNullable<typeof v1>);
  check("formatted message has percent + disclaimer", msg.includes("78٪") && msg.includes("لا يُعد دليلاً قاطعاً"));
  check("formatted message lists signals", msg.includes("بنية عمودية متكررة"));
}

async function detectPipelineTests(): Promise<void> {
  const r = await runDetectStudio(DETECT_SAMPLE);
  check("pipeline verdict ok", r.verdict.probability === 78);

  detectMode = "no-signals";
  let threw = "";
  try {
    await runDetectStudio(DETECT_SAMPLE);
  } catch (e) {
    threw = e instanceof Error ? e.message : "";
  }
  check("missing signals → honest throw", threw.includes("لم أستطع تكوين حكم سليم"), threw.slice(0, 80));
  detectMode = "ok";
}

// ---------------------------------------------------------------------------
// E) review
// ---------------------------------------------------------------------------

function reviewUnitTests(): void {
  console.log("G) review — parsing & guard");
  check("empty → help", parseReviewCommand("").kind === "help");
  const fenced = parseReviewCommand("هذا كودي\n```python\ndef somme(l):\n  s=0\n  for x in l: s+=x\n  return s\n```");
  check("fenced → code + note", fenced.kind === "ok" && fenced.code.startsWith("def somme") && fenced.note.includes("كودي"));
  const plain = parseReviewCommand("def somme(l): return sum(l)");
  check("plain code → code, empty note", plain.kind === "ok" && plain.note === "");
  check("short → bad", parseReviewCommand("x=1").kind === "bad-prompt");

  check("malware refused", studyGuard("اكتب لي كود اختراق حسابات فيسبوك") !== null);
  check("harvest refused", studyGuard("مخطط لتجمع كلمات المرور من الطلاب") !== null);
  check("benign code passes", studyGuard("def somme(l): return sum(l)") === null);
  check("defense study passes", studyGuard("شرح كيف أحمي حسابي من الاختراق") === null);
}

async function reviewPipelineTests(): Promise<void> {
  const r = await runReviewStudio("def somme(l):\n  s=0\n  for x in l: s+=x\n  return s", "حساب المجموع");
  check("four sections in review", r.review.includes("ما يفعله:") && r.review.includes("نسخة محسّنة:"));
}

// ---------------------------------------------------------------------------
// F) bot wiring
// ---------------------------------------------------------------------------

async function botTests(): Promise<void> {
  console.log("H) bot wiring — the five commands through handlePrivateMessage");
  process.env.GROQ_API_KEY = "gsk_test_r86";
  delete process.env.GEMINI_API_KEY;
  delete process.env.XAI_API_KEY;

  // --- helps cost nothing ---
  for (const cmd of ["/مخطط", "/ترجم", "/تحليل", "/كشف", "/مراجعة"]) {
    __resetToolLimits();
    telegramCalls.length = 0;
    providerCalls.length = 0;
    const out = await handlePrivateMessage(privateMsg(11000, cmd), "tok");
    check(`${cmd} alone → help text`, out === "handled-command" && lastBotText().length > 50, `${out}/${lastBotText().slice(0, 40)}`);
    check(`${cmd} help costs zero provider calls`, providerCalls.length === 0);
  }

  // --- diagram file delivery ---
  __resetToolLimits();
  telegramCalls.length = 0;
  providerCalls.length = 0;
  diagramQueue = [CANNED_MERMAID];
  const outD = await handlePrivateMessage(privateMsg(12001, "/مخطط انسيابي دورة الماء في الطبيعة"), "tok");
  check("diagram → handled-tool", outD === "handled-tool", outD);
  const docD = lastCall("sendDocument");
  const nameD = docD?.form ? String((docD.form.get("document") as File | null)?.name ?? "") : "";
  check(".mmd file delivered", nameD.endsWith(".mmd"), nameD);
  const capD = docD?.form ? String(docD.form.get("caption") ?? "") : "";
  check("caption explains mermaid.live + privacy", capD.includes("mermaid.live") && capD.includes("لا شيء من طلبك"));
  check("diagram 1 provider call", providerCalls.length === 1, `calls=${providerCalls.length}`);

  // --- translate auto ---
  __resetToolLimits();
  telegramCalls.length = 0;
  const outT = await handlePrivateMessage(privateMsg(12002, "/ترجم Le vecteur vitesse est la dérivée de la position."), "tok");
  check("translate → handled-tool", outT === "handled-tool", outT);
  check("translation text sent", lastBotText().includes("Traduction académique"));

  // --- analyze ---
  __resetToolLimits();
  telegramCalls.length = 0;
  const outA = await handlePrivateMessage(privateMsg(12003, "/تحليل إن الطلاب المجتهدين يناجحون بامتياز في كل المواد هذا العام"), "tok");
  check("analyze → handled-tool", outA === "handled-tool", outA);
  check("analysis sections sent", lastBotText().includes("التصحيح:"));

  // --- detect ---
  __resetToolLimits();
  telegramCalls.length = 0;
  const outK = await handlePrivateMessage(privateMsg(12004, `/كشف ${DETECT_SAMPLE}`), "tok");
  check("detect → handled-tool", outK === "handled-tool", outK);
  check("detect message has disclaimer", lastBotText().includes("لا يُعد دليلاً قاطعاً"));

  // detect honest failure when signals incomplete
  __resetToolLimits();
  telegramCalls.length = 0;
  detectMode = "no-signals";
  const outK2 = await handlePrivateMessage(privateMsg(12005, `/كشف ${DETECT_SAMPLE}`), "tok");
  check("detect no-signals → honest message", outK2 === "handled-fallback" && lastBotText().includes("لم أستطع تكوين حكم سليم"));
  detectMode = "ok";

  // --- review refusal (guard BEFORE provider, BEFORE quota) ---
  __resetToolLimits();
  telegramCalls.length = 0;
  providerCalls.length = 0;
  const outR0 = await handlePrivateMessage(privateMsg(12006, "/مراجعة ```\nكود اختراق حسابات فيسبوك احترافي\n```"), "tok");
  check("malware review refused", outR0 === "handled-fallback" && lastBotText().includes("حدودي الأمنية"));
  check("refusal costs zero provider calls", providerCalls.length === 0);

  // --- review happy path ---
  __resetToolLimits();
  telegramCalls.length = 0;
  const outR = await handlePrivateMessage(privateMsg(12007, "/مراجعة ```python\ndef somme(l):\n  s=0\n  for x in l: s+=x\n  return s\n```"), "tok");
  check("review → handled-tool", outR === "handled-tool", outR);
  check("review sections sent", lastBotText().includes("ما يفعله:"));

  // --- quotas: gap fires on rapid second light call; daily cap via unit hook ---
  __resetToolLimits();
  telegramCalls.length = 0;
  const q1 = await handlePrivateMessage(privateMsg(13001, "/تحليل إن الطلاب المجتهدين يناجحون بامتياز هذا العام"), "tok");
  const q2 = await handlePrivateMessage(privateMsg(13001, "/ترجم نص للترجمة هنا"), "tok");
  check("light tools share quota pool: first ok, second gap-limited", q1 === "handled-tool" && q2 === "rate-limited", `${q1}/${q2}`);
  check("gap message sent", lastBotText().includes("بين كل أداة وأخرى"));

  const probe = new Map<number, { last: number; day: string; count: number }>();
  let capMsg: string | null = null;
  for (let i = 0; i < 25; i++) {
    capMsg = __limitCheck(999, probe, 0, 24, "gap", "daily-cap-hit");
  }
  check("daily cap fires after 24 (25th blocked)", capMsg === "daily-cap-hit");

  // --- /help lists the tools ---
  __resetToolLimits();
  telegramCalls.length = 0;
  await handlePrivateMessage(privateMsg(14001, "/help"), "tok");
  const help = lastBotText();
  check(
    "/help lists all five tools + html",
    ["/ترجم", "/تحليل", "/مخطط", "/كشف", "/مراجعة", "/html"].every((c) => help.includes(c)),
    help.slice(0, 120)
  );

  // --- no keys → honest fallback, zero provider calls ---
  delete process.env.GROQ_API_KEY;
  __resetToolLimits();
  telegramCalls.length = 0;
  providerCalls.length = 0;
  const outNoKeys = await handlePrivateMessage(privateMsg(15001, "/ترجم نص للترجمة"), "tok");
  check("no keys → fallback + honest text", outNoKeys === "handled-fallback" && lastBotText().includes("غير متاح"));
  check("no provider call without keys", providerCalls.length === 0);
  process.env.GROQ_API_KEY = "gsk_test_r86";
}

async function main(): Promise<void> {
  process.env.GROQ_API_KEY = "gsk_test_r86"; // OpenAI-shape canned responses
  diagramUnitTests();
  await diagramPipelineTests();
  translateUnitTests();
  await translatePipelineTests();
  analyzeTests();
  await analyzePipelineTests();
  detectUnitTests();
  await detectPipelineTests();
  reviewUnitTests();
  await reviewPipelineTests();
  await botTests();
  console.log(`\n${passed} passed, ${failed} failed (total ${passed + failed})`);
  if (failed > 0) process.exit(1);
}

await main();
