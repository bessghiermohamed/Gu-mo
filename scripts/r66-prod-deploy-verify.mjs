/**
 * r66 — PRODUCTION deployment verification (gu-mo.vercel.app).
 * Seeds the chunk crawl from the shell AND the /app RSC payload (the
 * hash-SPA's screens load via RSC navigation — the shell alone lists only
 * 11 chunks), then searches for r66 client strings and probes route gates.
 */
const SITE = "https://gu-mo.vercel.app";

const R66_CLIENT_STRINGS = [
  "لإضافة قسم منفصل",          // dialog hint (admin)
  "اسم القسم (اختياري)",       // label (admin)
  "أُضيف القسم منفصلاً",        // toast fallback (admin)
  "تعرض مكتبة",                // student year-lock chip
  "لا ترى أنت موادّها",         // r66 lock-chip tail
  "مثال: سنة أولى، سنة ثانية",  // section name placeholder
];

async function main() {
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
  console.log("chunks crawled:", all.size);

  let ok = true;
  for (const s of R66_CLIENT_STRINGS) {
    let loc = null;
    for (const [p, js] of all) if (js.includes(s)) { loc = p; break; }
    console.log(loc ? `✅ "${s}" live in ${loc}` : `❌ "${s}" NOT live`);
    if (!loc) ok = false;
  }

  // route gates (unauthenticated)
  const routes = [
    ["GET /api/telegram/sources", "GET", "/api/telegram/sources", 403],
    ["GET /api/telegram/topics", "GET", "/api/telegram/topics", 403],
    ["POST /api/telegram/webhook (no secret)", "POST", "/api/telegram/webhook", 401],
  ];
  for (const [label, method, path, expect] of routes) {
    const res = await fetch(SITE + path, { method, redirect: "manual" });
    console.log(`${res.status === expect ? "✅" : "⚠️"} ${label} → ${res.status} (expect ${expect})`);
  }
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
