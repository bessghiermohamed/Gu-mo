/**
 * Round 41 — PRODUCTION end-to-end verification (gu-mo.vercel.app).
 * Replays the user's exact scenario against the live deployment:
 *   1. sign up a throwaway STUDENT
 *   2. onboard them into specialty 6 / year 8 (the course's scope)
 *   3. GET /api/library?moduleId=9  → expect the stranded row id=10
 *      («محاضرات نحو») once the r41-fix deploy lands
 *   4. GET /api/library (general)   → expect 0 course rows
 *   5. DELETE the throwaway account (self-service, /api/auth/delete)
 */
const SITE = "https://gu-mo.vercel.app";
const stamp = Date.now().toString(36);
const name = `طالب اختبار ${stamp}`;
const email = `r41probe-${stamp}@test.dz`;
const jar = { cookie: "" };

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(SITE + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(jar.cookie ? { cookie: jar.cookie } : {}), ...(init.headers ?? {}) },
    redirect: "manual",
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const v = c.split(";")[0];
    if (v.startsWith("talib_session=")) jar.cookie = v;
  }
  let body: Record<string, unknown> = {};
  try { body = await res.json(); } catch { /* html */ }
  return { status: res.status, body };
}

async function main() {
  const su = await api("/api/auth/signup", { method: "POST", body: JSON.stringify({ fullName: name, email }) });
  console.log("signup:", su.status, JSON.stringify((su.body.user as { id?: number; role?: string }) ?? su.body));
  const ob = await api("/api/onboarding/complete", {
    method: "POST",
    body: JSON.stringify({ fullName: name, email, specialtyId: 6, academicYearId: 8, mode: "initial" }),
  });
  console.log("onboard → spec 6/year 8:", ob.status);

  // poll for the deploy: BEFORE the fix the student gets 0 items for course 9;
  // AFTER it, row 10 becomes visible (course-authorized read).
  for (let attempt = 1; attempt <= 10; attempt++) {
    const r = await api("/api/library?moduleId=9");
    const items = (r.body.items as Array<{ id: number; title: string; specialtyId?: number }>) ?? [];
    console.log(`attempt ${attempt}: GET ?moduleId=9 →`, r.status, "items:", items.length, items.map((i) => `#${i.id} «${i.title}»`).join(", "));
    if (items.length > 0) {
      const lib = await api("/api/library");
      const libItems = (lib.body.items as unknown[]) ?? [];
      console.log("general library items:", libItems.length, "(expect 0 — course rows stay at the course)");
      const del = await api("/api/auth/delete", { method: "POST" });
      console.log("cleanup throwaway account:", del.status, JSON.stringify(del.body));
      console.log("\n=== PROD VERDICT === FIX LIVE — student of specialty 6/year 8 sees course 9 materials");
      return;
    }
    await new Promise((r) => setTimeout(r, 45000));
  }
  console.log("\n=== PROD VERDICT === deploy not detected within timeout — retry later");
  const del = await api("/api/auth/delete", { method: "POST" });
  console.log("cleanup throwaway account:", del.status);
}

main().catch((e) => { console.error("PROD PROBE FAILED:", e.message); process.exit(1); });
