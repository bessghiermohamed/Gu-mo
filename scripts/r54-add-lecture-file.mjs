/**
 * r54 verification helper — add one «محاضرة» course-scoped file to the first
 * course so the lessons-tab display can be verified in the browser.
 * Idempotent: skips if the title already exists.
 */
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const title = "محاضرة النحو الأولى — الإعراب والبناء";
const course = await db.moduleCourse.findFirst({ orderBy: { id: "asc" } });
if (!course) throw new Error("no course found");

const exists = await db.libraryReference.findFirst({ where: { title } });
if (exists) {
  console.log("already exists:", title, "→ module:", exists.moduleId);
} else {
  const created = await db.libraryReference.create({
    data: {
      specialtyId: course.specialtyId,
      moduleId: course.id,
      title,
      category: "محاضرة",
      author: "إدارة التخصص",
      fileFormat: "PDF",
      description: "ملف محاضرة تجريبي مرتبط بالمقياس — يظهر داخل تبويب الدروس.",
      downloadUrl: "https://drive.example/lecture-" + Math.random().toString(36).slice(2),
      fileSize: 1_500_000,
      storagePath: "drive-file-id-" + Math.random().toString(36).slice(2),
    },
  });
  console.log("created:", created.title, "→ module:", created.moduleId);
}
console.log("course:", course.id, course.name);
await db.$disconnect();
