/**
 * r66 — PRODUCTION verification: composite section rows against the REAL
 * Supabase project (no DDL needed anywhere).
 *
 * Proves, at the REST layer, exactly what the app's fallback does on Vercel:
 *   1. INSERT a section source row (tg_channel_id = "<chat>:<thread>")
 *      under the owner's real channel — TEXT+UNIQUE accepts it.
 *   2. READ it back (SELECT via anon key — same RLS the app's public reads use).
 *   3. DELETE it (self-cleaning, leaves zero rows behind).
 *
 * Keys are read from env — NEVER hardcode them (public repo).
 *   SUPABASE_URL      e.g. https://<ref>.supabase.co
 *   SUPABASE_ANON_KEY the anon JWT (RLS "Allow anon all access" on
 *                     telegram_sources makes this sufficient for the probe;
 *                     the app itself writes via its service role on Vercel).
 *   SECTION_CHAT      optional real channel chat id (default: ENS channel)
 *   SECTION_THREAD    optional thread number (default: 4242)
 */
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_ANON_KEY;
if (!URL_ || !KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_ANON_KEY (runtime env only)");
  process.exit(1);
}
const CHAT = process.env.SECTION_CHAT ?? "-1002786886789"; // قناة ENS الحقيقية
const THREAD = Number(process.env.SECTION_THREAD ?? 4242);
const COMPOSITE = `${CHAT}:${THREAD}`;

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=representation" };

async function step(name, fn) {
  try {
    const out = await fn();
    console.log(`✅ ${name}${out ? " — " + out : ""}`);
    return true;
  } catch (e) {
    console.log(`❌ ${name} — ${e.message}`);
    return false;
  }
}

let ok = true;

// 1. insert the composite section row (exactly what upsertSectionSource does)
ok &= await step("INSERT قسم مركّب chat:thread", async () => {
  const res = await fetch(`${URL_}/rest/v1/telegram_sources`, {
    method: "POST", headers: H,
    body: JSON.stringify({
      tg_channel_id: COMPOSITE, tg_username: "pepstudents2",
      title_ar: "فحص r66 — قسم مؤقت", source_type: "group", kind: "public",
      specialty_id: 6, year_id: 8, module_id: null, cohort_id: null, is_active: true,
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  const row = JSON.parse(body)[0];
  return `id=${row.id} tg_channel_id=${row.tg_channel_id} year_id=${row.year_id}`;
});

// 2. read it back
ok &= await step("READ القسم مركّباً مستقلاً", async () => {
  const res = await fetch(`${URL_}/rest/v1/telegram_sources?select=id,tg_channel_id,title_ar,year_id&tg_channel_id=eq.${encodeURIComponent(COMPOSITE)}`, { headers: H });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  const rows = JSON.parse(body);
  if (rows.length !== 1 || rows[0].tg_channel_id !== COMPOSITE) throw new Error(`unexpected: ${body.slice(0, 200)}`);
  return rows[0].title_ar;
});

// 3. unique constraint still holds (second insert with same key must fail)
ok &= await step("UNUNIQUE يرفض تكرار نفس القسم", async () => {
  const res = await fetch(`${URL_}/rest/v1/telegram_sources`, {
    method: "POST", headers: H,
    body: JSON.stringify({ tg_channel_id: COMPOSITE, title_ar: "مكرر", source_type: "group", kind: "public", specialty_id: 6, is_active: true }),
  });
  const body = await res.text();
  if (res.ok) throw new Error("duplicate INSERT unexpectedly succeeded!");
  if (!/unique|duplicate/i.test(body)) throw new Error(`unexpected error: ${body.slice(0, 160)}`);
  return "409/unique كما هو متوقع";
});

// 4. delete (self-clean)
ok &= await step("DELETE القسم المؤقت (تنظيف ذاتي)", async () => {
  const res = await fetch(`${URL_}/rest/v1/telegram_sources?tg_channel_id=eq.${encodeURIComponent(COMPOSITE)}`, { method: "DELETE", headers: H });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return "";
});

// 5. confirm zero trace
ok &= await step("لا أثر متبقٍ", async () => {
  const res = await fetch(`${URL_}/rest/v1/telegram_sources?select=id&tg_channel_id=eq.${encodeURIComponent(COMPOSITE)}`, { headers: H });
  const body = await res.text();
  if (JSON.parse(body).length !== 0) throw new Error("row still present!");
  return "";
});

console.log(ok ? "\nPROD SECTION-ROW MECHANICS: ALL PASS ✅" : "\nPROD SECTION-ROW MECHANICS: FAILED ❌");
process.exit(ok ? 0 : 1);
