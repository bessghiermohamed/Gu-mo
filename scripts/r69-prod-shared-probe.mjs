/**
 * r69 — production probe: does the shared space actually return the cohort-35
 * items for student 75 (the account the owner tested with)?
 * Read-only on app data; creates ONE temporary device_session row which is
 * deleted at the end. Keys via runtime env only.
 */
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_ANON_KEY;
const APP = "https://gu-mo.vercel.app";
if (!URL_ || !KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_ANON_KEY");
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function main() {
  // 0) sanity: user 75 + cohort + items
  const user = await (await fetch(`${URL_}/rest/v1/app_users?select=id,full_name,role,assigned_specialty_id,scope_cohort_group_id,scope_track_id,scope_academic_year_id&id=eq.75`, { headers: H })).json();
  console.log("user 75:", JSON.stringify(user));
  const items = await (await fetch(`${URL_}/rest/v1/telegram_items?select=id,title_ar,cohort_id,is_hidden,source_id,module_id&cohort_id=eq.35`, { headers: H })).json();
  console.log("cohort-35 items:", JSON.stringify(items));

  // 1) create a temporary session for user 75
  const token = "r69probe" + "x".repeat(30) + Date.now().toString(16);
  const ins = await fetch(`${URL_}/rest/v1/device_sessions`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ user_id: 75, device_token: token, expires_at: new Date(Date.now() + 3600_000).toISOString() }),
  });
  console.log("session insert →", ins.status);
  if (!ins.ok) {
    console.log(await ins.text());
    process.exit(1);
  }

  try {
    // 2) call the shared-space API as user 75
    const res = await fetch(`${APP}/api/telegram/items?mode=shared`, {
      headers: { cookie: `talib_session=${token}` },
      signal: AbortSignal.timeout(30000),
    });
    const body = await res.json();
    console.log("\nGET /api/telegram/items?mode=shared →", res.status);
    console.log("myCohortId:", body.myCohortId, "| items:", (body.items ?? []).length);
    for (const it of body.items ?? []) {
      console.log("  -", it.id, "|", it.titleAr, "| module:", it.moduleId, "| cohort:", it.cohortId, "| hidden:", it.isHidden);
    }

    // 3) also check the library mode as this student (for comparison)
    const res2 = await fetch(`${APP}/api/telegram/items?mode=library`, {
      headers: { cookie: `talib_session=${token}` },
      signal: AbortSignal.timeout(30000),
    });
    const body2 = await res2.json();
    console.log("\nGET /api/telegram/items?mode=library →", res2.status, "| items:", (body2.items ?? []).length, "| yearLock:", JSON.stringify(body2.yearLock), "| trackLock:", JSON.stringify(body2.trackLock));
  } finally {
    // 4) cleanup the temporary session
    const del = await fetch(`${URL_}/rest/v1/device_sessions?device_token=eq.${encodeURIComponent(token)}`, { method: "DELETE", headers: H });
    console.log("\nsession cleanup →", del.status);
  }
}

main().catch((e) => {
  console.error("probe failed:", e.message);
  process.exit(1);
});
