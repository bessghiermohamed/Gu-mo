/**
 * r69 — production verification (run AFTER the Vercel deploy completes).
 * Proves the owner's three fixes live on gu-mo.vercel.app:
 *  1) Shared space: myCohortName («فوج 7 — السنة الثانية») + the 2 real posts
 *     for student 75 (cohort 35); sources list carries the year-suffixed
 *     cohort name; admin cohort filter isolates the space's posts;
 *     invite-link guard returns the actionable 400.
 *  2) Reports: a REAL POST /api/issues as student 75 succeeds on the
 *     reporter_id-less production table (the r69 fallback) → visible to the
 *     owner → deleted (cleanup).
 *  3) Bottom bar: «أدواتي» + the cohort-filter strings present in served
 *     client chunks.
 * Keys via runtime env only. Creates ONE temporary device_session (deleted
 * at the end) and ONE issue report (deleted at the end).
 */
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_ANON_KEY;
const APP = "https://gu-mo.vercel.app";
if (!URL_ || !KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_ANON_KEY");
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

let passed = 0;
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed += 1; console.log(`  ✅ ${name}`); }
  else { failed += 1; console.log(`  ❌ ${name} ${extra}`); }
}

async function tempSession(userId) {
  const token = "r69prod" + "x".repeat(24) + Date.now().toString(16) + userId;
  const res = await fetch(`${URL_}/rest/v1/device_sessions`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ user_id: userId, device_token: token, expires_at: new Date(Date.now() + 3600_000).toISOString() }),
  });
  if (!res.ok) throw new Error(`session insert failed ${res.status}`);
  return token;
}
async function dropSession(token) {
  await fetch(`${URL_}/rest/v1/device_sessions?device_token=eq.${encodeURIComponent(token)}`, { method: "DELETE", headers: H });
}

