import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const users = await db.appUser.count();
  const institutions = await db.institution.count();
  const specialties = await db.specialty.count();
  const years = await db.academicYear.count();
  const tracks = await db.academicTrack.count();
  const cohorts = await db.cohortGroup.count();
  const groups = await db.studyGroup.count();
  const exams = await db.exam.count();
  const announcements = await db.announcement.count();
  const prefsTable = await db.$queryRawUnsafe(`SELECT name FROM sqlite_master WHERE type='table' AND name='notification_prefs'`);
  console.log({ users, institutions, specialties, years, tracks, cohorts, groups, exams, announcements, prefsTable });
}
main().then(() => process.exit(0));
