/**
 * r63 e2e (local, production build) — self-activation + ENS-forum routing.
 *
 * Prereq: `bun run build` then start the built app on :3117 with local .env
 * (fake TELEGRAM_BOT_TOKEN + TELEGRAM_WEBHOOK_SECRET=local-r62-test-secret).
 * The REAL token is used via the ?b= webhook URL / activation POST body.
 *
 * Order matters: the ?b= webhook calls persist the real token into the local
 * BotConfig row (best-effort) — classic-path tests run BEFORE that so the
 * env credentials are exercised first, then DB-secret acceptance after.
 *
 * SAFETY: no message is ever sent to a real chat — every brain-triggering
 * update uses a chat id that cannot exist (Telegram rejects the send and the
 * brain degrades silently, as designed). Ingest itself never calls Telegram.
 *
 * Run: bun run scripts/r63-e2e-local.ts   (server: PORT=3117 next start)
 */
import { Database } from "bun:sqlite";

const BASE = "http://localhost:3117";
const ENV_SECRET = "local-r62-test-secret";
const FAKE_ENV_TOKEN = "123456789:AAfake_local_test_token_never_use_in_prod_000";
const REAL_TOKEN = process.env.R63_REAL_TOKEN ?? ""; if (!REAL_TOKEN) { console.error("R63_REAL_TOKEN مطلوب (توكن البوت الحقيقي — لا يُكتب في الملفات أبداً)"); process.exit(1); }
const ENS_CHAT = -1002786886789; // 𝗽𝗲𝗽 𝘀𝘁𝘂𝗱𝗲𝗻𝘁𝘀 (forum, real id — read-only usage)
const ALK_CHAT = -1004465655271; // Alk channel (real id — read-only usage)

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

// derived secret — mirror of lib/telegram/auto-bot (kept in sync by test)
const derived = (token: string): string => {
  const { createHash } = require("node:crypto");
  return "tgk_" + createHash("sha256").update(token, "utf8").digest("hex").slice(0, 40);
};

let updateSeq = Math.floor(Date.now() / 1000) % 1_000_000_000;
function tgUpdate(msg: Record<string, unknown>): string {
  updateSeq += 1;
  return JSON.stringify({ update_id: updateSeq, ...msg });
}

async function postWebhook(b: string, secret: string, urlToken?: string) {
  const url = urlToken ? `${BASE}/api/telegram/webhook?b=${encodeURIComponent(urlToken)}` : `${BASE}/api/telegram/webhook`;
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secret },
    body: b,
  });
}

const db = new Database("/home/z/my-project/db/custom.db");
function countItems(): number {
  return Number(db.query("SELECT COUNT(*) AS c FROM TelegramItem").get()?.c ?? 0);
}
function itemByMsg(msgId: number): Record<string, unknown> | null {
  return (db.query("SELECT * FROM TelegramItem WHERE tgMessageId = ?").get(msgId) as Record<string, unknown>) ?? null;
}
function botConfigRow(): { token: string; secret: string; username: string } | null {
  const row = db.query("SELECT botToken, webhookSecret, botUsername FROM BotConfig WHERE id = 1").get() as
    | { botToken: string; webhookSecret: string; botUsername: string }
    | undefined;
  if (!row) return null;
  return { token: row.botToken, secret: row.webhookSecret, username: row.botUsername };
}
function sourceByChat(chatId: string): Record<string, unknown> | null {
  return (db.query("SELECT * FROM TelegramSource WHERE tgChannelId = ?").get(chatId) as Record<string, unknown>) ?? null;
}

// ---------------------------------------------------------------------------
// Prepare: Alk channel source exists (classic ingest target), ENS does NOT
// (the activation route will create it later in the test)
// ---------------------------------------------------------------------------
db.run("DELETE FROM TelegramSource WHERE tgChannelId = ?", [String(ALK_CHAT)]);
db.run("DELETE FROM TelegramSource WHERE tgChannelId = ?", [String(ENS_CHAT)]);
db.run("DELETE FROM TelegramItem");
db.run(
  `INSERT INTO TelegramSource (tgChannelId, tgUsername, titleAr, sourceType, kind, specialtyId, isActive, lastUpdateId, createdAt, updatedAt)
   VALUES (?, 'alkgro', 'Alk', 'channel', 'public', 1, 1, 0, datetime('now'), datetime('now'))`,
  [String(ALK_CHAT)]
);

const status = async (res: Response): Promise<{ code: number; body: Record<string, unknown> }> => {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { code: res.status, body };
};

