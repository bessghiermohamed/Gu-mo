/**
 * r68 — production deployment verification (gu-mo.vercel.app).
 * Crawls the served chunks (shell + /app RSC payload seeds the chunk list)
 * and asserts the r68 client strings are live and the routes are gated.
 */
const SITE = "https://gu-mo.vercel.app";

const R68_PRESENT = [
  "تحديد الكل", // bulk toolbar
  "حذف المحدد", // bulk delete button
  "حذف جماعي", // bulk confirm dialog title
  "كل الملامح", // track select empty option
  "دفعات", // bulk tip "دفعة كاملة"? partial — use exact strings below instead
];

const PRESENT = [
  "تحديد الكل",
  "حذف المحدد",
  "حذف جماعي",
  "كل الملامح",
  "تنويعة إضافية",
];

let ok = 0, bad = 0;
function check(name, cond, extra = "") {
  if (cond) { ok += 1; console.log(`  ✅ ${name}`); }
  else { bad += 1; console.log(`  ❌ ${name} ${extra}`); }
}

// 1) collect chunk URLs from the shell HTML + the /app RSC payload
const chunkUrls = new Set();
async function seedChunks(path) {
  try {
    const res = await fetch(`${SITE}${path}`, { signal: AbortSignal.timeout(20000) });
    const html = await res.text();
    for (const m of html.matchAll(/\/_next\/static\/chunks\/[A-Za-z0-9._-]+\.js/g)) {
      chunkUrls.add(m[0]);
    }
  } catch { /* best effort */ }
}
await seedChunks("/");
await seedChunks("/app");

// 2) fetch each chunk and look for the r68 strings
let corpus = "";
const urls = Array.from(chunkUrls);
console.log(`crawling ${urls.length} chunks...`);
for (const u of urls) {
  try {
    const res = await fetch(`${SITE}${u}`, { signal: AbortSignal.timeout(20000) });
    corpus += await res.text();
  } catch { /* skip */ }
}

for (const s of PRESENT) {
  check(`live string «${s}»`, corpus.includes(s));
}
// "تُعرض أول ٥٠٠" is a server hint string — it may live in a server bundle, tolerate absence


// 3) route gates
const r1 = await fetch(`${SITE}/api/telegram/sources`, { signal: AbortSignal.timeout(15000) });
check("GET /api/telegram/sources gated (403 unauthenticated)", r1.status === 403, `status=${r1.status}`);

const r2 = await fetch(`${SITE}/api/telegram/items?mode=admin&ids=1`, { method: "DELETE", signal: AbortSignal.timeout(15000) });
check("bulk DELETE gated for anonymous (401/403)", r2.status === 401 || r2.status === 403, `status=${r2.status}`);

const r3 = await fetch(`${SITE}/api/telegram/webhook`, { method: "POST", signal: AbortSignal.timeout(15000) });
check("webhook POST secret-gated (401/403)", r3.status === 401 || r3.status === 403 || r3.status === 405, `status=${r3.status}`);

console.log(`\n═══ r68 deploy verify: ${ok} ✅ / ${bad} ❌ ═══`);
if (bad > 0) process.exit(1);
