/**
 * r62 unit test — the Telegram bot «brain» (bot-chat.ts).
 *
 * Runs under bun with globalThis.fetch PATCHED:
 *   - api.telegram.org   → fake Telegram (captures sendMessage etc.)
 *   - generativelanguage → fake Gemini (chat answers + classification)
 *
 * Covers: /start, AI thinking path (+history), file sorting, photo
 * vision sorting, voice fallback, no-key fallback, provider failure,
 * rate limiting, and >4096-char answer chunking.
 *
 * No real token, no real network. Run: bun run scripts/r62-test-bot.ts
 */

process.env.GEMINI_API_KEY = "test-key-for-r62";
process.env.TELEGRAM_BOT_TOKEN = "123456789:AAfake_unit_test_token";

// ---- capture state before importing the module under test ----
const sentMessages: Array<{ chat_id: number; text: string }> = [];
const typingActions: number[] = [];
const geminiRequests: Array<{ system?: string; contents: unknown }> = [];
let geminiMode: "answer" | "classify" | "fail" | "empty" = "answer";
let geminiAnswer = "هذا جواب الاختبار: القوة تساوي الكتلة في التسارع.";
let telegramFail = false;

const realFetch = globalThis.fetch;

// ساعة افتراضية — حتى تمر الاختبارات المتتالية بسلام من حد الـ٣ ثوان
// (سلوك حقيقي: الطالب يرسل الرد بعد ثوانٍ، لا فوراً)
let virtualNow = Date.now();
const realDateNow = Date.now.bind(Date);
Date.now = () => virtualNow;
function tick(ms: number) {
  virtualNow += ms;
}

globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  const u = String(url);
  if (u.includes("api.telegram.org/")) {
    if (telegramFail) return new Response(JSON.stringify({ ok: false, description: "test telegram down" }), { status: 200 });
    if (u.includes("/sendChatAction")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      typingActions.push(Number(body.chat_id));
      return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
    }
    if (u.includes("/sendMessage")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      sentMessages.push({ chat_id: Number(body.chat_id), text: String(body.text ?? "") });
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
    }
    if (u.includes("/getFile")) {
      return new Response(JSON.stringify({ ok: true, result: { file_path: "photos/test.jpg" } }), { status: 200 });
    }
    if (u.includes("/file/bot")) {
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { "content-type": "image/jpeg" } });
    }
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  }
  if (u.includes("generativelanguage.googleapis.com")) {
    const body = JSON.parse(String(init?.body ?? "{}"));
    geminiRequests.push(body as { system?: string; contents: unknown });
    if (geminiMode === "fail") return new Response("quota exceeded", { status: 429 });
    if (geminiMode === "empty") {
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [] } }] }), { status: 200 });
    }
    // نميّز: طلب التصنيف يحمل «صنّف المحتوى» في النص؛ المحادثة لا
    const isClassify = JSON.stringify(body).includes("صنّف المحتوى التالي");
    const text = isClassify
      ? JSON.stringify({ item_type: "امتحان", title: "امتحان التحليل الرياضي 2024", text: "" })
      : geminiAnswer;
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }
  return realFetch(url as RequestInfo, init as RequestInit | undefined);
}) as typeof fetch;

const { handlePrivateMessage } = await import("../src/lib/telegram/bot-chat");
const { splitForTelegram } = await import("../src/lib/telegram/bot-api");

// ---- helpers ----
let nextId = 1000;
function privateMsg(fromId: number, text: string, extra: Record<string, unknown> = {}) {
  nextId += 1;
  return {
    message_id: nextId,
    from: { id: fromId, is_bot: false, first_name: "طالب اختبار" },
    chat: { id: fromId, type: "private", first_name: "طالب اختبار" },
    date: Math.floor(Date.now() / 1000),
    text,
    ...extra,
  } as never;
}

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    passed += 1;
    console.log(`  ✅ ${name}`);
  } else {
    failed += 1;
    console.log(`  ❌ ${name} ${extra}`);
  }
}

// ============================================================
console.log("1) /start — welcome message");
sentMessages.length = 0;
{
  const out = await handlePrivateMessage(privateMsg(11, "/start"), "fake-token");
  check("outcome handled-command", out === "handled-command", `got ${out}`);
  check("welcome sent", sentMessages.length === 1 && sentMessages[0].text.includes("طالب"));
  check("welcome mentions sorting + thinking", sentMessages[0]?.text.includes("أرتّب") && sentMessages[0]?.text.includes("أجيب"));
  check("no AI call for /start", geminiRequests.length === 0);
}

console.log("2) text question — AI thinking path");
sentMessages.length = 0; geminiRequests.length = 0; typingActions.length = 0;
{
  const out = await handlePrivateMessage(privateMsg(12, "ما هي سرعة الضوء؟"), "fake-token");
  check("outcome handled-ai", out === "handled-ai", `got ${out}`);
  check("typing indicator shown", typingActions.includes(12));
  check("answer sent to the right chat", sentMessages.length === 1 && sentMessages[0]?.chat_id === 12);
  check("answer content from provider", sentMessages[0]?.text === geminiAnswer);
  check("gemini received the user question", JSON.stringify(geminiRequests[0]).includes("ما هي سرعة الضوء؟"));
}

