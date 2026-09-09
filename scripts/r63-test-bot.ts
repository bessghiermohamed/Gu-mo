/**
 * Round 63 — unit tests (bun) for the self-activation + ENS-forum brain.
 *
 * Runs with patched fetch (fake Telegram + fake AI provider) — pure modules
 * only, no Next.js imports. Usage: bun run scripts/r63-test-bot.ts
 */

// ---------------------------------------------------------------------------
// Patched fetch: fake Telegram + fake AI
// ---------------------------------------------------------------------------
const REAL_TOKEN = process.env.R63_REAL_TOKEN || "8635909400:AAfake_placeholder_token_for_unit_tests_0000";
const sentMessages: Array<{ method: string; body: Record<string, unknown> }> = [];

const fakeTelegram = (method: string, body: Record<string, unknown>) => {
  sentMessages.push({ method, body });
  if (method === "getMe") {
    return { ok: true, result: { id: 8635909400, username: "gu_mo_bot", first_name: "Talib_app", is_bot: true } };
  }
  if (method === "sendMessage") {
    const chatId = Number(body.chat_id ?? 0);
    if (chatId > 0 && chatId < 1000) return { ok: false, description: "chat not found" };
    return { ok: true, result: { message_id: 1 } };
  }
  if (method === "setWebhook") {
    const url = String(body.url ?? "");
    if (!url.startsWith("https://")) {
      return { ok: false, description: "Bad Request: bad webhook: HTTPS url must be provided for webhook" };
    }
    return { ok: true, result: true, description: "Webhook was set" };
  }
  return { ok: true, result: true };
};

const fakeAI = () => ({ candidates: [{ content: { parts: [{ text: "جواب اختباري موجز من العقل الاصطناعي." }] } }] });

const g: typeof globalThis = globalThis as typeof globalThis;
(g as unknown as { __r63_sent?: typeof sentMessages }).__r63_sent = sentMessages;
const origFetch = g.fetch;
g.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(typeof input === "string" ? input : (input as URL).toString());
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  const method = url.split("/").pop() ?? "";
  if (url.includes("api.telegram.org")) {
    return new Response(JSON.stringify(fakeTelegram(method, body)), { status: 200 });
  }
  if (url.includes("generativelanguage")) {
    return new Response(JSON.stringify(fakeAI()), { status: 200 });
  }
  if (url.includes("api.groq") || url.includes("api.x.ai")) {
    return new Response(JSON.stringify({ choices: [{ message: { content: "fallback" } }] }), { status: 200 });
  }
  if (typeof origFetch === "function") {
    return origFetch(input as RequestInfo, init);
  }
  return new Response("{}", { status: 200 });
}) as typeof fetch;

// env: Gemini only (the non-streaming chatComplete path — easiest to fake)
process.env.GEMINI_API_KEY = "fake_gemini_for_tests";
delete process.env.GROQ_API_KEY;

// ---------------------------------------------------------------------------
// Imports AFTER the patch
// ---------------------------------------------------------------------------
const {
  derivedWebhookSecret,
  autoWebhookUrl,
  extractUrlToken,
  botIdFromToken,
  isAutoBotToken,
  TOKEN_RE,
} = await import("../src/lib/telegram/auto-bot");
const { sendMessageReply, splitForTelegram } = await import("../src/lib/telegram/bot-api");
const { isBotAddressed, handleGroupMessage } = await import("../src/lib/telegram/bot-chat");
const { buildDeepLink } = await import("../src/lib/telegram/ingest");
type TgMessage = import("../src/lib/telegram/types").TgMessage;

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}`, extra ?? "");
  }
}

console.log("\n=== r63: auto-bot module ===");
{
  const secret1 = derivedWebhookSecret(REAL_TOKEN);
  const secret2 = derivedWebhookSecret(REAL_TOKEN);
  check("derived secret deterministic", secret1 === secret2 && secret1.startsWith("tgk_") && secret1.length === 44, secret1);
  check("different tokens → different secrets", derivedWebhookSecret("111111111:AA" + "x".repeat(34)) !== secret1);
  check("token format valid", TOKEN_RE.test(REAL_TOKEN));
  check("bad format rejected", !TOKEN_RE.test("8635909400:short") && !TOKEN_RE.test("not-a-token"));

  const url = autoWebhookUrl(REAL_TOKEN, "https://gu-mo.vercel.app");
  check("auto webhook URL embeds encoded token", url === `https://gu-mo.vercel.app/api/telegram/webhook?b=${encodeURIComponent(REAL_TOKEN)}`, url);
  const extracted = extractUrlToken(url);
  check("URL token extracted back", extracted === REAL_TOKEN, extracted);
  check("no ?b= → null", extractUrlToken("https://gu-mo.vercel.app/api/telegram/webhook") === null);
  check("garbage ?b= → null", extractUrlToken("https://gu-mo.vercel.app/api/telegram/webhook?b=hello") === null);

  check("bot id parsed from token", botIdFromToken(REAL_TOKEN) === 8635909400);
  check("allowlist accepts our bot", isAutoBotToken(REAL_TOKEN) === true);
  check("allowlist rejects a stranger bot", isAutoBotToken("555555555:AA" + "y".repeat(34)) === false);
}

