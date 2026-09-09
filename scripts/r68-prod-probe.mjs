/**
 * r68 — probe production telegram_sources for the track_id column
 * (needed to know whether track bindings can be written on Vercel today).
 * Keys from runtime env only (public repo — never hardcode).
 */
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_ANON_KEY;
if (!URL_ || !KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_ANON_KEY");
  process.exit(1);
}

// 1) column probe: SELECT track_id → PGRST204 means the column is missing
const res = await fetch(`${URL_}/rest/v1/telegram_sources?select=id,track_id&limit=3`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  signal: AbortSignal.timeout(15000),
});
const body = await res.text();
console.log(`telegram_sources track_id probe → HTTP ${res.status}`);
console.log(body.slice(0, 400));

// 2) existing sources overview (what is linked today, with their rules)
const res2 = await fetch(
  `${URL_}/rest/v1/telegram_sources?select=id,tg_channel_id,title_ar,source_type,specialty_id,track_id,year_id,module_id,cohort_id,is_active&order=id.asc`,
  { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(15000) }
);
const body2 = await res2.text();
console.log("\nsources overview → HTTP", res2.status);
try {
  const rows = JSON.parse(body2);
  for (const r of rows) console.log(JSON.stringify(r));
} catch {
  console.log(body2.slice(0, 400));
}

// 3) academic_tracks present? (options for the ملمح selector)
const res3 = await fetch(`${URL_}/rest/v1/academic_tracks?select=id,specialty_id,track_name_ar&limit=10`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  signal: AbortSignal.timeout(15000),
});
const body3 = await res3.text();
console.log("\nacademic_tracks → HTTP", res3.status);
try {
  const rows = JSON.parse(body3);
  for (const r of rows) console.log(JSON.stringify(r));
} catch {
  console.log(body3.slice(0, 400));
}
