/**
 * Round 50 — local seed for the DESIGN REVIEW of un-redesigned elements.
 * Creates OWNER account through the real API (fresh DB → first user OWNER),
 * completes onboarding (specialty 1 = ENS اللغة والأدب العربي, year 2), then
 * enriches the DB with rows for every screen the review screenshots:
 * assignments, library references, student grades, personal schedule rows.
 *
 * Usage: bun run scripts/r50-seed.ts   (server must run on :3000)
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

async function main() {
  // 1. OWNER via the real signup API (fresh DB → OWNER role)
  const jar: Jar = {};
  const fullName = "مالك المراجعة";
  const email = "r50-owner@test.dz";
  const up = await api(jar, "/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ fullName, email }),
  });
  console.log("signup:", up.status, JSON.stringify({
    id: (up.body.user as { id?: number })?.id,
    role: (up.body.user as { role?: string })?.role,
  }));

  // 2. Onboarding complete → specialty 1 (ENS, ر45 seed courses live there), year 2
  const ob = await api(jar, "/api/onboarding/complete", {
    method: "POST",
    body: JSON.stringify({ fullName, email, institutionId: 1, specialtyId: 1, academicYearId: 2, mode: "initial" }),
  });
  console.log("onboarding:", ob.status);

  // 3. Enrich DB for every screen under review
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();

  const user = await db.appUser.findFirstOrThrow({ where: { email } });
  const spec = await db.specialty.findFirstOrThrow({ where: { id: 1 } });
  const year = await db.academicYear.findFirstOrThrow({ where: { id: 2 } });
  const course = await db.moduleCourse.findFirstOrThrow({ where: { specialtyId: 1 } });

  // Assignments (3: one due soon, one later, one past)
  if ((await db.assignment.count()) === 0) {
    const iso = (d: number) => new Date(Date.now() + d * 24 * 3600 * 1000).toISOString().slice(0, 10);
    await db.assignment.create({ data: { title: "تمرين التحليل 3", description: "حل التمارين من 12 إلى 18 صفحة 45", dueDate: iso(2), moduleId: course.id, maxScore: 20 } });
    await db.assignment.create({ data: { title: "بحث الجبر الخطي", description: "بحث قصير حول الفضاءات الجزئية مع أمثلة", dueDate: iso(9), moduleId: course.id, maxScore: 20 } });
    await db.assignment.create({ data: { title: "فروض الإنغليزية", description: "كتابة فقرة حول التخصص المهني", dueDate: iso(-5), moduleId: course.id, maxScore: 20 } });
    console.log("assignments seeded: 3");
  }

  // Library references (files screen)
  if ((await db.libraryReference.count()) === 0) {
    await db.libraryReference.create({ data: { title: "ملخص التحليل — السداسي الأول", author: "إدارة التخصص", category: "ملخص", description: "ملخص شامل لوحدة التحليل الرياضي", fileFormat: "PDF", pageCount: 48, downloadUrl: "https://drive.example/summary", specialtyId: 1, fileSize: 1420000 } });
    await db.libraryReference.create({ data: { title: "سلسلة تمارين الجبر", author: "د. مرابط", category: "تمارين", description: "سلسلة تمارين مع الحلول", fileFormat: "PDF", pageCount: 22, downloadUrl: "https://drive.example/exercises", specialtyId: 1, fileSize: 860000 } });
    console.log("library refs seeded: 2");
  }

  // Student grades (profile academic record has data to show)
  if ((await db.studentGrade.count()) === 0) {
    const g = (name: string, c: number, cont: number, exam: number) =>
      db.studentGrade.create({ data: { moduleId: course.id, moduleName: name, continuousScore: cont, examScore: exam, coefficient: c, credits: c, isOfficial: true, ownerId: String(user.id) } });
    await g("التحليل الرياضي", 4, 13.5, 15);
    await g("الجبر الخطي", 3, 15, 17);
    await g("الإنغليزية", 1, 17, 19);
    console.log("grades seeded: 3");
  }

  // Personal schedule row (schedule screen personal mode)
  if ((await db.personalScheduleItem.count({ where: { userId: user.id } })) === 0) {
    await db.personalScheduleItem.create({ data: { userId: user.id, dayOfWeek: 3, startTime: "09:00", endTime: "10:30", moduleName: "مراجعة شخصية", type: "مراجعة", room: "المكتبة", notes: "قبل الاختبار" } });
    console.log("personal schedule row seeded");
  }

  // Course material (course-detail المواد tab)
  if ((await db.cachedCourseMaterial.count()) === 0) {
    await db.cachedCourseMaterial.create({ data: { moduleId: course.id, moduleName: course.name, title: "محاضرة الفصل الأول — مدخل", materialType: "محاضرة", summary: "المفاهيم الأساسية للوحدة", fullText: "نص المحاضرة…", weekNumber: 1 } });
    console.log("course material seeded");
  }

  console.log("SEED COMPLETE", { user: user.id, role: user.role, spec: spec.nameAr, year: year.yearName });
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
