/**
 * Round 39 — walkthrough helper.
 * Mode "ids": print structure ids (for onboarding).
 * Mode "seed": create course + exam + assignment + library material +
 *              telegram lesson item for the OWNER created during the
 *              browser walkthrough (idempotent: wipes r39 course first).
 * Mode "cleanup": wipe r39 test accounts + their content.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const mode = process.argv[2] ?? "ids";

async function ids() {
  const inst = await db.institution.findMany({ select: { id: true, nameAr: true } });
  const spec = await db.specialty.findMany({ select: { id: true, nameAr: true, institutionId: true } });
  const year = await db.academicYear.findMany({ select: { id: true, yearName: true, specialtyId: true } });
  const track = await db.academicTrack.findMany({ select: { id: true, trackNameAr: true, specialtyId: true } });
  const cohort = await db.cohortGroup.findMany({ select: { id: true, groupName: true, academicYearId: true } });
  console.log(JSON.stringify({ inst, spec, year, track, cohort }, null, 0));
}

/** courses named with the r39 marker + their dependent rows */
async function r39CourseIds() {
  const courses = await db.moduleCourse.findMany({
    where: { code: { startsWith: "R39-" } },
    select: { id: true },
  });
  return courses.map((c) => c.id);
}

async function seed(ownerId: number) {
  const owner = await db.appUser.findUnique({ where: { id: ownerId } });
  if (!owner) throw new Error(`no user ${ownerId}`);

  // wipe previous r39 content (idempotent re-runs)
  const oldIds = await r39CourseIds();
  for (const id of oldIds) {
    await db.telegramItem.deleteMany({ where: { moduleId: id } });
    await db.exam.deleteMany({ where: { moduleId: id } });
    await db.assignment.deleteMany({ where: { moduleId: id } });
    await db.libraryReference.deleteMany({ where: { moduleId: id } });
    await db.moduleCourse.delete({ where: { id } });
  }

  const course = await db.moduleCourse.create({
    data: {
      name: "علم اللغة العام",
      code: "R39-LING",
      professorName: "د. كريم بلقاسم",
      coefficient: 3,
      semester: 1,
      specialtyId: owner.assignedSpecialtyId!,
      academicYearId: owner.scopeAcademicYearId!,
      description: "مقياس يجمع الدروس والمذكرات والاختبارات والواجبات في مكان واحد.",
    },
  });

  const exam = await db.exam.create({
    data: {
      moduleId: course.id,
      moduleName: course.name,
      title: "امتحان منتصف السداسي",
      examDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      time: "10:30",
      room: "قاعة 12",
      coefficient: 3,
    },
  });

  const assignment = await db.assignment.create({
    data: {
      moduleId: course.id,
      title: "تحليل نص من شعر المتنبي",
      dueDate: new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10),
      description:
        "اكتب تحليلاً بلاغياً لنص «الخيل والليل والبيداء تعرفي» في صفحتين:\n" +
        "١) بيّن الصور البلاغية المستعملة.\n" +
        "٢) اربط بين المعنى والوزن الموسيقي.\n" +
        "٣) التسليم ورقياً قبل نهاية الأسبوع.",
      maxScore: 20,
    },
  });

  const material = await db.libraryReference.create({
    data: {
      specialtyId: owner.assignedSpecialtyId!,
      moduleId: course.id,
      title: "مذكرة علم اللغة — المحاضرة ١",
      author: owner.fullName,
      category: "محاضرة",
      fileFormat: "PDF",
      downloadUrl: "https://example.com/r39-lecture-1.pdf",
      description: "مقدمة في علم اللغة: الظاهرة اللغوية ومستويات التحليل.",
    },
  });

  const lesson = await db.telegramItem.create({
    data: {
      sourceId: null,
      tgMessageId: 0,
      mediaGroupId: "",
      kind: "link",
      titleAr: "محاضرة تمهيدية — ملخص الفصل الأول",
      captionText: "ملخص للمحاضرة الأولى مع تمارين تطبيقية.",
      fileName: "",
      mimeType: "",
      fileId: "",
      fileUniqueId: "",
      sizeBytes: 0,
      link: "https://t.me/talib_example/12",
      specialtyId: owner.assignedSpecialtyId!,
      moduleId: course.id,
      itemType: "دروس",
    },
  });

  console.log("SEEDED " + JSON.stringify({ courseId: course.id, examId: exam.id, assignmentId: assignment.id, materialId: material.id, lessonId: lesson.id }));
}

async function cleanup() {
  const ids2 = await r39CourseIds();
  for (const id of ids2) {
    await db.telegramItem.deleteMany({ where: { moduleId: id } });
    await db.exam.deleteMany({ where: { moduleId: id } });
    await db.assignment.deleteMany({ where: { moduleId: id } });
    await db.libraryReference.deleteMany({ where: { moduleId: id } });
    await db.moduleCourse.delete({ where: { id } });
  }
  // personal schedule items created during the walkthrough
  await db.personalScheduleItem.deleteMany({
    where: { notes: { contains: "امتحان منتصف السداسي" } },
  });
  // r39 test accounts
  for (const email of ["owner39@test.talib", "student39@test.talib"]) {
    const u = await db.appUser.findUnique({ where: { email } });
    if (u) {
      await db.personalScheduleItem.deleteMany({ where: { userId: u.id } });
      await db.appUser.delete({ where: { id: u.id } });
    }
  }
  const users = await db.appUser.count();
  const courses = await db.moduleCourse.count();
  console.log("CLEANED " + JSON.stringify({ users, courses }));
}

async function main() {
  if (mode === "ids") await ids();
  else if (mode === "seed") await seed(Number(process.argv[3]));
  else if (mode === "cleanup") await cleanup();
  else throw new Error(`unknown mode ${mode}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
