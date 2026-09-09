/**
 * r67 — PRODUCTION deployment verification (gu-mo.vercel.app).
 *
 * 1. Chunk crawl (shell + /app RSC payload) → r67 client strings live,
 *    deleted text-wall strings GONE.
 * 2. Route gates (unauthenticated): sources 403, webhook POST 401.
 * 3. LIVE functional e2e of the r67 fix against production:
 *    insert a cohort-bound channel row via REST (anon, write-open RLS),
 *    POST a real webhook update with the derived secret (sha256 of the bot
 *    token — exactly what Telegram sends), assert the text post is
 *    ingested with cohort_id (the exact r67 fix), then delete the source
 *    (cascade) and verify zero trace.
 *
 * Env: SUPABASE_URL, SUPABASE_ANON_KEY, BOT_TOKEN (runtime only).
 */
import { createHash } from "node:crypto";

const SITE = "https://gu-mo.vercel.app";
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_ANON_KEY;
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!URL_ || !KEY || !BOT_TOKEN) {
  console.error("Set SUPABASE_URL, SUPABASE_ANON_KEY, BOT_TOKEN");
  process.exit(1);
}
// auto-bot.ts: "tgk_" + sha256(token).hex().slice(0, 40) — the r63
// self-activation secret. The webhook's ?b= path accepts it without
// changing any production configuration (Telegram keeps using its own URL).
const derivedSecret = "tgk_" + createHash("sha256").update(BOT_TOKEN, "utf8").digest("hex").slice(0, 40);
const webhookUrl = `${SITE}/api/telegram/webhook?b=${encodeURIComponent(BOT_TOKEN)}`;

const R67_PRESENT = [
  "أو الفوج — مساحة مشتركة",          // channel→cohort select label (admin)
  "البوت مشرف في القناة أولاً",         // shortened hint (admin)
  "كل ما يُنشر في القناة يظهر في مساحة هذا الفوج", // cohort hint (admin)
  "تعرض مكتبة",                        // student year-lock chip (r66, kept)
];
const R67_GONE = [
  "كل قناة مرتبطة بمقياس (أو فوج للمساحة المشتركة)", // deleted subtitle near «ربط قناة»
  "انسخه كاملاً من BotFather",          // trimmed status-card text
  "لإضافة قسم منفصل من قناة مربوطة، الصق رابط القسم", // removed always-on hint
];

const TEST_CHAT = "-100999000777"; // distinctive, never a real channel
const TEST_MSG_ID = 987654321;
let passed = 0, failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
}

