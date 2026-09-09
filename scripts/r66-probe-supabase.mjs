/**
 * Round 66 — probe a Supabase project's schema state via PostgREST.
 * Keys come from RUNTIME env (public repo — never hardcode):
 *   SUPABASE_URL, SUPABASE_ANON_KEY
 * Prints which telegram/course tables exist (404 PGRST205 = missing).
 */
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_ANON_KEY;
if (!URL_ || !KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_ANON_KEY");
  process.exit(1);
}

for (const t of [
  "telegram_sources", "telegram_items", "telegram_topics", "bot_config",
  "personal_schedule_items", "course_materials", "cached_course_materials",
  "push_subscriptions", "academic_years", "module_courses",
]) {
  try {
    const res = await fetch(`${URL_}/rest/v1/${t}?select=id&limit=1`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
      signal: AbortSignal.timeout(15000),
    });
    const body = await res.text();
    const verdict = res.ok
      ? "EXISTS ✓"
      : /PGRST205|does not exist/i.test(body)
        ? "MISSING ✗"
        : `HTTP ${res.status}`;
    console.log(`${t.padEnd(24)} → ${verdict}`);
  } catch (e) {
    console.log(`${t.padEnd(24)} → ERROR ${e.message}`);
  }
}