async function main() {
  // who is student 75 / owner 24 (sanity)
  const users = await (await fetch(`${URL_}/rest/v1/app_users?select=id,full_name,role,scope_cohort_group_id&id=in.(24,75)`, { headers: H })).json();
  console.log("users:", JSON.stringify(users));

  const studentToken = await tempSession(75);
  const ownerToken = await tempSession(24);
  try {
    // ---------- 1) shared space as student 75 ----------
    const shared = await (await fetch(`${APP}/api/telegram/items?mode=shared`, {
      headers: { cookie: `talib_session=${studentToken}` }, signal: AbortSignal.timeout(30000),
    })).json();
    check("1.1 المساحة ترجع منشورات فوج 35 (كما هي الآن — المنشورات تتزايد فعلياً)", (shared.items ?? []).length >= 2 && (shared.items ?? []).every((i) => Number(i.cohortId) === 35), `len=${(shared.items ?? []).length}`);
    check(
      "1.2 myCohortName مميِّز بالسنة",
      /فوج 7/.test(String(shared.myCohortName ?? "")) && /السنة الثانية/.test(String(shared.myCohortName ?? "")),
      `myCohortName=${JSON.stringify(shared.myCohortName)}`
    );

    // ---------- 2) sources list: year-suffixed cohort name (owner) ----------
    const sources = await (await fetch(`${APP}/api/telegram/sources`, {
      headers: { cookie: `talib_session=${ownerToken}` }, signal: AbortSignal.timeout(30000),
    })).json();
    const bound = (sources.sources ?? []).find((s) => Number(s.cohortId) === 35);
    check(
      "2.1 قائمة المصادر: اسم الفوج مع سنته",
      bound != null && /فوج 7/.test(String(bound.cohortName ?? "")) && /السنة/.test(String(bound.cohortName ?? "")),
      `cohortName=${JSON.stringify(bound?.cohortName)}`
    );

    // ---------- 3) admin cohort filter (owner) ----------
    const admin35 = await (await fetch(`${APP}/api/telegram/items?mode=admin&cohortId=35`, {
      headers: { cookie: `talib_session=${ownerToken}` }, signal: AbortSignal.timeout(30000),
    })).json();
    const aItems = admin35.items ?? [];
    check("3.1 فلتر المساحة (فوج 35) → منشوراته فقط", aItems.length >= 2 && aItems.every((i) => Number(i.cohortId) === 35), `len=${aItems.length}`);
    const adminNone = await (await fetch(`${APP}/api/telegram/items?mode=admin&cohortId=none`, {
      headers: { cookie: `talib_session=${ownerToken}` }, signal: AbortSignal.timeout(30000),
    })).json();
    check("3.2 «بلا مساحة» → لا منشورات فوج", (adminNone.items ?? []).every((i) => i.cohortId == null), `len=${(adminNone.items ?? []).length}`);

    // ---------- 4) invite-link guard (owner) ----------
    const inv = await fetch(`${APP}/api/telegram/sources`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: `talib_session=${ownerToken}` },
      body: JSON.stringify({ handle: "https://t.me/+r69ProbeInvite", sourceType: "group", cohortId: 35 }),
      signal: AbortSignal.timeout(30000),
    });
    const invBody = await inv.json();
    check(
      "4.1 رابط دعوة خاص → 400 برسالة واضحة",
      inv.status === 400 && /رابط الدعوة الخاص/.test(String(invBody.error ?? "")),
      `${inv.status} ${JSON.stringify(invBody).slice(0, 90)}`
    );

    // ---------- 5) reports — the real fix ----------
    const rep = await fetch(`${APP}/api/issues`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: `talib_session=${studentToken}` },
      body: JSON.stringify({ itemType: "other", itemTitle: "r69 فحص إنتاج — يُحذف", description: "تحقق r69" }),
      signal: AbortSignal.timeout(30000),
    });
    const repBody = await rep.json();
    check("5.1 إرسال تبليغ ينجح رغم غياب عمود reporter_id", rep.status === 200 && repBody.report != null, `${rep.status} ${JSON.stringify(repBody).slice(0, 90)}`);

    const list = await (await fetch(`${APP}/api/issues`, {
      headers: { cookie: `talib_session=${ownerToken}` }, signal: AbortSignal.timeout(30000),
    })).json();
    const mine = (list.reports ?? []).find((r) => String(r.itemTitle ?? "").includes("r69"));
    check("5.2 التبليغ يظهر للمشرف", mine != null, `reports=${(list.reports ?? []).length}`);
    if (mine) {
      const del = await fetch(`${APP}/api/issues?id=${mine.id}`, { method: "DELETE", headers: { cookie: `talib_session=${ownerToken}` } });
      check("5.3 حذف التبليغ التجريبي", del.status === 200, `${del.status}`);
    }

    // ---------- 6) chunks carry the new UI ----------
    const shell = await (await fetch(`${APP}/app`, { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(30000) })).text();
    const chunkRe = /\/_next\/static\/chunks\/[a-z0-9_-]+\.js/g;
    const seeds = Array.from(new Set(shell.match(chunkRe) ?? [])).slice(0, 25);
    let navTools = false;
    let cohortFilter = false;
    for (const c of seeds) {
      const js = await (await fetch(`${APP}${c}`, { signal: AbortSignal.timeout(30000) })).text();
      if (js.includes('"أدواتي"') || (js.includes("أدواتي") && js.includes("nav"))) navTools = true;
      if (js.includes("كل المساحات + المكتبة")) cohortFilter = true;
    }
    check("6.1 «أدواتي» في الـ chunks (الشريط السفلي)", navTools, `seeds=${seeds.length}`);
    check("6.2 «كل المساحات + المكتبة» في الـ chunks (فلتر المساحات)", cohortFilter);
  } finally {
    await dropSession(studentToken);
    await dropSession(ownerToken);
    console.log("sessions cleaned");
  }

  console.log(`\n${passed} ✅ / ${failed} ❌`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("probe failed:", e.message);
  process.exit(1);
});
