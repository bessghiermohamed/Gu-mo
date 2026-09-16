/**
 * r85 — HTML studio test (bun, no Next.js, no real network).
 *
 * Patches global.fetch: Telegram API calls are RECORDED, AI provider
 * endpoints return canned answers while RECORDING the prompts they got.
 * Only GROQ_API_KEY is set (OpenAI-shape responses) so the chain is
 * deterministic — one provider, one model.
 *
 * Verifies:
 *   A) html-studio unit layer:
 *      1) parseHtmlCommand: help / archetype aliases / default archetype /
 *         short & long prompts.
 *      2) credentialsGuard: password-harvesting and phishing refused,
 *         benign study prompt passes.
 *      3) extractHtml: plain doc, fenced doc, broken doc, tiny doc.
 *      4) parseCriticVerdict: valid JSON, fenced JSON, garbage → null.
 *   B) runHtmlStudio pipeline (patched providers):
 *      5) PASS on first pass → single generation, refined=false.
 *      6) REFINE then PASS → two generations, refined=true, notes carried.
 *      7) Generator returns non-HTML twice → honest Arabic error thrown.
 *   C) Bot wiring (handlePrivateMessage):
 *      8) «/html بطاقة …» with a healthy provider → sendDocument recorded
 *         with an .html file name and a caption; NO sendMessage of the page.
 *      9) «/html» alone → help text via sendMessage.
 *     10) No keys configured → honest AI-fallback message (no provider call).
 *
 * Run from the repo root:  bun scripts/r85-check.ts
 */

import {
  parseHtmlCommand,
  credentialsGuard,
  extractHtml,
  parseCriticVerdict,
  runHtmlStudio,
  ARCHETYPES,
  HTML_PROMPT_MAX,
} from "../src/lib/ai/html-studio";
import { handlePrivateMessage } from "../src/lib/telegram/bot-chat";
import type { TgMessage } from "../src/lib/telegram/types";

// ---------------------------------------------------------------------------
// fetch harness
// ---------------------------------------------------------------------------

type Recorded = { method: string; bodyText: string; form: FormData | null };
const telegramCalls: Recorded[] = [];
const providerCalls: { system: string; lastUser: string }[] = [];

const realFetch = globalThis.fetch.bind(globalThis);