console.log("\n=== A. classic path (env secret + fake env token) ===");
{
  const res = await status(
    await postWebhook(
      tgUpdate({
        channel_post: {
          message_id: 9001,
          from: { id: 1, is_bot: false, first_name: "مالك" },
          chat: { id: ALK_CHAT, type: "channel", title: "Alk" },
          date: Math.floor(Date.now() / 1000),
          text: "درس كيمياء العضوية — الجزء الأول",
        },
      }),
      ENV_SECRET
    )
  );
  check("channel post via env secret → 200/inserted", res.code === 200 && res.body.status === "inserted", JSON.stringify(res));
  const row = itemByMsg(9001);
  check("item stored with classic deep link", !!row && String(row.link) === "https://t.me/alkgro/9001", String(row?.link ?? ""));

  const bad = await status(
    await postWebhook(tgUpdate({ channel_post: { message_id: 9002, chat: { id: ALK_CHAT, type: "channel" }, date: 1, text: "x" } }), "wrong-secret")
  );
  check("wrong secret → 401", bad.code === 401, JSON.stringify(bad));
}

console.log("\n=== B. self-activation path (?b= with derived secret) ===");
{
  // B1: allowlisted bot + derived secret + private /start (chat id cannot exist)
  const before = countItems();
  const res = await status(
    await postWebhook(
      tgUpdate({
        message: {
          message_id: 1,
          from: { id: 99999999999999, is_bot: false, first_name: "Ghost" },
          chat: { id: 99999999999999, type: "private" },
          date: Math.floor(Date.now() / 1000),
          text: "/start",
        },
      }),
      derived(REAL_TOKEN),
      REAL_TOKEN
    )
  );
  check("?b= + derived secret → 200 (brain route)", res.code === 200 && res.body.status === "handled-command", JSON.stringify(res));
  check("private chat never ingested", countItems() === before);
  const cfg = botConfigRow();
  check("best-effort BotConfig save happened (local Prisma)", !!cfg && cfg.token === REAL_TOKEN && cfg.secret === derived(REAL_TOKEN) && cfg.username === "gu_mo_bot", JSON.stringify(cfg ?? null));

  // B2: wrong secret on ?b= → 401
  const bad = await status(
    await postWebhook(tgUpdate({ message: { message_id: 2, chat: { id: 99999999999999, type: "private" }, date: 1, text: "hi" } }), "nope", REAL_TOKEN)
  );
  check("?b= + wrong secret → 401", bad.code === 401, JSON.stringify(bad));

  // B3: stranger bot (valid format, not allowlisted) → silent ignore
  const stranger = "555555555:AA" + "z".repeat(34);
  const ig = await status(
    await postWebhook(
      tgUpdate({ message: { message_id: 3, chat: { id: 99999999999999, type: "private" }, date: 1, text: "/start" } }),
      derived(stranger),
      stranger
    )
  );
  check("stranger bot token → 200 ignored (allowlist)", ig.code === 200 && ig.body.status === "ignored", JSON.stringify(ig));

  // B4: classic path still accepts ENV secret after the DB save (old bot never breaks)
  const still = await status(
    await postWebhook(
      tgUpdate({
        channel_post: { message_id: 9003, from: { id: 1, is_bot: false }, chat: { id: ALK_CHAT, type: "channel" }, date: Math.floor(Date.now() / 1000), text: "درس نحو — الأفعال" },
      }),
      ENV_SECRET
    )
  );
  check("env secret still accepted (dual-secret)", still.code === 200 && still.body.status === "inserted", JSON.stringify(still));

  // B5: classic path now ALSO accepts the DB secret (= derived from real token)
  const dual = await status(
    await postWebhook(
      tgUpdate({
        channel_post: { message_id: 9004, from: { id: 1, is_bot: false }, chat: { id: ALK_CHAT, type: "channel" }, date: Math.floor(Date.now() / 1000), text: "تمارين النحو رقم 2" },
      }),
      derived(REAL_TOKEN)
    )
  );
  check("DB (derived) secret accepted on classic URL", dual.code === 200 && dual.body.status === "inserted", JSON.stringify(dual));
}

console.log("\n=== C. activation route (registers ENS forum + refreshes Alk) ===");
{
  const act = await status(
    await fetch(`${BASE}/api/telegram/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: REAL_TOKEN,
        specialtyId: 1,
        chats: [
          { chatId: ENS_CHAT, sourceType: "group", titleAr: "ENS — طلبة PEP" },
          { chatId: ALK_CHAT, sourceType: "channel", titleAr: "Alk" },
          { chatId: -100999999999, sourceType: "channel" },
        ],
      }),
    })
  );
  check("activation → bot is @gu_mo_bot", act.body?.bot?.username === "gu_mo_bot", JSON.stringify(act));
  const sources = (act.body.sources ?? []) as Array<Record<string, unknown>>;
  const ens = sources.find((s) => String(s.chatId) === String(ENS_CHAT));
  const alk = sources.find((s) => String(s.chatId) === String(ALK_CHAT));
  const ghost = sources.find((s) => String(s.chatId) === "-100999999999");
  check("ENS forum registered (created)", !!ens && ens.registered === true && ens.created === true && ens.sourceType === "group", JSON.stringify(ens));
  check("Alk channel refreshed (not duplicated)", !!alk && alk.registered === true && alk.created === false, JSON.stringify(alk));
  check("nonexistent chat refused with error", !!ghost && ghost.registered === false && !!ghost.error, JSON.stringify(ghost));
  check("webhook set fails gracefully on localhost", act.body.webhook?.ok === false, JSON.stringify(act.body.webhook));
  check("token never echoed in response", !JSON.stringify(act.body).includes(REAL_TOKEN));

  const ensRow = sourceByChat(String(ENS_CHAT));
  check("ENS source row in DB with username", !!ensRow && String(ensRow.tgUsername) === "pepstudents2" && String(ensRow.titleAr) === "ENS — طلبة PEP", JSON.stringify(ensRow ?? null));

  const get = await status(await fetch(`${BASE}/api/telegram/activate`));
  check("GET → hint only", get.code === 200 && typeof get.body.hint === "string");

  const forbidden = await status(
    await fetch(`${BASE}/api/telegram/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "555555555:AA" + "z".repeat(34) }),
    })
  );
  check("stranger bot activation → 403", forbidden.code === 403, JSON.stringify(forbidden));
}