console.log("\n=== r63: isBotAddressed (group trigger detection) ===");
{
  const base = { chat: { id: -1002786886789, type: "supergroup", title: "pep" }, date: 1789000000 };
  const mk = (over: Record<string, unknown>): TgMessage =>
    ({ message_id: 100, from: { id: 42, is_bot: false, first_name: "A" }, ...base, ...over } as unknown as TgMessage);

  check("explicit mention triggers", isBotAddressed(mk({ text: "@gu_mo_bot ما هو النحو؟" }), "gu_mo_bot") === true);
  check("mention via entities triggers", isBotAddressed(mk({ text: "@gu_mo_bot اشرح", entities: [{ type: "mention", offset: 0, length: 10 }] }), "gu_mo_bot") === true);
  check("plain chatter does NOT trigger", isBotAddressed(mk({ text: "ختي هذا تطبيق ؟" }), "gu_mo_bot") === false);
  check("reply to bot triggers", isBotAddressed(mk({ text: "شكرا!", reply_to_message: { message_id: 99, from: { id: 8635909400, is_bot: true, username: "gu_mo_bot" } } }), "gu_mo_bot") === true);
  check("reply to human does NOT trigger", isBotAddressed(mk({ text: "نعم", reply_to_message: { message_id: 98, from: { id: 7, is_bot: false, first_name: "B" } } }), "gu_mo_bot") === false);
  check("/ask command triggers", isBotAddressed(mk({ text: "/ask ما الفرق بين؟" }), "gu_mo_bot") === true);
  check("/ask@gu_mo_bot triggers", isBotAddressed(mk({ text: "/ask@gu_mo_bot ما الفرق؟" }), "gu_mo_bot") === true);
  check("arabic /اسأل triggers", isBotAddressed(mk({ text: "/اسأل عن التعريف" }), "gu_mo_bot") === true);
  check("mention of ANOTHER bot does NOT trigger", isBotAddressed(mk({ text: "@other_bot سلام", entities: [{ type: "mention", offset: 0, length: 10 }] }), "gu_mo_bot") === false);
}

console.log("\n=== r63: handleGroupMessage (the ENS forum brain) ===");
{
  sentMessages.length = 0;
  const msg = {
    message_id: 555,
    from: { id: 4242, is_bot: false, first_name: "ANIS" },
    chat: { id: -1002786886789, type: "supergroup", title: "pep students" },
    date: 1789000000,
    text: "@gu_mo_bot ما هو النحو عند ابن جني؟",
    message_thread_id: 77,
    is_topic_message: true,
  } as unknown as TgMessage;
  const out = await handleGroupMessage(msg, REAL_TOKEN, "gu_mo_bot");
  check("AI answer path", out === "handled-group-ai", out);
  const send = sentMessages.find((m) => m.method === "sendMessage");
  check("reply lands in the same topic", send?.body.message_thread_id === 77, send?.body);
  check("reply quotes the question", send?.body.reply_to_message_id === 555, send?.body);
  check("AI answer text sent", typeof send?.body.text === "string" && String(send?.body.text).includes("جواب اختباري"));

  // pure mention without a question (فرد مختلف حتى لا يتداخل حد الـ٣ ثوان)
  sentMessages.length = 0;
  const ping = await handleGroupMessage(
    { ...msg, message_id: 556, from: { id: 5555, is_bot: false, first_name: "X" }, text: "@gu_mo_bot" } as unknown as TgMessage,
    REAL_TOKEN,
    "gu_mo_bot"
  );
  check("bare mention → ping-back", ping === "handled-group-ping", ping);
  check("ping-back also threaded", sentMessages.find((m) => m.method === "sendMessage")?.body.message_thread_id === 77);
}

console.log("\n=== r63: forum-aware deep links ===");
{
  const src = { tgChannelId: "-1002786886789", tgUsername: "pepstudents2" };
  check("topic link format", buildDeepLink(src, 500, 77) === "https://t.me/pepstudents2/77/500", buildDeepLink(src, 500, 77));
  const priv = { tgChannelId: "-1004465655271", tgUsername: "" };
  check("private channel topic link", buildDeepLink(priv, 9, 12) === "https://t.me/c/4465655271/12/9", buildDeepLink(priv, 9, 12));
  check("no thread → classic link", buildDeepLink(src, 500) === "https://t.me/pepstudents2/500");
}

console.log("\n=== r63: sendMessageReply chunking keeps topic ===");
{
  sentMessages.length = 0;
  const long = Array.from({ length: 300 }, (_, i) => `السطر رقم ${i} — نص طويل لاختبار التقسيم داخل الموضوع نفسه`).join("\n");
  const chunks = splitForTelegram(long);
  check("long text split into multiple chunks", chunks.length >= 2, chunks.length);
  const ok = await sendMessageReply(REAL_TOKEN, -1002786886789, long, { replyToMessageId: 10, messageThreadId: 5 });
  check("chunked reply sent ok", ok === true);
  const sends = sentMessages.filter((m) => m.method === "sendMessage");
  check("every chunk stayed in the topic", sends.length === chunks.length && sends.every((s) => s.body.message_thread_id === 5), sends.length);
}

console.log("\n=== r63: AI provider import smoke ===");
{
  const mod = await import("../src/lib/ai/providers");
  check("isAiConfigured true with fake keys", mod.isAiConfigured() === true);
}

console.log(`\n=== النتيجة: ${pass} نجح / ${fail} فشل ===`);
if (fail > 0) process.exit(1);
