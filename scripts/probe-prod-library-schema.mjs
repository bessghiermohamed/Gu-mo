/**
 * Round 40 — probe the PRODUCTION Supabase schema for the library_references
 * columns that course-scoped Drive publishing depends on:
 *   module_id    → material appears in the course's المواد tab
 *   storage_path → «على Drive» badge (Drive fileId)
 *   file_size    → size badge
 * NEXT_PUBLIC_SUPABASE_URL / ANON_KEY are baked into the deployed bundle by
 * design (public values), so extract them from prod chunks and probe via
 * PostgREST. A missing column returns PGRST204; an existing column returns
 * 200 (RLS may still hide rows — we only care about schema).
 *
 * Usage: node scripts/probe-prod-library-schema.mjs
 */
const SITE = "https://gu-mo.vercel.app";

async function main() {
  // 1. find app chunk urls from the shell page
  const html = await (await fetch(SITE, { cache: "no-store" })).text();
  const scripts = [...html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map(m => m[1]);
  if (!scripts.length) throw new Error("no script tags found on prod shell");
  console.log(`found ${scripts.length} script tags`);

  // 2. scan chunks for the supabase url + anon key
  let url = null, key = null;
  for (const s of scripts) {
    const abs = s.startsWith("http") ? s : SITE + s;
    let js;
    try { js = await (await fetch(abs, { cache: "no-store" })).text(); } catch { continue; }
    if (!url) {
      const m = js.match(/https:\/\/[a-z0-9]+\.supabase\.co/);
      if (m) url = m[0];
    }
    if (!key) {
      // anon keys are long base64-ish JWTs stored next to the url in the client helper
      const m = js.match(/eyJ[A-Za-z0-9_-]{40,}\.eyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}/);
      if (m && js.includes("supabase")) key = m[0];
    }
    if (url && key) break;
  }
  if (!url || !key) {
    console.log(JSON.stringify({ url: !!url, key: !!key }));
    throw new Error("could not extract supabase url/anon key from prod bundle");
  }
  console.log("supabase url:", url);
  console.log("anon key: ", key.slice(0, 24) + "…(" + key.length + " chars)");

  // 3. probe the columns
  const cols = ["module_id", "storage_path", "file_size"];
  for (const col of cols) {
    const res = await fetch(`${url}/rest/v1/library_references?select=id,${col}&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const body = await res.text();
    let verdict;
    if (res.ok) verdict = "EXISTS ✓";
    else if (/PGRST204|Could not find the .*column|column .* does not exist/i.test(body)) verdict = "MISSING ✗";
    else verdict = `HTTP ${res.status}: ${body.slice(0, 140)}`;
    console.log(`${col.padEnd(14)} → ${verdict}`);
  }

  // 4. bonus: count course-scoped rows visible via anon (RLS may block — fine)
  const res2 = await fetch(`${url}/rest/v1/library_references?select=id,module_id,storage_path&limit=5`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  console.log("sample rows:", (await res2.text()).slice(0, 300));
}

main().catch((e) => { console.error("PROBE FAILED:", e.message); process.exit(1); });
