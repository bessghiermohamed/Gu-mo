/**
 * r62 e2e (local, production build) — bot swap + webhook + brain wiring.
 *
 * Prereq: `bun run build` then `next start -p 3117` with the local .env
 * (fake TELEGRAM_BOT_TOKEN + TELEGRAM_WEBHOOK_SECRET=local-r62-test-secret).
 * The REAL bot token arrives via env R62_REAL_TOKEN (never committed).
 *
 * Covers: webhook secret auth (env + DB), private-chat routing through the
 * brain (commands/fallback — no AI key locally), no-ingest guarantee for
 * private chats, /api/telegram/bot (auth gate, status, save-token with the
 * real token, DB-secret webhook acceptance, clear), and the classic
 * channel ingest regression (simulate).
 *
 * Run: R62_REAL_TOKEN=... bun run scripts/r62-e2e-local.ts
 */
import { Database } from "bun:sqlite";

const BASE = "http://localhost:3117";
const ENV_SECRET = "local-r62-test-secret";
const REAL_TOKEN = process.env.R62_REAL_TOKEN ?? "";

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

// ---- session (OWNER) ----
async function login(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fullName: "مالك التحقق", email: "r52-owner@test.dz" }),
  });
  if (!res.ok) throw new Error(`login failed ${res.status}`);
  const cookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";
  return cookie;
}

function tgUpdate(msg: Record<string, unknown>): string {
  return JSON.stringify({ update_id: Math.floor(Date.now() / 1000) % 1_000_000_000, ...msg });
}

