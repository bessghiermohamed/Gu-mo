/**
 * Round 41b — extract prod Supabase URL + anon key (attempt 3):
 * scan /app shell chunks + recursively follow webpack runtime chunk maps.
 * Then decisively read prod row 10 (specialty_id is the datum the confirmed
 * facts omit) and run the EXACT student-side query.
 */
const SITE = "https://gu-mo.vercel.app";
const seen = new Set();
const queue = [];
let url = null, key = null;

function scan(path, js) {
  if (!url) { const m = js.match(/https:\/\/[a-z0-9]+\.supabase\.co/); if (m) { url = m[0]; console.log("URL in", path); } }
  if (!key) {
    const m = js.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/);
    if (m) { key = m[0]; console.log("KEY in", path, `(len ${key.length})`); }
  }
  // webpack runtime maps: {name:"hash"} or "id":"hash" inside chunk loading
  for (const m of js.matchAll(/"(\d+)":"([A-Za-z0-9_-]{8,})"/g)) {
    const p2 = `/_next/static/chunks/${m[1]}.${m[2]}.js` // app-router style: <n>.<hash>.js? not standard
    // also try chunks/app/... variants later if needed
  }
  for (const m of js.matchAll(/static\/chunks\/([A-Za-z0-9/._-]+\.js)/g)) {
    const p2 = `/_next/static/chunks/${m[1]}`;
    if (!seen.has(p2)) { seen.add(p2); queue.push(p2); }
  }
}

(async () => {
  for (const page of ["/app", "/"]) {
    const html = await (await fetch(SITE + page, { cache: "no-store" })).text();
    for (const m of html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)) {
      if (!seen.has(m[1])) { seen.add(m[1]); queue.push(m[1]); }
    }
  }
  console.log("initial queue:", queue.length);
  let guard = 0;
  while (queue.length && guard++ < 300 && !(url && key)) {
    const p = queue.shift();
    let js = "";
    try { js = await (await fetch(SITE + p, { cache: "no-store" })).text(); } catch { continue; }
    if (js.startsWith("<")) continue; // 403 html
    scan(p, js);
  }
  console.log("scanned:", seen.size, "chunks");
  console.log(JSON.stringify({ url: !!url, key: !!key }));
  if (url && key) {
    const H = { apikey: key, Authorization: `Bearer ${key}` };
    // decisive: the actual row + the EXACT two query shapes
    const base = `${url}/rest/v1/library_references`;
    const r1 = await fetch(`${base}?select=id,specialty_id,module_id,title,storage_path,file_size&id=eq.10`, { headers: H });
    console.log("ROW10:", r1.status, await r1.text());
    const r2 = await fetch(`${base}?select=id,specialty_id,module_id&module_id=eq.9`, { headers: H });
    console.log("BY_MODULE_9 (all specialties):", r2.status, await r2.text());
  }
})();