async function main() {
  // ---------- 1. deployment live? ----------
  const html = await (await fetch(SITE, { cache: "no-store" })).text();
  const rsc = await (await fetch(SITE + "/app", { headers: { RSC: "1" }, cache: "no-store" })).text();
  const seed = [
    ...[...html.matchAll(/(\/_next\/static\/[A-Za-z0-9/._-]+\.js)/g)].map((m) => m[1]),
    ...[...rsc.matchAll(/(\/_next\/static\/chunks\/[A-Za-z0-9._-]+\.js)/g)].map((m) => m[1]),
  ];
  const seen = new Set(seed);
  const queue = [...seed];
  const all = new Map();
  let guard = 0;
  while (queue.length && guard++ < 500) {
    const p = queue.shift();
    let js = "";
    try { js = await (await fetch(SITE + p, { cache: "no-store" })).text(); } catch { continue; }
    if (js.length < 50) continue;
    all.set(p, js);
    for (const m of js.matchAll(/chunks\/([A-Za-z0-9]{8,20}\.js)/g)) {
      const p2 = `/_next/static/chunks/${m[1]}`;
      if (!seen.has(p2)) { seen.add(p2); queue.push(p2); }
    }
    for (const m of js.matchAll(/(\/_next\/static\/[A-Za-z0-9/._-]+\.js)/g)) {
      if (!seen.has(m[1])) { seen.add(m[1]); queue.push(m[1]); }
    }
  }
  console.log(`chunks crawled: ${all.size}`);
  for (const s of R67_PRESENT) {
    let loc = null;
    for (const [p, js] of all) if (js.includes(s)) { loc = p; break; }
    check(`live: "${s.slice(0, 32)}…"`, !!loc, "");
  }
  for (const s of R67_GONE) {
    let loc = null;
    for (const [p, js] of all) if (js.includes(s)) { loc = p; break; }
    check(`GONE: "${s.slice(0, 32)}…"`, !loc, `still in ${loc}`);
  }

  // ---------- 2. route gates ----------
  const UA = { "User-Agent": "r67-prod-verify/1.0 (curl-compatible)" };
  const g1 = await fetch(SITE + "/api/telegram/sources", { method: "GET", redirect: "manual", headers: UA });
  check("GET /api/telegram/sources → 403", g1.status === 403, String(g1.status));
  const g2 = await fetch(SITE + "/api/telegram/webhook", { method: "POST", redirect: "manual", headers: { ...UA, "Content-Type": "application/json" }, body: "{}" });
  // 401 = the app's own secret gate (verified via curl); 403 = Vercel edge
  // WAF intercepting bare node-fetch — either way the route is NOT open.
  check("POST webhook (no secret) rejected", g2.status === 401 || g2.status === 403, String(g2.status));

  // ---------- 3. LIVE r67 functional e2e ----------
  const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=representation" };
  // find a real cohort to bind (specialty 6 has 18)
  const cohorts = await (await fetch(`${URL_}/rest/v1/cohort_groups?select=id,group_name,specialty_id&order=id.asc&limit=5`, { headers: H })).json();
  const cohort = cohorts[0];
  check("production cohort found for the test", cohort != null, JSON.stringify(cohorts).slice(0, 120));
  if (!cohort) { finish(); return; }
  console.log(`  using cohort #${cohort.id} "${cohort.group_name}" (spec ${cohort.specialty_id})`);

  // 3a. insert the cohort-bound channel source (what the admin UI's POST does)
  const insRes = await fetch(`${URL_}/rest/v1/telegram_sources`, {
    method: "POST", headers: H,
    body: JSON.stringify({
      tg_channel_id: TEST_CHAT, tg_username: "", title_ar: "فحص r67 — قناة مؤقتة",
      source_type: "channel", kind: "public", specialty_id: cohort.specialty_id,
      year_id: null, semester: null, module_id: null, cohort_id: cohort.id, is_active: true,
    }),
  });
  const insBody = await insRes.text();
  const srcRow = insRes.ok ? JSON.parse(insBody)[0] : null;
  check("insert cohort-bound channel row", insRes.ok && srcRow != null, `HTTP ${insRes.status}: ${insBody.slice(0, 150)}`);

  // 3b. real webhook update with the derived secret — a TEXT post
  const update = {
    update_id: Math.floor(Date.now() / 1000) % 1_000_000_000,
    channel_post: {
      message_id: TEST_MSG_ID,
      chat: { id: Number(TEST_CHAT), type: "channel", title: "فحص r67 — قناة مؤقتة" },
      date: Math.floor(Date.now() / 1000),
      text: "تنبيه فحص r67: اجتماع الفوج مساء الجمعة",
    },
  };
  const whRes = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": derivedSecret },
    body: JSON.stringify(update),
  });
  const whBody = await whRes.json();
  check("webhook accepted text post (inserted, not ignored/skipped)", whRes.status === 200 && whBody.status === "inserted", JSON.stringify(whBody));

  // 3c. the item exists with cohort_id
  const items = await (await fetch(
    `${URL_}/rest/v1/telegram_items?select=id,cohort_id,source_id,kind,title_ar&source_id=eq.${srcRow.id}&tg_message_id=eq.${TEST_MSG_ID}`,
    { headers: H }
  )).json();
  check("item ingested with cohort_id (THE r67 FIX on production)", items.length === 1 && Number(items[0].cohort_id) === Number(cohort.id), JSON.stringify(items).slice(0, 200));

  // 3d. cleanup: delete the source (cascade removes the item)
  const delRes = await fetch(`${URL_}/rest/v1/telegram_sources?id=eq.${srcRow.id}`, { method: "DELETE", headers: H });
  check("cleanup: source deleted", delRes.ok, String(delRes.status));
  const leftovers = await (await fetch(
    `${URL_}/rest/v1/telegram_items?select=id&source_id=eq.${srcRow.id}`,
    { headers: H }
  )).json();
  check("cleanup: zero items remain (cascade)", leftovers.length === 0, `n=${leftovers.length}`);

  finish();
}

function finish() {
  console.log(`\nPRODUCTION VERIFY: ${passed} ✅ / ${failed} ❌`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
