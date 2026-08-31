/**
 * Acceptance-test seed for Talib (local SQLite).
 * Creates the ACADEMIC STRUCTURE needed to reproduce the report's test:
 *   - 2 institutions, 2 specialties (A / B), years 1-5, tracks PEP/PEM/PES
 *   - 1 study group per (specialty, year) + 2 cohorts inside each
 * Users are NOT seeded — they are created through the real signup API
 * during the acceptance test (per project rules: no hardcoded users).
 *
 * Run: bun run scripts/seed-acceptance.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  console.log("🌱 Seeding acceptance-test structure...");

  // wipe (FK-safe order: children first, users before specialties)
  await db.joinRequest.deleteMany();
  await db.exam.deleteMany();
  await db.assignment.deleteMany();
  await db.lecture.deleteMany();
  await db.cachedCourseMaterial.deleteMany();
  await db.studentGrade.deleteMany();
  await db.scheduleItem.deleteMany();
  await db.announcement.deleteMany();
  await db.studyGroup.deleteMany();
  await db.cohortGroup.deleteMany();
  await db.libraryReference.deleteMany();
  await db.deviceSession.deleteMany();
  await db.appUser.deleteMany();
  await db.studentProfile.deleteMany();
  await db.moduleCourse.deleteMany();
  await db.academicTrack.deleteMany();
  await db.academicYear.deleteMany();
  await db.specialty.deleteMany();
  await db.institution.deleteMany();

  // institutions
  const ens = await db.institution.create({
    data: { nameAr: "المدرسة العليا للأساتذة - بوزريعة", type: "المدرسة العليا للأساتذة", city: "الجزائر" },
  });
  const univ2 = await db.institution.create({
    data: { nameAr: "جامعة وهران للآداب", type: "جامعة", city: "وهران" },
  });

  // specialties
  const specA = await db.specialty.create({
    data: {
      institutionId: ens.id, nameAr: "اللغة والأدب العربي", code: "AR-LIT",
      iconName: "menu_book", description: "تخصص أ",
      institution: "المدرسة العليا للأساتذة - بوزريعة (ENS)", faculty: "قسم اللغة والأدب العربي",
    },
  });
  const specB = await db.specialty.create({
    data: {
      institutionId: univ2.id, nameAr: "اللغة الفرنسية", code: "FR-LIT",
      iconName: "book", description: "تخصص ب",
      institution: "جامعة وهران للآداب", faculty: "قسم اللغات الأجنبية",
    },
  });

  const yearNames = ["السنة الأولى (L1)", "السنة الثانية (L2)", "السنة الثالثة (L3)", "السنة الرابعة (L4)", "السنة الخامسة (L5)"];

  for (const [spec, prefix] of [[specA, "AR"], [specB, "FR"]] as const) {
    // tracks
    const pep = await db.academicTrack.create({ data: { specialtyId: spec.id, trackNameAr: "أستاذ التعليم الابتدائي (PEP)", code: `${prefix}-PEP` } });
    await db.academicTrack.create({ data: { specialtyId: spec.id, trackNameAr: "أستاذ التعليم المتوسط (PEM)", code: `${prefix}-PEM` } });
    await db.academicTrack.create({ data: { specialtyId: spec.id, trackNameAr: "أستاذ التعليم الثانوي (PES)", code: `${prefix}-PES` } });

    // years + groups + cohorts
    for (let i = 0; i < 5; i++) {
      const year = await db.academicYear.create({
        data: { specialtyId: spec.id, yearName: yearNames[i], semester: 1 },
      });
      const group = await db.studyGroup.create({
        data: {
          specialtyId: spec.id, academicYearId: year.id, trackId: pep.id,
          groupName: `المجموعة 01 - ${prefix}`, description: "مجموعة افتراضية",
        },
      });
      await db.cohortGroup.create({ data: { specialtyId: spec.id, academicYearId: year.id, trackId: pep.id, groupId: group.id, groupName: "الفوج 01", subGroup: "" } });
      await db.cohortGroup.create({ data: { specialtyId: spec.id, academicYearId: year.id, trackId: pep.id, groupId: group.id, groupName: "الفوج 02", subGroup: "" } });
    }
  }

  console.log("✅ Seed done: 2 institutions, 2 specialties, 10 years, 6 tracks, 10 groups, 20 cohorts");
  console.log(`   specA (اللغة والأدب العربي) id=${specA.id}, specB (اللغة الفرنسية) id=${specB.id}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
