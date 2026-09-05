/**
 * Round 41 — REPRODUCTION: course material invisible to the course's students.
 *
 * Prod facts mirrored locally:
 *   • OWNER account assigned to specialty A (signup default = first specialty)
 *   • course created in specialty B (OWNER may create cross-specialty —
 *     POST /api/courses honors body.specialtyId with no scope check)
 *   • test STUDENT onboarded into specialty B + year (assigned_specialty_id=B)
 *   • OWNER uploads a material INSIDE that course (POST /api/library + moduleId)
 *   • owner's own read-back shows the file; the student's المواد tab shows NOTHING
 *
 * Usage: bun run scripts/r41-repro.ts   (server must run on :3000)
 */
const BASE = "http://localhost:3000";

type Jar = { cookie?: string };
async function api(jar: Jar, path: string, init: RequestInit = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(jar.cookie ? { cookie: jar.cookie } : {}),
      ...(init.headers ?? {}),
    },
    redirect: "manual",
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    const v = c.split(";")[0];
    if (v.startsWith("talib_session=")) jar.cookie = v;
  }
  let body: Record<string, unknown> = {};
  try { body = await res.json(); } catch { /* non-json */ }
  return { status: res.status, body };
}

async function cleanUsers() {
  // wipe accounts + their content from previous runs; keep the ACADEMIC STRUCTURE
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();
  await db.libraryReference.deleteMany();
  await db.scheduleItem.deleteMany();
  await db.joinRequest.deleteMany();
  await db.studentProfile.deleteMany();
  await db.deviceSession.deleteMany();
  await db.moduleCourse.deleteMany();
  await db.appUser.deleteMany();
  await db.$disconnect();
}

async function main() {
  await cleanUsers();
  const stamp = Date.now().toString(36);
  const owner: Jar = {};
  const student: Jar = {};

  // 1. OWNER — first user on a fresh DB becomes OWNER, assigned to FIRST specialty
  const o = await api(owner, "/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ fullName: `ر41 مالك ${stamp}`, email: `r41owner-${stamp}@test.dz` }),
  });
  console.log("signup owner:", o.status, JSON.stringify({ id: (o.body.user as { id?: number })?.id, role: (o.body.user as { role?: string })?.role, assignedSpecialtyId: (o.body.user as { assignedSpecialtyId?: number })?.assignedSpecialtyId }));

  // 2. STUDENT — then onboarded into specialty B (id 6) + year (id 26)
  const sName = `ر41 طالب ${stamp}`;
  const sEmail = `r41student-${stamp}@test.dz`;
  const s = await api(student, "/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ fullName: sName, email: sEmail }),
  });
  console.log("signup student:", s.status, JSON.stringify({ id: (s.body.user as { id?: number })?.id, role: (s.body.user as { role?: string })?.role, assignedSpecialtyId: (s.body.user as { assignedSpecialtyId?: number })?.assignedSpecialtyId }));
  const ob = await api(student, "/api/onboarding/complete", {
    method: "POST",
    body: JSON.stringify({ fullName: sName, email: sEmail, institutionId: 2, specialtyId: 6, academicYearId: 26, mode: "initial" }),
  });
  console.log("student onboarding → spec 6/year 26:", ob.status, JSON.stringify((ob.body.user as { assignedSpecialtyId?: number }) ?? ob.body));

  // 3. OWNER creates the course in specialty B (cross-specialty, like prod course 9)
  const c = await api(owner, "/api/courses", {
    method: "POST",
    body: JSON.stringify({ name: `ر41 مقياس ${stamp}`, code: `R41-${stamp}`, specialtyId: 6, academicYearId: 26 }),
  });
  const course = c.body.course as { id: number; specialtyId: number } | undefined;
  console.log("create course in spec 6:", c.status, JSON.stringify(course));

  if (!course?.id) throw new Error("course creation failed");

  // 4. OWNER uploads a material INSIDE the course (the Drive metadata row)
  const up = await api(owner, "/api/library", {
    method: "POST",
    body: JSON.stringify({
      title: `محاضرات ر41 ${stamp}`, category: "محاضرة", fileFormat: "PDF",
      description: "اختبار ربط المادة بالمقياس",
      downloadUrl: "https://drive.google.com/uc?export=download&id=FAKE",
      driveFileId: "FAKE-ID-123", fileSize: 1234567,
      moduleId: course.id,
    }),
  });
  console.log("owner upload (moduleId):", up.status, JSON.stringify({ id: (up.body.item as { id?: number })?.id, specialtyId: (up.body.item as { specialtyId?: number })?.specialtyId, moduleId: (up.body.item as { moduleId?: number })?.moduleId }));

  // 5. READ-BACK — the two paths under test
  const ownerSees = await api(owner, `/api/library?moduleId=${course.id}`);
  const studentSees = await api(student, `/api/library?moduleId=${course.id}`);
  const lib = await api(student, "/api/library");
  console.log("OWNER  GET ?moduleId:", ownerSees.status, "items:", ((ownerSees.body.items as unknown[]) ?? []).length, "(upload read-back — reportedly works)");
  console.log("STUDENT GET ?moduleId:", studentSees.status, "items:", ((studentSees.body.items as unknown[]) ?? []).length, "(student المواد tab — REPORTED EMPTY)");
  console.log("STUDENT GET general library:", lib.status, "items:", ((lib.body.items as unknown[]) ?? []).length);

  console.log("\n=== VERDICT ===");
  const oCount = ((ownerSees.body.items as unknown[]) ?? []).length;
  const sCount = ((studentSees.body.items as unknown[]) ?? []).length;
  console.log(oCount > 0 && sCount === 0 ? "BUG REPRODUCED: owner sees it, student does NOT" : oCount > 0 && sCount > 0 ? "FIXED: both see the material" : `UNEXPECTED owner=${oCount} student=${sCount}`);
}

main().catch((e) => { console.error("REPRO FAILED:", e.message); process.exit(1); });

export {};
