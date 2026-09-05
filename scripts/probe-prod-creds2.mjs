/**
 * Round 41b — extract prod Supabase URL + anon key from the deployed bundle
 * (attempt 2: via __NEXT_DATA__ buildId → _buildManifest.js → all chunks →
 * also scan _next/static chunks referenced by ANY app page).
 * The URL/anon key are PUBLIC by design (baked into client bundle).
 */
const SITE = "https://gu-mo.vercel.app";

async function* chunkUrls() {
  const seen = new Set();
  const queue = [];
  // 1. shell html
  const html = await (await fetch(SITE, { cache: "no-store" })).text();
  const buildId = html.match(/"buildId":"([^"]+)"/)?.[1];
  console.log("buildId:", buildId ?? "NOT FOUND");
  for (const m of html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)) queue.push(m[1]);
  // 2. build manifest + all app pages it lists
  if (buildId) {
    queue.push(`/_next/static/${buildId}/_buildManifest.js`);
    queue.push(`/_next/static/${buildId}/_ssgManifest.js`);
  }
  let guard = 0;
  while (queue.length && guard++ < 400) {
    const p = queue.shift();
    if (seen.has(p)) continue;
    seen.add(p);
    const abs = p.startsWith("http") ? p : SITE + p;
    let js = "";
    try { js = await (await fetch(abs, { cache: "no-store" })).text(); } catch { continue; }
    if (js.length < 60 && !js.includes("static")) continue; // 403/empty body
    yield { path: p, js, queue };
    for (const m of js.matchAll(/"(\/_next\/static\/[^"]+\.js)"/g)) {
      if (!seen.has(m[1])) queue.push(m[1]);
    }
    for (const m of js.matchAll(/static\/chunks\/([A-Za-z0-9._-]+\.js)/g)) {
      const p2 = `/_next/static/chunks/${m[1]}`;
      if (!seen.has(p2)) queue.push(p2);
    }
  }
}

let url = null, key = null;
for await (const { path, js } of chunkUrls()) {
  if (!url) { const m = js.match(/https:\/\/[a-z0-9]+\.supabase\.co/); if (m) { url = m[0]; console.log("URL found in", path); } }
  if (!key) {
    const m = js.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/);
    if (m) { key = m[0]; console.log("KEY found in", path, `(len ${key.length})`); }
  }
  if (url && key) break;
}
console.log(JSON.stringify({ url: !!url, key: !!key }));
if (url && key) {
  // 3. decisive probe: read the actual row 10 + count per specialty
  const q = (sel) => `${url}/rest/v1/library_references?select=${sel}&id=eq.10`;
  const r = await fetch(q("id,specialty_id,module_id,title,storage_path,file_size"), {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  console.log("row10:", r.status, await r.text());
}
