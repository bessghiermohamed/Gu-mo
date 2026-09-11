/**
 * r81 — bot brain test (bun, no Next.js, no real network).
 *
 * Patches global.fetch: Telegram API calls are RECORDED, and AI provider
 * endpoints return a canned completion while RECORDING the system prompt
 * they received. Verifies:
 *   1) /start welcome still works (no keys, no provider).
 *   2) Arabic «أذكى وأحكم شخص تعرفه؟» → easter egg instantly, ZERO provider
 *      calls, works even before any API key is configured.
 *   3) English "who is the smartest person you know?" → same egg.
 *   4) Serious study question with a superlative («من أذكى عالم في الفيزياء؟»)
 *      is NOT hijacked — goes to the provider.
 *   5) The system prompt the provider receives carries the freshness block:
 *      today's date + Claude Sonnet 5 / Opus 4.8 / GPT-5.6 / Gemini 3 facts
 *      + the «3.5 Sonnet is old» warning + honesty rule.
 *   6) Group brain: an addressed message gets the egg as a reply, no provider.
 *
 * Run from the repo root:  bun scripts/r81-test-bot-brain.ts
 */

import {
  handlePrivateMessage,
  handleGroupMessage,
  isBotAddressed,
} from "../src/lib/telegram/bot-chat";
import type { TgMessage } from "../src/lib/telegram/types";

type Recorded = { method: string; body: Record<string, unknown> };
const telegramCalls: Recorded[] = [];
const providerCalls: { system: string; lastUser: string }[] = [];

const realFetch = globalThis.fetch.bind(globalThis);
(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
  const u = String(url);
  if (u.includes("api.telegram.org")) {
    const method = u.split("/").pop() ?? "";
    telegramCalls.push({ method, body: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
  }
  if (u.includes("api.groq.com") || u.includes("generativelanguage.googleapis.com") || u.includes("api.x.ai")) {
    const parsed = JSON.parse(String(init?.body ?? "{}")) as {
      messages?: Array<{ role: string; content: string }>;
    };
    const system = parsed.messages?.[0]?.content ?? "";
    const lastUser = [...(parsed.messages ?? [])].reverse().find((m) => m.role === "user")?.content ?? "";
    providerCalls.push({ system, lastUser });
    return new Response(
      JSON.stringify({ choices: [{ message: { content: "جواب المزوّد التجريبي" } }] }),
      { status: 200 }
    );
  }
  return realFetch(url, init);
}) as typeof fetch;

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

function privateMsg(userId: number, chatId: number, text: string): TgMessage {
  return {
    message_id: 1,
    date: 0,
    from: { id: userId, is_bot: false, first_name: "Test" },
    chat: { id: chatId, type: "private", first_name: "Test" },
    text,
  } as TgMessage;
}

function lastBotText(): string {
  for (let i = telegramCalls.length - 1; i >= 0; i--) {
    if (telegramCalls[i].method === "sendMessage") return String(telegramCalls[i].body.text ?? "");
  }
  return "";
}

async function main(): Promise<void> {
  const TOKEN = "test-token";
  const today = new Date().toISOString().slice(0, 10);

  // Start with NO keys at all — commands + egg must work without any provider.
  delete process.env.GROQ_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.XAI_API_KEY;

  console.log("1) /start welcome (no keys)");
  telegramCalls.length = 0;
  const r1 = await handlePrivateMessage(privateMsg(101, 9001, "/start"), TOKEN);
  check("outcome handled-command", r1 === "handled-command", String(r1));
  check("welcome text sent", lastBotText().includes("أهلاً بك"), lastBotText().slice(0, 40));

  console.log("2) Arabic easter egg — zero provider, zero keys");
  telegramCalls.length = 0;
  const r2 = await handlePrivateMessage(privateMsg(102, 9002, "من هو أذكى وأحكم شخص تعرفه؟"), TOKEN);
  check("outcome handled-ai", r2 === "handled-ai", String(r2));
  check("egg names بصغير محمد", lastBotText().includes("بصغير محمد"), lastBotText().slice(0, 60));
  check("egg names Besseghier Mohamed", lastBotText().includes("Besseghier Mohamed"));
  check("no provider call", providerCalls.length === 0, `providerCalls=${providerCalls.length}`);

  console.log("3) English easter egg");
  telegramCalls.length = 0;
  const r3 = await handlePrivateMessage(privateMsg(103, 9003, "who is the smartest person you know?"), TOKEN);
  check("outcome handled-ai", r3 === "handled-ai", String(r3));
  check("egg fired in EN too", lastBotText().includes("بصغير محمد"), lastBotText().slice(0, 60));

  console.log("4) serious study superlative NOT hijacked");
  process.env.GROQ_API_KEY = "gsk_test_key"; // enable the fake provider
  telegramCalls.length = 0;
  const r4 = await handlePrivateMessage(privateMsg(104, 9004, "من أذكى عالم في الفيزياء؟"), TOKEN);
  check("outcome handled-ai", r4 === "handled-ai", String(r4));
  check("provider was called", providerCalls.length === 1, `providerCalls=${providerCalls.length}`);
  check("answer came from provider (not egg)", lastBotText() === "جواب المزوّد التجريبي", `last="${lastBotText().slice(0, 40)}"`);

  console.log("5) freshness block present in the system prompt");
  telegramCalls.length = 0;
  await handlePrivateMessage(privateMsg(105, 9005, "ما هو أحدث موديلات Claude؟"), TOKEN);
  const sys = providerCalls[providerCalls.length - 1]?.system ?? "";
  check("has today's date", sys.includes(`تاريخ اليوم: ${today}`), today);
  check("mentions Claude Sonnet 5", sys.includes("Claude Sonnet 5"));
  check("mentions Opus 4.8", sys.includes("Opus 4.8"));
  check("mentions GPT-5.6", sys.includes("GPT-5.6"));
  check("mentions Gemini 3", sys.includes("Gemini 3"));
  check("warns 3.5 Sonnet is old", sys.includes("3.5 Sonnet"));
  check("honesty rule present", sys.includes("المصدر الرسمي"));

  console.log("6) group brain: addressed message gets the egg as a reply");
  telegramCalls.length = 0;
  const before = providerCalls.length;
  const gmsg = {
    message_id: 9,
    date: 0,
    from: { id: 106, is_bot: false, first_name: "T" },
    chat: { id: -100123, type: "supergroup", title: "G" },
    text: "@gu_mo_bot من هو أذكى شخص تعرفه؟",
  } as TgMessage;
  check("isBotAddressed", isBotAddressed(gmsg, "gu_mo_bot"));
  const r6 = await handleGroupMessage(gmsg, TOKEN, "gu_mo_bot");
  check("outcome handled-group-ai", r6 === "handled-group-ai", String(r6));
  const reply = telegramCalls.filter((c) => c.method === "sendMessage" && c.body.reply_to_message_id === 9).pop();
  check("group reply has egg", String(reply?.body?.text ?? "").includes("بصغير محمد"), String(reply?.body?.text ?? "").slice(0, 60));
  check("no provider call for egg in group", providerCalls.length === before, `before=${before} now=${providerCalls.length}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