console.log("\n=== D. ENS forum routing (registered as a group source) ===");
{
  // D1: General-topic chatter → NOT ingested
  const before = countItems();
  const chat = await status(
    await postWebhook(
      tgUpdate({
        message: {
          message_id: 141800,
          from: { id: 6029005636, is_bot: false, first_name: "ANIS" },
          chat: { id: ENS_CHAT, type: "supergroup", title: "pep" },
          date: Math.floor(Date.now() / 1000),
          text: "ختي هذا تطبيق ؟",
        },
      }),
      derived(REAL_TOKEN),
      REAL_TOKEN
    )
  );
  check("General chatter → 200 ignored", chat.code === 200 && chat.body.status === "ignored", JSON.stringify(chat));
  check("no item from chatter", countItems() === before);

  // D2: topic message → INGESTED with topic deep link
  const topic = await status(
    await postWebhook(
      tgUpdate({
        message: {
          message_id: 141801,
          from: { id: 6029005636, is_bot: false, first_name: "ANIS" },
          chat: { id: ENS_CHAT, type: "supergroup", title: "pep" },
          date: Math.floor(Date.now() / 1000),
          text: "درس النحو — الأسماء الخمسة",
          message_thread_id: 77,
          is_topic_message: true,
        },
      }),
      derived(REAL_TOKEN),
      REAL_TOKEN
    )
  );
  check("topic message → 200 inserted", topic.code === 200 && topic.body.status === "inserted", JSON.stringify(topic));
  const tRow = itemByMsg(141801);
  check("topic deep link format t.me/<user>/<thread>/<msg>", !!tRow && String(tRow.link) === "https://t.me/pepstudents2/77/141801", String(tRow?.link ?? ""));

  // D3: media in General → ingested (content rule)
  const media = await status(
    await postWebhook(
      tgUpdate({
        message: {
          message_id: 141802,
          from: { id: 42, is_bot: false, first_name: "A" },
          chat: { id: ENS_CHAT, type: "supergroup", title: "pep" },
          date: Math.floor(Date.now() / 1000),
          caption: "ملخص المحاضرة الثالثة",
          document: { file_id: "BQfake_file_id_001", file_unique_id: "u1", file_name: "ملخص-الدرس-3.pdf", mime_type: "application/pdf", file_size: 102400 },
        },
      }),
      derived(REAL_TOKEN),
      REAL_TOKEN
    )
  );
  check("media in General → ingested", media.code === 200 && media.body.status === "inserted", JSON.stringify(media));

  // D4: mention in an UNKNOWN group → brain attempt, silent degradation, no ingest
  const beforeD4 = countItems();
  const mention = await status(
    await postWebhook(
      tgUpdate({
        message: {
          message_id: 7,
          from: { id: 42424242, is_bot: false, first_name: "Q" },
          chat: { id: -100999999999, type: "supergroup", title: "Ghost Group" },
          date: Math.floor(Date.now() / 1000),
          text: "@gu_mo_bot ما هو النحو؟",
          message_thread_id: 3,
          is_topic_message: true,
        },
      }),
      derived(REAL_TOKEN),
      REAL_TOKEN
    )
  );
  check("mention in unknown group → 200 (brain degraded, no crash)", mention.code === 200, JSON.stringify(mention));
  check("no item from unknown group", countItems() === beforeD4);

  // D5: bot's own message (from.is_bot) → never processed (loop protection)
  const botmsg = await status(
    await postWebhook(
      tgUpdate({
        message: {
          message_id: 141803,
          from: { id: 8635909400, is_bot: true, first_name: "Talib_app", username: "gu_mo_bot" },
          chat: { id: ENS_CHAT, type: "supergroup", title: "pep" },
          date: Math.floor(Date.now() / 1000),
          text: "جواب البوت الاختباري",
          message_thread_id: 77,
          is_topic_message: true,
        },
      }),
      derived(REAL_TOKEN),
      REAL_TOKEN
    )
  );
  check("bot's own messages ignored (loop guard)", botmsg.code === 200 && botmsg.body.status === "ignored", JSON.stringify(botmsg));
}

console.log(`\n=== النتيجة: ${passed} نجح / ${failed} فشل ===`);
db.close();
if (failed > 0) process.exit(1);
