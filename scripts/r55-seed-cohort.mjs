/**
 * r55 verification helper — replicate the owner's exact scenario:
 * «حسابي في الفوج 7 من المجموعة 2» — the cohort becomes «الفوج 07»,
 * belongs to StudyGroup «المجموعة 2», and the student (and rep) get
 * scopeGroupId pointing at it. Idempotent.
 */
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const specialty = await db.specialty.findFirstOrThrow();
const year = await db.academicYear.findFirstOrThrow();

// 2. Cohort «الفوج 07» inside it (the seed's cohort is reused/renamed)
const cohort = await db.cohortGroup.findFirst({ orderBy: { id: "asc" } });
if (!cohort) throw new Error("no cohort found — run r52-seed first");

// 1. StudyGroup «المجموعة 2» scoped to THE COHORT's specialty/year
let study = await db.studyGroup.findFirst({ where: { groupName: "المجموعة 2", specialtyId: cohort.specialtyId } });
if (!study) {
  study = await db.studyGroup.create({
    data: { specialtyId: cohort.specialtyId, academicYearId: cohort.academicYearId, groupName: "المجموعة 2", description: "مجموعة التحقق للجولة 55" },
  });
  console.log("created study group:", study.id);
} else {
  console.log("study group exists:", study.id);
}
await db.cohortGroup.update({
  where: { id: cohort.id },
  data: { groupName: "الفوج 07", groupId: study.id },
});
console.log("cohort", cohort.id, "→ «الفوج 07» in «المجموعة 2»");

// 3. All members of the cohort get scopeGroupId (المجموعة) for profile parity
const res = await db.appUser.updateMany({
  where: { scopeCohortGroupId: cohort.id },
  data: { scopeGroupId: study.id },
});
console.log("linked", res.count, "users to the study group");

await db.$disconnect();
