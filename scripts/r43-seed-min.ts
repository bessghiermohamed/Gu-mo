/**
 * Round 43 — minimal local seed for API probes: one institution + specialty
 * + academic year, only if the tables are empty (idempotent).
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const instCount = await db.institution.count();
  if (instCount === 0) {
    await db.institution.create({ data: { nameAr: "جامعة الاختبار" } });
    console.log("created institution");
  }
  const specCount = await db.specialty.count();
  if (specCount === 0) {
    const inst = await db.institution.findFirstOrThrow();
    await db.specialty.create({
      data: { nameAr: "تخصص الاختبار", institutionId: inst.id, code: "TEST" },
    });
    console.log("created specialty");
  }
  const yearCount = await db.academicYear.count();
  if (yearCount === 0) {
    const spec = await db.specialty.findFirstOrThrow();
    await db.academicYear.create({
      data: { yearName: "السنة الأولى", specialtyId: spec.id, semester: 1 },
    });
    console.log("created academic year");
  }
  console.log("seed done:", {
    institutions: await db.institution.count(),
    specialties: await db.specialty.count(),
    years: await db.academicYear.count(),
  });
}

main().finally(() => db.$disconnect());