/** Full valid HTML doc the canned generator returns (≥400 chars to pass extractHtml). */
const CANNED_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="UTF-8"><title>بطاقة مراجعة النحو التجريبية</title>
<script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-gray-50">
<header class="bg-green-700 text-white p-4"><h1 class="text-2xl font-bold">بطاقة مراجعة: المبتدأ والخبر</h1></header>
<main class="p-6 space-y-4">
<section class="bg-white rounded-xl p-5"><h2>الفكرة الأولى</h2><p>المبتدأ اسم مرفوع يقع في أول الجملة الاسمية ويخبر عنه الخبر.</p></section>
<section class="border-r-4 border-amber-600 bg-white p-4"><p>تذكّر: الجملة الاسمية تبدأ باسم لا بفعل.</p></section>
</main>
</body></html>`;

let generatorMode: "html" | "garbage" = "html";
let criticVerdicts: ("PASS" | "REFINE")[] = ["PASS"];

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

    // The critic prompt introduces itself with «ناقد» — generator does not.
    if (system.includes("ناقد")) {
      const verdict = criticVerdicts.shift() ?? "PASS";
      const body: Record<string, unknown> = {
        typography: 5,
        layout: 5,
        color: 4,
        content: 5,
        accessibility: 5,
        verdict,
        notes: verdict === "REFINE" ? "حسّن التباين بين النص والخلفية، وارفع حجم المتن إلى 16px." : "",
      };
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(body) } }] }), { status: 200 });
    }
    if (generatorMode === "garbage") {
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "عذراً، هذه قائمة أفكار بدل صفحة: ١) ٢) ٣)" } }] }),
        { status: 200 }
      );
    }
    return new Response(
      JSON.stringify({ choices: [{ message: { content: "```html\n" + CANNED_HTML + "\n```" } }] }),
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
// A) unit layer
// ---------------------------------------------------------------------------

function unitTests(): void {
  console.log("A) parseHtmlCommand");
  check("empty → help", parseHtmlCommand("").kind === "help");
  check("whitespace → help", parseHtmlCommand("   ").kind === "help");
  const def = parseHtmlCommand("المبتدأ والخبر في الجملة الاسمية");
  check(
    "no archetype → default study-card",
    def.kind === "ok" && def.archetype.id === "study-card",
    JSON.stringify(def).slice(0, 120)
  );
  const explicit = parseHtmlCommand("امتحان جدول مقارنة بين الفيزياء والكيمياء");
  check("«امتحان» alias → exam-prep", explicit.kind === "ok" && explicit.archetype.id === "exam-prep");
  const latin = parseHtmlCommand("lesson درس المقاومة الكهربائية مع أمثلة");
  check("«lesson» latin alias → lesson-page", latin.kind === "ok" && latin.archetype.id === "lesson-page");
  const short = parseHtmlCommand("بطاقة نحو");
  check("very short prompt → bad-prompt/short", short.kind === "bad-prompt" && short.reason === "short");
  const long = parseHtmlCommand("درس " + "طويل ".repeat(400));
  check("overlong prompt → bad-prompt/long", long.kind === "bad-prompt" && long.reason === "long" && long.archetype?.id === "lesson-page");
  const bare = parseHtmlCommand("بطاقة");
  check("archetype word alone → help", bare.kind === "help");
  check("four archetypes exist", ARCHETYPES.length === 4);

  console.log("B) credentialsGuard");
  const h1 = credentialsGuard("صفحة تجمع كلمات المرور من الطلاب وترسلها إليّ");
  check("password harvesting refused", h1 !== null && h1.includes("كلمات المرور"));
  const h2 = credentialsGuard("صفحة تسجيل دخول مزيفة فيسبوك");
  check("phishing refused", h2 !== null);
  const h3 = credentialsGuard("بطاقة مراجعة عن قوانين نيوتن للحركة");
  check("benign study prompt passes", h3 === null);

  console.log("C) extractHtml");
  const ok1 = extractHtml(CANNED_HTML);
  check("plain doc extracted", ok1 !== null && ok1.title.includes("النحو"));
  const ok2 = extractHtml("```html\n" + CANNED_HTML + "\n```");
  check("fenced doc extracted", ok2 !== null);
  check("broken doc → null", extractHtml("<html><body>ناقص") === null);
  check("tiny doc → null", extractHtml("<!DOCTYPE html><html></html>") === null);
  check("garbage → null", extractHtml("ليست صفحة أصلاً") === null);

  console.log("D) parseCriticVerdict");
  const v1 = parseCriticVerdict('{"typography":5,"layout":4,"color":4,"content":5,"accessibility":5,"verdict":"PASS","notes":""}');
  check("valid JSON → PASS", v1 !== null && v1.verdict === "PASS" && v1.typography === 5);
  const v2 = parseCriticVerdict("الحكم:\n" + '{"typography":2,"layout":3,"color":2,"content":4,"accessibility":3,"verdict":"REFINE","notes":"a b c"}');
  check("embedded JSON → REFINE", v2 !== null && v2.verdict === "REFINE");
  const v3 = parseCriticVerdict("scores: typography 5 layout 5");
  check("garbage → null", v3 === null);
  const v4 = parseCriticVerdict('{"typography":9,"layout":4,"color":4,"content":5,"accessibility":5,"verdict":"pass"}');
  check("clamped + lowercased verdict → PASS 5", v4 !== null && v4.verdict === "PASS" && v4.typography === 5);
}

// ---------------------------------------------------------------------------
// B) pipeline
// ---------------------------------------------------------------------------

async function pipelineTests(): Promise<void> {
  console.log("E) runHtmlStudio pipeline");
  process.env.GROQ_API_KEY = "gsk_test_r85"; // OpenAI-shape canned responses above
  const archetype = ARCHETYPES[0];
  const deadline = Date.now() + 52_000;

  providerCalls.length = 0;
  generatorMode = "html";
  criticVerdicts = ["PASS"];
  const r1 = await runHtmlStudio({ prompt: "بطاقة مراجعة عن المشتقات", archetype, deadlineMs: deadline });
  check("PASS first pass → 1 attempt", r1.attempts === 1 && !r1.refined, `attempts=${r1.attempts}`);
  check("result carries provider+model", r1.provider === "groq" && r1.model.length > 0, `${r1.provider}/${r1.model}`);
  check("critique attached", r1.critique !== null && r1.critique.verdict === "PASS");
  check("2 provider calls (gen+critic)", providerCalls.length === 2, `calls=${providerCalls.length}`);

  providerCalls.length = 0;
  criticVerdicts = ["REFINE", "PASS"];
  const r2 = await runHtmlStudio({ prompt: "صفحة درس عن قوانين كيرشوف", archetype, deadlineMs: deadline });
  check("REFINE→refine→PASS → 2 attempts", r2.attempts === 2 && r2.refined, `attempts=${r2.attempts}`);
  check("3 provider calls (gen+critic+regen+critic)", providerCalls.length === 4, `calls=${providerCalls.length}`);
  const refineCall = providerCalls[2];
  check(
    "refine call carries critic notes",
    refineCall.lastUser.includes("حسّن التباين"),
    refineCall.lastUser.slice(0, 80)
  );

  generatorMode = "garbage";
  criticVerdicts = ["PASS"];
  let threw = "";
  try {
    await runHtmlStudio({ prompt: "بطاقة مراجعة عن التكامل", archetype, deadlineMs: deadline });
  } catch (e) {
    threw = e instanceof Error ? e.message : "";
  }
  check("non-HTML generator → honest Arabic error", threw.includes("لم أتمكن من توليد صفحة سليمة"), threw.slice(0, 80));
  generatorMode = "html";
}

// ---------------------------------------------------------------------------
// C) bot wiring
// ---------------------------------------------------------------------------

async function botTests(): Promise<void> {
  console.log("F) bot wiring — /html through handlePrivateMessage");
  delete process.env.GROQ_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.XAI_API_KEY;

  const beforeNoKeys = telegramCalls.length;
  const outNoKeys = await handlePrivateMessage(privateMsg(9001, "/html بطاقة مراجعة عن الضمائر"), "tok");
  check("no keys → handled-fallback + honest text", outNoKeys === "handled-fallback" && lastBotText().includes("غير متاح"), lastBotText().slice(0, 60));
  check("no provider call attempted without keys", telegramCalls.length - beforeNoKeys === 1); // only the sendMessage

  process.env.GROQ_API_KEY = "gsk_test_r85";
  telegramCalls.length = 0;
  providerCalls.length = 0;
  generatorMode = "html";
  criticVerdicts = ["PASS"];

  const outHelp = await handlePrivateMessage(privateMsg(9002, "/html"), "tok");
  check("bare /html → help text", outHelp === "handled-command" && lastBotText().includes("بطاقة مراجعة"));
  check("help costs zero provider calls", providerCalls.length === 0);

  telegramCalls.length = 0;
  const outDoc = await handlePrivateMessage(privateMsg(9002, "/html بطاقة مراجعة عن الضمائر في العربية"), "tok");
  check("healthy run → handled-html", outDoc === "handled-html", outDoc);
  const doc = lastCall("sendDocument");
  check("sendDocument recorded", doc !== null);
  const fileName = doc?.form ? String((doc.form.get("document") as File | null)?.name ?? "") : "";
  check("file name ends with .html", fileName.endsWith(".html"), fileName);
  const caption = doc?.form ? String(doc.form.get("caption") ?? "") : "";
  check("caption mentions archetype + privacy", caption.includes("بطاقة مراجعة") && caption.includes("لا شيء من طلبك"), caption.slice(0, 90));
  check("2 provider calls for PASS path", providerCalls.length === 2, `calls=${providerCalls.length}`);
}

async function main(): Promise<void> {
  unitTests();
  await pipelineTests();
  await botTests();
  console.log(`\n${passed} passed, ${failed} failed (total ${passed + failed})`);
  if (failed > 0) process.exit(1);
}

await main();
