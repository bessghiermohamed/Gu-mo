/**
 * Round 52 — local seed for browser verification of the owner's new fixes:
 *   • course files (واجب/اختبار categories) linked to a module
 *   • specialty-wide library files of every category (ملفاتي filters)
 *   • a cohort + a STUDENT member (group screen tabs + scoped announcements)
 *   • announcements on all three scope levels (تخصص/سنة/فوج)
 *
 * Usage: node scripts/r52-seed.mjs   (server must run on :3000, empty DB OK)
 */
const BASE = "http://localhost:3000";

async function api(jar, path, init = {}) {
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
  let body = {};
  try { body = await res.json(); } catch { /* non-json */ }
  return { status: res.status, body };
}

function iso(deltaDays) {
  const d = new Date();
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().split("T")[0];
}

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();

  // 1. base structure (idempotent)
  const inst = await db.institution.create({ data: { nameAr: "المدرسة العليا للأساتذة - بوزريعة" } }).catch(() => null);
  const institution = inst ?? await db.institution.findFirstOrThrow();
  const spec = await db.specialty.create({
    data: { institutionId: institution.id, nameAr: "اللغة والأدب العربي", code: "ARB" },
  }).catch(() => null);
  const specialty = spec ?? await db.specialty.findFirstOrThrow();
  const year = await db.academicYear.create({
    data: { specialtyId: specialty.id, yearName: "السنة الأولى", semester: 1 },
  }).catch(() => null);
  const academicYear = year ?? await db.academicYear.findFirstOrThrow();

  // 2. courses
  const courseNames = ["النحو والتطبيق", "الأدب الجاهلي", "البلاغة"];
  const courses = [];
  for (let i = 0; i < courseNames.length; i++) {
    const existing = await db.moduleCourse.findFirst({ where: { name: courseNames[i] } });
    const c = existing ?? await db.moduleCourse.create({
      data: {
        specialtyId: specialty.id, academicYearId: academicYear.id,
        name: courseNames[i], code: `ARB1${i}`, coefficient: 2, credits: 4,
        professorName: `أ. ${["مرابط", "بوزيد", "حمداني"][i]}`,
        description: `مقياس ${courseNames[i]} — وصف تجريبي للتحقق.`,
      },
    });
    courses.push(c);
  }
  console.log("courses:", courses.map((c) => c.id));

  // 3. OWNER via the real API
  const jar = {};
  const fullName = "مالك التحقق";
  const email = "r52-owner@test.dz";
  const up = await api(jar, "/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ fullName, email }),
  });
  let ownerJar = jar;
  if (up.status !== 200) {
    // already registered (idempotent re-run) → sign in instead
    ownerJar = {};
    const si = await api(ownerJar, "/api/auth/signin", {
      method: "POST",
      body: JSON.stringify({ fullName, email }),
    });
    console.log("signin:", si.status);
  }
  console.log("owner role:", JSON.stringify(up.body.user?.role ?? "existing"));
  const ob = await api(ownerJar, "/api/onboarding/complete", {
    method: "POST",
    body: JSON.stringify({ fullName, email, institutionId: institution.id, specialtyId: specialty.id, academicYearId: academicYear.id, mode: "initial" }),
  });
  console.log("onboarding:", ob.status);

  // 4. cohort + student member (so the group screen + فوج scope have data)
  const ownerCookie = ownerJar.cookie; // keep the OWNER session separate
  const cohort = await db.cohortGroup.create({
    data: { specialtyId: specialty.id, academicYearId: academicYear.id, groupName: "الفوج 01" },
  }).catch(() => null);
  const cohortGroup = cohort ?? await db.cohortGroup.findFirstOrThrow();
  const studentUp = await api({}, "/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ fullName: "طالبة التحقق", email: "r52-student@test.dz" }),
  });
  console.log("student signup:", studentUp.status);
  const student = await db.appUser.findFirstOrThrow({ where: { email: "r52-student@test.dz" } });
  await db.appUser.update({
    where: { id: student.id },
    data: { scopeCohortGroupId: cohortGroup.id, scopeAcademicYearId: academicYear.id, yearName: academicYear.yearName },
  });
  console.log("cohort:", cohortGroup.id, "student:", student.id);

  // 5. course-scoped library files (واجب / اختبار / محاضرة) with Drive-style links
  const libFiles = [
    [courses[0].id, "واجب النحو الأول — الحالات الإعرابية", "واجب"],
    [courses[0].id, "اختبار النحو الأوسط — نموذج", "اختبار"],
    [courses[1].id, "ملخص الأدب الجاهلي", "ملخص"],
    [courses[1].id, "واجب الأدب — تحليل قصيدة", "واجب"],
    [courses[2].id, "اختبار البلاغة الفصلي", "اختبار"],
  ];
  for (const [moduleId, title, category] of libFiles) {
    const exists = await db.libraryReference.findFirst({ where: { title } });
    if (exists) continue;
    await db.libraryReference.create({
      data: {
        specialtyId: specialty.id, moduleId, title, category,
        author: "إدارة التخصص", fileFormat: "PDF", description: `ملف ${category} تجريبي مرتبط بالمقياس.`,
        downloadUrl: "https://drive.example/file-" + Math.random().toString(36).slice(2),
        fileSize: 1_200_000, storagePath: "drive-file-id-" + Math.random().toString(36).slice(2),
      },
    });
  }
  // specialty-wide files (no module) for the ملفاتي list
  for (const [title, category] of [
    ["كتاب البلاغة المرجعي", "كتاب مرجعي"],
    ["سلسلة تمارين النحو العامة", "سلسلة تمارين"],
    ["محاضرة التمهيد للسنة الأولى", "محاضرة"],
  ]) {
    const exists = await db.libraryReference.findFirst({ where: { title } });
    if (exists) continue;
    await db.libraryReference.create({
      data: {
        specialtyId: specialty.id, title, category, author: "الإدارة",
        fileFormat: "PDF", description: `ملف ${category} عام للتخصص.`,
        downloadUrl: "https://drive.example/pub-" + Math.random().toString(36).slice(2),
        fileSize: 900_000,
      },
    });
  }
  console.log("library files seeded");

  // round 55 fix — the onboarding API can create duplicate specialty rows,
  // so `specialty.id` above may NOT be the specialty the student is
  // assigned to (assignedSpecialtyId=1). Re-stamp every file with the
  // specialty of its course (module) — or specialty 1 for general files —
  // so students actually see the seeded library in «ملفاتي».
  const allCourses = await db.moduleCourse.findMany({ select: { id: true, specialtyId: true } });
  const specByCourse = new Map(allCourses.map((c) => [c.id, c.specialtyId]));
  for (const f of await db.libraryReference.findMany()) {
    const rightSpec = f.moduleId != null ? (specByCourse.get(f.moduleId) ?? 1) : 1;
    if (f.specialtyId !== rightSpec) {
      await db.libraryReference.update({ where: { id: f.id }, data: { specialtyId: rightSpec } });
    }
  }
  console.log("library files re-stamped to real specialties");

  // 6. assignments + exams metadata
  if ((await db.assignment.count()) === 0) {
    await db.assignment.create({ data: { moduleId: courses[0].id, title: "تحليل الجملة الفعلية", description: "حل التمارين ١٢–١٨", dueDate: iso(2), maxScore: 20 } });
    await db.assignment.create({ data: { moduleId: courses[1].id, title: "بحث في المعلقات", description: "بحث قصير حول امرئ القيس", dueDate: iso(9), maxScore: 20 } });
  }
  if ((await db.exam.count()) === 0) {
    await db.exam.create({ data: { moduleId: courses[0].id, moduleName: courses[0].name, title: "اختبار النحو الفصلي", examDate: iso(3), time: "10:00", room: "القاعة 12", coefficient: 2 } });
  }
  console.log("assignments + exams seeded");

  // 7. announcements on all three scopes (via the API so fan-out runs)
  const existingAnn = await db.announcement.count();
  if (existingAnn === 0) {
    const a1 = await api({ cookie: ownerCookie }, "/api/announcements", {
      method: "POST",
      body: JSON.stringify({ title: "انطلاق الدعم التربوي", content: "تُنطلق حصص الدعم لجميع طلبة التخصص يوم الأحد القادم.", urgency: "هام", scopeLevel: "تخصص كامل" }),
    });
    console.log("ann specialty:", a1.status);
    const a2 = await api({ cookie: ownerCookie }, "/api/announcements", {
      method: "POST",
      body: JSON.stringify({ title: "جدولة اختبار السنة الأولى", content: "اختبار السنة الأولى سيُجدول الأسبوع القادم — راقب الجدول.", urgency: "عام", scopeLevel: "سنة دراسية", scopeTargetId: academicYear.id }),
    });
    console.log("ann year:", a2.status);
    const a3 = await api({ cookie: ownerCookie }, "/api/announcements", {
      method: "POST",
      body: JSON.stringify({ title: "اجتماع ممثلي الفوج الأول", content: "اجتماع ممثلي الفوج 01 مع الإدارة لمناقشة ملف التخرج.", urgency: "عاجل", scopeLevel: "فوج", scopeTargetId: cohortGroup.id }),
    });
    console.log("ann cohort:", a3.status);
  }

  console.log("OWNER-COOKIE:", ownerCookie);
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