async function postWebhook(body: string, secret: string) {
  return fetch(`${BASE}/api/telegram/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secret },
    body,
  });
}

const db = new Database("/home/z/my-project/db/custom.db", { readonly: true });
function itemRowCount(): number {
  return Number(db.query("SELECT COUNT(*) AS c FROM TelegramItem").get()?.c ?? 0);
}
function botConfigRow(): { tokenLen: number; secret: string; username: string } | null {
  const row = db.query("SELECT botToken, webhookSecret, botUsername FROM BotConfig WHERE id = 1").get() as
    | { botToken: string; webhookSecret: string; botUsername: string }
    | undefined;
  if (!row) return null;
  return { tokenLen: row.botToken.length, secret: row.webhookSecret, username: row.botUsername };
}

// ============================================================
console.log("1) webhook auth");
{
  const bad = await postWebhook(tgUpdate({ message: { chat: { id: 1, type: "private" } } }), "wrong-secret");
  check("wrong secret → 401", bad.status === 401, `got ${bad.status}`);

  const ok = await postWebhook(tgUpdate({ message: { chat: { id: 1, type: "private" } } }), ENV_SECRET);
  check("env secret → 200", ok.status === 200, `got ${ok.status}`);
}

console.log("2) private chat → the brain (no ingest, no AI key locally)");
{
  const before = itemRowCount();
  const start = await postWebhook(
    tgUpdate({
      message: {
        message_id: 990_001,
        from: { id: 5501, is_bot: false, first_name: "طالب" },
        chat: { id: 5501, type: "private" },
        date: Math.floor(Date.now() / 1000),
        text: "/start",
      },
    }),
    ENV_SECRET
  );
  const startBody = (await start.json()) as { ok: boolean; status: string };
  check("/start routed to the brain", startBody.status === "handled-command", JSON.stringify(startBody));

  const q = await postWebhook(
    tgUpdate({
      message: {
        message_id: 990_002,
        from: { id: 5502, is_bot: false, first_name: "طالب" },
        chat: { id: 5502, type: "private" },
        date: Math.floor(Date.now() / 1000),
        text: "سؤال دون مفتاح ذكاء",
      },
    }),
    ENV_SECRET
  );
  const qBody = (await q.json()) as { ok: boolean; status: string };
  check("text → handled-fallback (no AI key)", qBody.status === "handled-fallback", JSON.stringify(qBody));

  const after = itemRowCount();
  check("no items ingested from private chats", after === before, `before=${before} after=${after}`);
}

console.log("3) unknown channel post → ignored (unchanged behavior)");
{
  const res = await postWebhook(
    tgUpdate({
      channel_post: {
        message_id: 990_003,
        from: { id: 1, is_bot: false, first_name: "قناة" },
        chat: { id: -100999999, type: "channel", title: "قناة غير مربوطة" },
        date: Math.floor(Date.now() / 1000),
        text: "منشور",
      },
    }),
    ENV_SECRET
  );
  const body = (await res.json()) as { status: string };
  check("ignored", body.status === "ignored", JSON.stringify(body));
}

console.log("4) /api/telegram/bot — guards + status");
const cookie = await login();
{
  const noAuth = await fetch(`${BASE}/api/telegram/bot`);
  check("GET without session → 403", noAuth.status === 403, `got ${noAuth.status}`);

  const st = await fetch(`${BASE}/api/telegram/bot`, { headers: { cookie } });
  const stBody = (await st.json()) as { activeTokenSource: string; botTokenValid: boolean; botUsername: string; config: { dbTableReady: boolean; isVercel: boolean } };
  check("GET status 200", st.status === 200);
  check("source=env (fake token)", stBody.activeTokenSource === "env", JSON.stringify(stBody));
  check("fake token rejected by Telegram", stBody.botTokenValid === false);
  check("local: table ready", stBody.config.dbTableReady === true && stBody.config.isVercel === false);
}

console.log("5) save-token (REAL token) → DB wins");
{
  const garbage = await fetch(`${BASE}/api/telegram/bot`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ token: "not-a-token" }),
  });
  check("garbage token → 400", garbage.status === 400, `got ${garbage.status}`);

  if (REAL_TOKEN) {
    const save = await fetch(`${BASE}/api/telegram/bot`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ token: REAL_TOKEN }),
    });
    const saveBody = (await save.json()) as { ok: boolean; botUsername: string; webhook: { ok: boolean; message: string }; message: string };
    check("save ok", save.status === 200 && saveBody.ok === true, JSON.stringify(saveBody).slice(0, 300));
    check("bot detected: @gu_mo_bot", saveBody.botUsername === "gu_mo_bot", JSON.stringify(saveBody.botUsername));
    check("webhook activation failed gracefully (localhost)", saveBody.webhook?.ok === false, JSON.stringify(saveBody.webhook));
    check("token never echoed back", !JSON.stringify(saveBody).includes(REAL_TOKEN));

    const row = botConfigRow();
    check("row saved with the real token", !!row && row.tokenLen === REAL_TOKEN.length, JSON.stringify(row));
    check("row saved with @username", row?.username === "gu_mo_bot");
    check("row saved with a fresh secret", !!row && /^tgwh_[0-9a-f]{48}$/.test(row.secret), row?.secret.slice(0, 8));

    const st = await fetch(`${BASE}/api/telegram/bot`, { headers: { cookie } });
    const stBody = (await st.json()) as { activeTokenSource: string; botTokenValid: boolean; botUsername: string; webhook: { url: string } | null };
    check("active source now db", stBody.activeTokenSource === "db", stBody.activeTokenSource);
    check("real token valid (getMe live)", stBody.botTokenValid === true && stBody.botUsername === "gu_mo_bot");

    // الويبهوك يقبل سرّ قاعدة البيانات الجديد + سرّ البيئة معاً
    const dbStart = await postWebhook(
      tgUpdate({
        message: {
          message_id: 990_004,
          from: { id: 5503, is_bot: false, first_name: "طالب" },
          chat: { id: 5503, type: "private" },
          date: Math.floor(Date.now() / 1000),
          text: "/start",
        },
      }),
      row?.secret ?? ""
    );
    const dbStartBody = (await dbStart.json()) as { status: string };
    check("DB secret accepted by the webhook", dbStart.status === 200 && dbStartBody.status === "handled-command", JSON.stringify(dbStartBody));

    const envStill = await postWebhook(
      tgUpdate({
        message: {
          message_id: 990_005,
          from: { id: 5504, is_bot: false, first_name: "طالب" },
          chat: { id: 5504, type: "private" },
          date: Math.floor(Date.now() / 1000),
          text: "/help",
        },
      }),
      ENV_SECRET
    );
    const envStillBody = (await envStill.json()) as { status: string };
    check("env secret still accepted (old bot keeps working)", envStill.status === 200 && envStillBody.status === "handled-command");
  } else {
    console.log("  (skipped real-token section — R62_REAL_TOKEN not provided)");
  }
}

console.log("6) clear → back to env");
{
  if (botConfigRow()) {
    const clear = await fetch(`${BASE}/api/telegram/bot`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ action: "clear" }),
    });
    check("clear ok", clear.status === 200, `got ${clear.status}`);
    check("row removed", botConfigRow() === null);
    const st = await fetch(`${BASE}/api/telegram/bot`, { headers: { cookie } });
    const stBody = (await st.json()) as { activeTokenSource: string };
    check("active source back to env", stBody.activeTokenSource === "env", stBody.activeTokenSource);
  } else {
    console.log("  (skipped — no row to clear)");
  }
}

console.log("7) classic ingest regression — simulate (heuristic classify locally)");
{
  // مصدر محلي مباشرة في SQLite (البوت المزيّف لا يستطيع resolveChat)
  const rw = new Database("/home/z/my-project/db/custom.db");
  const existing = rw.query("SELECT id FROM TelegramSource WHERE tgChannelId = '-100888777'").get();
  if (!existing) {
    rw.run(
      `INSERT INTO TelegramSource (tgChannelId, tgUsername, titleAr, sourceType, kind, specialtyId, isActive, lastUpdateId, createdAt, updatedAt)
       VALUES ('-100888777', 'testchannel', 'قناة اختبار r62', 'channel', 'public', 1, 1, 0, datetime('now'), datetime('now'))`
    );
  }
  const src = rw.query("SELECT id FROM TelegramSource WHERE tgChannelId = '-100888777'").get() as { id: number };
  rw.close();

  const sim = await fetch(`${BASE}/api/telegram/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ action: "simulate", sourceId: src.id, text: "امتحان محلول في التحليل الرياضي — السنة الأولى" }),
  });
  const simBody = (await sim.json()) as { ok: boolean; status: string; item?: { title: string; itemType: string }; cleaned: boolean; message: string };
  check("simulate ok", sim.status === 200 && simBody.ok === true, JSON.stringify(simBody).slice(0, 300));
  check("item classified (heuristic locally)", simBody.item?.itemType === "امتحان", JSON.stringify(simBody.item));
  check("test item cleaned up", simBody.cleaned === true);
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
