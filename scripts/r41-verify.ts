/**
 * Round 41 — POST-FIX assertions beyond the basic repro:
 *   A. STRANDED-ROW HEALING: a legacy row stamped with the WRONG specialty
 *      (the exact prod situation: library_references.id=10, module_id=9,
 *      specialty_id = uploader's ≠ course's 6) is VISIBLE again to the
 *      course's students — no DB migration needed.
 *   B. Cross-specialty supervisor (specialty A admin) → POST into specialty-B
 *      course = 403; their module-scoped read = empty.
 *   C. Legitimate supervisor of the course's specialty uploads → students see it.
 *   D. General library keeps hiding course rows for students.
 *
 * Usage: bun run scripts/r41-verify.ts   (server on :3000)
 */
const BASE = "http://localhost:3000";

type Jar = { cookie?: string };
async function api(jar: Jar, path: string, init: RequestInit = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(jar.cookie ? { cookie: jar.cookie } : {}), ...(init.headers ?? {}) },
    redirect: "manual",
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const v = c.split(";")[0];
    if (v.startsWith("talib_session=")) jar.cookie = v;
  }
  let body: Record<string, unknown> = {};
  try { body = await res.json(); } catch { /* non-json */ }
  return { status: res.status, body };
}

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();

  // clean accounts/content, keep structure
  await db.libraryReference.deleteMany();
  await db.scheduleItem.deleteMany();
  await db.joinRequest.deleteMany();
  await db.studentProfile.deleteMany();
  await db.deviceSession.deleteMany();
  await db.moduleCourse.deleteMany();
  await db.appUser.deleteMany();

  const stamp = Date.now().toString(36);
  const owner: Jar = {}, student: Jar = {}, adminA: Jar = {}, adminB: Jar = {};

  // owner (first user → specialty 5), student → specialty 6/year 26
  await api(owner, "/api/auth/signup", { method: "POST", body: JSON.stringify({ fullName: `ر41ف مالك ${stamp}`, email: `r41v-owner-${stamp}@test.dz` }) });
  const sName = `ر41ف طالب ${stamp}`;
  const sEmail = `r41v-student-${stamp}@test.dz`;
  await api(student, "/api/auth/signup", { method: "POST", body: JSON.stringify({ fullName: sName, email: sEmail }) });
  await api(student, "/api/onboarding/complete", { method: "POST", body: JSON.stringify({ fullName: sName, email: sEmail, institutionId: 2, specialtyId: 6, academicYearId: 26, mode: "initial" }) });

  // course in specialty 6
  const c = await api(owner, "/api/courses", { method: "POST", body: JSON.stringify({ name: `ر41ف مقياس ${stamp}`, code: `R41V-${stamp}`, specialtyId: 6, academicYearId: 26 }) });
  const course = c.body.course as { id: number };

  // A. stranded row — direct DB insert with the WRONG specialty (uploader's 5)
  const stranded = await db.libraryReference.create({
    data: {
      specialtyId: 5, title: `محاضرات نحو (يتيمة) ${stamp}`, author: "المالك", category: "محاضرة",
      description: "صف قديم: خاصية التخصص تحمل تخصص الرافع", fileFormat: "PDF",
      downloadUrl: "https://drive.google.com/uc?export=download&id=STRANDED",
      fileSize: 999999, storagePath: "STRANDED-DRIVE-ID", moduleId: course.id,
    },
  });
  console.log("A0 stranded row:", stranded.id, "specialtyId=5 moduleId=" + course.id);

  const aOwner = await api(owner, `/api/library?moduleId=${course.id}`);
  const aStudent = await api(student, `/api/library?moduleId=${course.id}`);
  const aLib = await api(student, "/api/library");
  const aOwnerLib = await api(owner, "/api/library");
  console.log("A1 OWNER  ?moduleId:", ((aOwner.body.items as unknown[]) ?? []).length, "(expect 1 — owner reads any course)");
  console.log("A2 STUDENT ?moduleId:", ((aStudent.body.items as unknown[]) ?? []).length, "(expect 1 — HEALED: student sees the stranded material)");
  console.log("A3 STUDENT general library:", ((aLib.body.items as unknown[]) ?? []).length, "(expect 0 — course rows stay at the course)");
  console.log("A4 OWNER  general library:", ((aOwnerLib.body.items as unknown[]) ?? []).length, "(expect 0 — specialty-5 owner does NOT list a specialty-6 course row)");

  // B. cross-specialty supervisor: promote a user to SPECIALTY_ADMIN of specialty 5 (direct DB — role plumbing is out of scope here)
  const bName = `ر41ف مشرف-أ ${stamp}`;
  const bEmail = `r41v-admina-${stamp}@test.dz`;
  await api(adminA, "/api/auth/signup", { method: "POST", body: JSON.stringify({ fullName: bName, email: bEmail }) });
  const adminARow = await db.appUser.findFirst({ where: { email: bEmail } });
  await db.appUser.update({ where: { id: adminARow!.id }, data: { role: "SPECIALTY_ADMIN", assignedSpecialtyId: 5 } });
  const bPost = await api(adminA, "/api/library", { method: "POST", body: JSON.stringify({ title: `تلصص ${stamp}`, moduleId: course.id }) });
  const bGet = await api(adminA, `/api/library?moduleId=${course.id}`);
  console.log("B1 specialty-5 admin POST into spec-6 course:", bPost.status, "(expect 403)");
  console.log("B2 specialty-5 admin GET ?moduleId:", ((bGet.body.items as unknown[]) ?? []).length, "(expect 0)");

  // C. legitimate supervisor of specialty 6 uploads → student sees it
  const cName = `ر41ف مشرف-ب ${stamp}`;
  const cEmail = `r41v-adminb-${stamp}@test.dz`;
  await api(adminB, "/api/auth/signup", { method: "POST", body: JSON.stringify({ fullName: cName, email: cEmail }) });
  const adminBRow = await db.appUser.findFirst({ where: { email: cEmail } });
  await db.appUser.update({ where: { id: adminBRow!.id }, data: { role: "SPECIALTY_ADMIN", assignedSpecialtyId: 6 } });
  const cPost = await api(adminB, "/api/library", { method: "POST", body: JSON.stringify({ title: `محاضرة مشرف التخصص ${stamp}`, moduleId: course.id, driveFileId: "OK-DRIVE-ID", fileSize: 42 }) });
  const cItem = cPost.body.item as { specialtyId?: number } | undefined;
  console.log("C1 specialty-6 supervisor POST:", cPost.status, "row specialtyId:", cItem?.specialtyId, "(expect 200 + 6)");
  const cStudent = await api(student, `/api/library?moduleId=${course.id}`);
  const cItems = ((cStudent.body.items as unknown[]) ?? []).length;
  console.log("C2 STUDENT ?moduleId now:", cItems, "(expect 2 — stranded + supervisor's)");

  // D. no moduleId → specialty-6 supervisor's general library also hides course rows
  const dSupLib = await api(adminB, "/api/library");
  console.log("D1 supervisor general library:", ((dSupLib.body.items as unknown[]) ?? []).length, "(expect 0)");

  // cleanup accounts + content, keep structure
  await db.libraryReference.deleteMany();
  await db.scheduleItem.deleteMany();
  await db.joinRequest.deleteMany();
  await db.studentProfile.deleteMany();
  await db.deviceSession.deleteMany();
  await db.moduleCourse.deleteMany();
  await db.appUser.deleteMany();
  const [u, mcr] = [await db.appUser.count(), await db.moduleCourse.count()];
  console.log("cleanup: users:", u, "courses:", mcr);
  await db.$disconnect();

  const ok = ((aStudent.body.items as unknown[]) ?? []).length === 1 && bPost.status === 403 && ((bGet.body.items as unknown[]) ?? []).length === 0 && cPost.status === 200 && cItems === 2 && ((aLib.body.items as unknown[]) ?? []).length === 0;
  console.log("\n=== VERDICT ===", ok ? "ALL POST-FIX ASSERTIONS PASS" : "SOME ASSERTIONS FAILED");
  if (!ok) process.exit(1);
}

main().catch((e) => { console.error("VERIFY FAILED:", e.message); process.exit(1); });

export {};
