/**
 * Seed data for Talib.
 *
 * IMPORTANT (per project rules):
 * - No hardcoded student names, student IDs, cohort numbers, or emails.
 * - Only structural seed (institutions, specialties, sample academic years) is created.
 * - Cohorts are created dynamically per specialty/year, never "fixed cohort #3".
 * - The first OWNER account must be created via the onboarding screen.
 *
 * Run with: bun run db:seed
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Talib database...");

  await db.notificationReadState.deleteMany();
  await db.contentUploadLog.deleteMany();
  await db.deviceSession.deleteMany();
  await db.appUser.deleteMany();
  await db.classPoll.deleteMany();
  await db.studentIssueReport.deleteMany();
  await db.attendanceRecord.deleteMany();
  await db.academicCalendarEvent.deleteMany();
  await db.libraryReference.deleteMany();
  await db.studentNote.deleteMany();
  await db.studentProfile.deleteMany();
  await db.announcement.deleteMany();
  await db.studentGrade.deleteMany();
  await db.exam.deleteMany();
  await db.scheduleItem.deleteMany();
  await db.assignment.deleteMany();
  await db.cachedCourseMaterial.deleteMany();
  await db.lecture.deleteMany();
  await db.moduleCourse.deleteMany();
  await db.cohortGroup.deleteMany();
  await db.academicYear.deleteMany();
  await db.specialty.deleteMany();
  await db.institution.deleteMany();

  const ens = await db.institution.create({
    data: {
      nameAr: "المدرسة العليا للأساتذة - بوزريعة",
      type: "المدرسة العليا للأساتذة",
      city: "الجزائر",
    },
  });

  const arabicLit = await db.specialty.create({
    data: {
      institutionId: ens.id,
      nameAr: "اللغة والأدب العربي",
      code: "AR-LIT",
      iconName: "menu_book",
      description: "تخصص اللغة والأدب العربي - المدرسة العليا للأساتذة",
      institution: "المدرسة العليا للأساتذة - بوزريعة (ENS)",
      faculty: "قسم اللغة والأدب العربي",
    },
  });

  const years = await Promise.all(
    [
      { name: "السنة الأولى (L1)", sem: 1 },
      { name: "السنة الثانية (L2)", sem: 1 },
      { name: "السنة الثالثة (L3)", sem: 1 },
      { name: "السنة الرابعة (L4)", sem: 1 },
      { name: "السنة الخامسة (L5)", sem: 1 },
    ].map((y) =>
      db.academicYear.create({
        data: {
          specialtyId: arabicLit.id,
          yearName: y.name,
          semester: y.sem,
        },
      })
    )
  );

  for (const year of years) {
    for (let i = 1; i <= 3; i++) {
      await db.cohortGroup.create({
        data: {
          specialtyId: arabicLit.id,
          academicYearId: year.id,
          groupName: `الفوج 0${i}`,
        },
      });
    }
  }

  await db.academicCalendarEvent.createMany({
    data: [
      {
        title: "بداية السداسي الأول",
        eventType: "محطة رسمية",
        startDate: new Date().toISOString().split("T")[0],
        isCurrent: true,
      },
      {
        title: "عطلة منتصف السداسي",
        eventType: "عطلة جامعية",
        startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0],
      },
    ],
  });

  console.log("✅ Seed completed:");
  console.log(`   - 1 institution: ${ens.nameAr}`);
  console.log(`   - 1 specialty: ${arabicLit.nameAr}`);
  console.log(`   - ${years.length} academic years`);
  console.log(`   - ${years.length * 3} cohorts (dynamic)`);
  console.log("   - 2 calendar events");
  console.log("");
  console.log("⚠️  No users created. First user must register via the app.");
  console.log("   The first registered user becomes OWNER automatically.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
