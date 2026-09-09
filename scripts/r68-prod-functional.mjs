/**
 * r68 — LIVE functional proof on production (gu-mo.vercel.app):
 * 1. Insert a base channel row + a "#2" variant row via REST (anon, write-open RLS).
 * 2. POST a REAL webhook update through the r63 self-activation path
 *    (?b=<token> + tgk_ derived secret — the exact processTelegramUpdate code
 *    Telegram hits, no config change).
 * 3. Assert the message was ingested TWICE — one copy per binding (r68 core).
 * 4. Cleanup: delete both sources → cascade leaves zero items.
 *
 * Env: SUPABASE_URL, SUPABASE_ANON_KEY, BOT_TOKEN (runtime only — public repo).
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
const derivedSecret = "tgk_" + createHash("sha256").update(BOT_TOKEN, "utf8").digest("hex").slice(0, 40);
const webhookUrl = `${SITE}/api/telegram/webhook?b=${encodeURIComponent(BOT_TOKEN)}`;

const CHAT = -1009876543210; // فريد لهذا الفحص — لا يتصادم مع شيء حقيقي
const MSG = Math.floor(Date.now() / 1000) % 100_000_000; // معرّف رسالة فريد

let ok = 0, bad = 0;
function check(name, cond, extra = "") {
  if (cond) { ok += 1; console.log(`  ✅ ${name}`); }
  else { bad += 1; console.log(`  ❌ ${name} ${extra}`); }
}

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=representation" };

async function insertSource(tgChannelId, title, extra) {
  const body = {
    tg_channel_id: tgChannelId, tg_username: "", title_ar: title,
    source_type: "channel", kind: "private", specialty_id: 6, is_active: true,
    ...extra,
  };
  const res = await fetch(`${URL_}/rest/v1/telegram_sources`, { method: "POST", headers: H, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const data = await res.json().catch(() => null);
  return { status: res.status, data: Array.isArray(data) ? data[0] : data };
}
async function deleteSource(id) {
  const res = await fetch(`${URL_}/rest/v1/telegram_sources?id=eq.${id}`, { method: "DELETE", headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(20000) });
  return res.status;
}

// 0) نظافة مسبقة لأي بقايا من فحص سابق
async function preClean() {
  const pattern = encodeURIComponent(`${CHAT}%`);
  const res = await fetch(`${URL_}/rest/v1/telegram_sources?select=id&tg_channel_id=like.${pattern}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(20000) });
  const rows = await res.json().catch(() => []);
  for (const r of Array.isArray(rows) ? rows : []) await deleteSource(r.id);
}

console.log("═══ r68 functional verify on production ═══");
await preClean();

// 1) الصف الأساسي + تنويعة #2 — فوج حقيقي (٣٥) كي تتجاوز بوابة المحتوى،
//    والتنويعة تختلف عنه بقاعدة الممح (track 13 = PEP للتخصص ٦ — حقيقي)
const s1 = await insertSource(String(CHAT), "فحص r68 — أساسي", { cohort_id: 35 });
check("1. الصف الأساسي أُنشئ", s1.status === 201 || s1.status === 200, `status=${s1.status}`);
const s2 = await insertSource(`${CHAT}#2`, "فحص r68 — تنويعة", { cohort_id: 35, track_id: 13 });
check("2. تنويعة #2 أُنشئت", s2.status === 201 || s2.status === 200, `status=${s2.status}`);
const id1 = s1.data?.id, id2 = s2.data?.id;
if (!id1 || !id2) { console.log("no ids — abort"); process.exit(1); }

// 2) منشور حقيقي عبر الويبهوك (نفس مسار تيليجرام تماماً) — مصدران بفوج
//    (cohort_id=35) فتتجاوز بوابة المحتوى (النص غير الدراسي)
const update = {
  update_id: Math.floor(Date.now() / 1000),
  channel_post: {
    message_id: MSG,
    chat: { id: CHAT, type: "channel", title: "فحص r68" },
    date: Math.floor(Date.now() / 1000),
    text: "فحص الربط المتعدد — رسالة مؤقتة تُحذف فوراً",
  },
};
const wh = await fetch(webhookUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": derivedSecret },
  body: JSON.stringify(update),
  signal: AbortSignal.timeout(30000),
});
const whData = await wh.json().catch(() => ({}));
check("3. الويبهوك قبل الاستيراد", wh.status === 200 && whData.status === "inserted", `status=${wh.status} ${JSON.stringify(whData).slice(0, 120)}`);

// 3) نسخة لكل ربط — جوهر r68
const itemsRes = await fetch(`${URL_}/rest/v1/telegram_items?select=id,source_id,cohort_id,tg_message_id&tg_message_id=eq.${MSG}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(20000) });
const items = (await itemsRes.json().catch(() => [])) ?? [];
check("4. نسختان للربطين (نسخة لكل ربط)", Array.isArray(items) && items.length === 2, `n=${Array.isArray(items) ? items.length : "?"} ${JSON.stringify(items).slice(0, 160)}`);
const srcSet = new Set(items.map((i) => Number(i.source_id)));
check("5. كل نسخة من مصدر ربطها", srcSet.has(id1) && srcSet.has(id2), JSON.stringify([...srcSet]));

// 4) تنظيف ذاتي
await deleteSource(id1);
await deleteSource(id2);
const left = await fetch(`${URL_}/rest/v1/telegram_items?select=id&tg_message_id=eq.${MSG}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(20000) });
const leftRows = (await left.json().catch(() => [])) ?? [];
check("6. التنظيف الذاتي (صفر بقايا)", Array.isArray(leftRows) && leftRows.length === 0, `n=${Array.isArray(leftRows) ? leftRows.length : "?"}`);

console.log(`\n═══ النتيجة: ${ok} ✅ / ${bad} ❌ ═══`);
if (bad > 0) process.exit(1);
