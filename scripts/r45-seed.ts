/**
 * Round 45 — local seed for UI inspection: courses + schedule + exams +
 * announcements for specialty 1, only if empty (idempotent). Test-only.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const spec = await db.specialty.findFirstOrThrow();
  const year = await db.academicYear.findFirstOrThrow();

  if ((await db.moduleCourse.count()) === 0) {
    const names = [
      { name: "التحليل الرياضي", code: "AN101", semester: 1, coefficient: 4 },
      { name: "الجبر الخطي", code: "AL102", semester: 1, coefficient: 3 },
      { name: "الإنغليزية", code: "EN103", semester: 1, coefficient: 1 },
      { name: "الإحصاء الاحتمالات", code: "ST201", semester: 2, coefficient: 3 },
    ];
    for (const c of names) {
      const created = await db.moduleCourse.create({
        data: {
          name: c.name, code: c.code, semester: c.semester, coefficient: c.coefficient,
          specialtyId: spec.id, academicYearId: year.id,
        },
      });
      // one exam per first course
      if (c.code === "AN101") {
        const plus7 = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
        await db.exam.create({
          data: {
            moduleId: created.id, moduleName: c.name, title: "اختبار الفصل الأول",
            examDate: plus7, time: "10:00", room: "قاعة المركزية", coefficient: 4,
          },
        });
      }
    }
    console.log("seeded courses + exam");
  }

  if ((await db.scheduleItem.count()) === 0) {
    const rows = [
      { dayOfWeek: 1, startTime: "08:00", endTime: "09:30", moduleName: "التحليل الرياضي", type: "محاضرة", room: "قاعة 12", professor: "د. بن علي" },
      { dayOfWeek: 1, startTime: "10:00", endTime: "11:30", moduleName: "الجبر الخطي", type: "TD", room: "قاعة 5", professor: "د. مرابط" },
      { dayOfWeek: 2, startTime: "08:00", endTime: "09:30", moduleName: "الإنغليزية", type: "محاضرة", room: "المخبر 3", professor: "أ. سعاد" },
      { dayOfWeek: 4, startTime: "13:00", endTime: "14:30", moduleName: "الإحصاء الاحتمالات", type: "TP", room: "المخبر 1", professor: "د. حكيم" },
    ];
    for (const r of rows) {
      await db.scheduleItem.create({ data: { ...r, specialtyId: spec.id, academicYearId: year.id } });
    }
    console.log("seeded schedule");
  }

  if ((await db.announcement.count()) === 0) {
    await db.announcement.create({
      data: {
        title: "انطلاق حصص مراجعة التحليل",
        content: "تبدأ حصص المراجعة يوم الخميس الساعة 14:00 في القاعة 8.",
        urgency: "مهم", specialtyId: spec.id, author: "إدارة التخصص",
        date: new Date().toISOString().slice(0, 10),
      },
    });
    console.log("seeded announcements");
  }

  console.log("seed done:", {
    courses: await db.moduleCourse.count(),
    schedule: await db.scheduleItem.count(),
    exams: await db.exam.count(),
    announcements: await db.announcement.count(),
  });
}

main().finally(() => db.$disconnect());
