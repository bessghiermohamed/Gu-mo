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

  // ============================================================
  // round 4: second institution/specialty (وهران) + tracks + study
  // groups. The local seed was missing these — the acceptance suite
  // (scripts/acceptance-test.sh) was written against a richer DB that
  // matched the Supabase round-2 migration (default group per
  // specialty/year + tracks). Without them the suite cannot reproduce
  // the 48/48 result. Still STRUCTURAL data only — no users, no
  // hardcoded student data (per project rules).
  // ============================================================
  const ensOran = await db.institution.create({
    data: {
      nameAr: "المدرسة العليا للأساتذة - وهران",
      type: "المدرسة العليا للأساتذة",
      city: "وهران",
    },
  });

  const frenchLang = await db.specialty.create({
    data: {
      institutionId: ensOran.id,
      nameAr: "اللغة الفرنسية",
      code: "FR-LANG",
      iconName: "translate",
      description: "تخصص اللغة الفرنسية - المدرسة العليا للأساتذة وهران",
      institution: "المدرسة العليا للأساتذة - وهران (ENS)",
      faculty: "قسم اللغة الفرنسية",
    },
  });

  // Tracks (الملامح) — presets per specialty.
  // Spec A: 1 track. Spec B: 3 tracks (test picks tracks[2]).
  const trackDefs: Array<{ specId: number; nameAr: string; code: string }> = [
    { specId: arabicLit.id, nameAr: "أستاذ التعليم الابتدائي (PEP)", code: "PEP" },
    { specId: frenchLang.id, nameAr: "أستاذ التعليم الابتدائي (PEP)", code: "PEP" },
    { specId: frenchLang.id, nameAr: "أستاذ التعليم المتوسط (PEM)", code: "PEM" },
    { specId: frenchLang.id, nameAr: "أستاذ التعليم الثانوي (PES)", code: "PES" },
  ];
  for (const td of trackDefs) {
    await db.academicTrack.create({
      data: { specialtyId: td.specId, trackNameAr: td.nameAr, code: td.code },
    });
  }

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

  // Spec B: 3 years (the suite onboards its student into year 3 = years[2]).
  const yearsB = await Promise.all(
    ["السنة الأولى (L1)", "السنة الثانية (L2)", "السنة الثالثة (L3)"].map(
      (name) =>
        db.academicYear.create({
          data: { specialtyId: frenchLang.id, yearName: name, semester: 1 },
        })
    )
  );

  // Default shared study group per (specialty, year) — trackId null means
  // shared by ALL tracks of that (specialty, year), mirroring the Supabase
  // round-2 migration. Cohorts (الأفواج) live INSIDE the group.
  const allYears: Array<{ yearId: number; specId: number; code: string }> = [
    ...years.map((y) => ({ yearId: y.id, specId: arabicLit.id, code: "AR" })),
    ...yearsB.map((y) => ({ yearId: y.id, specId: frenchLang.id, code: "FR" })),
  ];

  let cohortCount = 0;
  for (const { yearId, specId, code } of allYears) {
    const group = await db.studyGroup.create({
      data: {
        specialtyId: specId,
        academicYearId: yearId,
        trackId: null,
        groupName: `المجموعة 01 - ${code}`,
        description: "المجموعة الافتراضية المشتركة لكل ملامح التخصص والسنة",
      },
    });
    for (let i = 1; i <= 3; i++) {
      await db.cohortGroup.create({
        data: {
          specialtyId: specId,
          academicYearId: yearId,
          trackId: null,
          groupId: group.id,
          groupName: `الفوج 0${i}`,
        },
      });
      cohortCount++;
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
  console.log(`   - 2 institutions: ${ens.nameAr} + ${ensOran.nameAr}`);
  console.log(`   - 2 specialties: ${arabicLit.nameAr} + ${frenchLang.nameAr}`);
  console.log(`   - ${years.length + yearsB.length} academic years (5 + 3)`);
  console.log(`   - ${trackDefs.length} tracks (الملامح)`);
  console.log(`   - ${allYears.length} default study groups`);
  console.log(`   - ${cohortCount} cohorts (dynamic, inside groups)`);
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