console.log("3) conversation memory — follow-up includes history");
sentMessages.length = 0; geminiRequests.length = 0;
{
  tick(4_000); // الطالب الحقيقي يكتب رده بعد ثوانٍ
  const out = await handlePrivateMessage(privateMsg(12, "وفي الماء؟"), "fake-token");
  check("outcome handled-ai", out === "handled-ai", `got ${out}`);
  const body = JSON.stringify(geminiRequests[0]);
  check("history included (prev Q + A)", body.includes("ما هي سرعة الضوء؟") && body.includes(geminiAnswer));
}

console.log("4) document — smart sorting (classification) reply");
sentMessages.length = 0; geminiRequests.length = 0;
{
  const msg = privateMsg(14, "", {
    text: undefined,
    document: { file_id: "doc1", file_name: "exam-analyse-2024.pdf", mime_type: "application/pdf" },
    caption: "امتحان محلول في التحليل",
  });
  const out = await handlePrivateMessage(msg, "fake-token");
  check("outcome handled-classify", out === "handled-classify", `got ${out}`);
  check("reply contains the sorted type", sentMessages[0]?.text.includes("امتحان"));
  check("reply contains the suggested title", sentMessages[0]?.text.includes("امتحان التحليل الرياضي 2024"));
  check("privacy note included", sentMessages[0]?.text.includes("لم يُحفظ"));
}

console.log("5) photo — vision classification (file download path)");
sentMessages.length = 0; geminiRequests.length = 0;
{
  const msg = privateMsg(15, "", {
    text: undefined,
    photo: [{ file_id: "ph1", file_unique_id: "u1", width: 800, height: 600 }],
    caption: "تمارين TD",
  });
  const out = await handlePrivateMessage(msg, "fake-token");
  check("outcome handled-classify", out === "handled-classify", `got ${out}`);
  const req = JSON.stringify(geminiRequests[0] ?? {});
  check("image sent inline to the classifier", req.includes("inline_data"));
  check("typing indicator shown", typingActions.includes(15));
}

console.log("6) voice — graceful unsupported reply");
sentMessages.length = 0;
{
  const msg = privateMsg(16, "", { text: undefined, voice: { file_id: "v1", mime_type: "audio/ogg", duration: 5 } });
  const out = await handlePrivateMessage(msg, "fake-token");
  check("outcome handled-fallback", out === "handled-fallback", `got ${out}`);
  check("voice note explains limitation", sentMessages[0]?.text.includes("الصوتية") && sentMessages[0]?.text.includes("غير مدعومة"));
}

console.log("7) AI provider failure — friendly fallback");
sentMessages.length = 0; geminiMode = "fail";
{
  const out = await handlePrivateMessage(privateMsg(17, "سؤال صعب"), "fake-token");
  check("outcome handled-fallback", out === "handled-fallback", `got ${out}`);
  check("fallback message sent", sentMessages.length === 1 && sentMessages[0]?.text.includes("غير متاح"));
}
geminiMode = "answer";

console.log("8) rate limiting — burst second message");
sentMessages.length = 0;
{
  const out1 = await handlePrivateMessage(privateMsg(18, "رسالة أولى"), "fake-token");
  const out2 = await handlePrivateMessage(privateMsg(18, "رسالة ثانية فورية"), "fake-token");
  check("first passes", out1 === "handled-ai", `got ${out1}`);
  check("second is rate-limited", out2 === "rate-limited", `got ${out2}`);
  check("limit notice sent", sentMessages.some((m) => m.text.includes("ثوانٍ")), JSON.stringify(sentMessages.map((m) => m.text.slice(0, 30))));
}

console.log("9) no AI key configured — fallback text");
sentMessages.length = 0;
const prevKey = process.env.GEMINI_API_KEY;
process.env.GEMINI_API_KEY = "";
{
  const out = await handlePrivateMessage(privateMsg(19, "سؤال بلا مفتاح"), "fake-token");
  check("outcome handled-fallback", out === "handled-fallback", `got ${out}`);
  check("fallback mentions the in-app assistant", sentMessages[0]?.text.includes("المساعد الذكي"));
}
process.env.GEMINI_API_KEY = prevKey;

console.log("10) long answer — chunked under 4096");
sentMessages.length = 0;
geminiAnswer = "جواب طويل جداً. ".repeat(900); // ~13500 chars
{
  const out = await handlePrivateMessage(privateMsg(20, "اشرح كل شيء"), "fake-token");
  check("outcome handled-ai", out === "handled-ai", `got ${out}`);
  check("split into 4 chunks", sentMessages.length === 4, `got ${sentMessages.length}`);
  check("every chunk within the limit", sentMessages.every((m) => m.text.length <= 4000));
}
geminiAnswer = "جواب قصير.";

console.log("11) telegram send failure — never throws");
telegramFail = true; sentMessages.length = 0;
{
  const out = await handlePrivateMessage(privateMsg(21, "اختبار فشل الإرسال"), "fake-token");
  check("does not throw, graceful outcome", out === "handled-ai" || out === "handled-fallback", `got ${out}`);
}
telegramFail = false;

console.log("12) splitForTelegram — pure function sanity");
{
  const parts = splitForTelegram("سطر واحد\n\n".repeat(0) + "x".repeat(9000));
  check("9000 chars → 3 parts", parts.length === 3, `got ${parts.length}`);
  const two = splitForTelegram("قصير");
  check("short text stays whole", two.length === 1 && two[0] === "قصير");
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
