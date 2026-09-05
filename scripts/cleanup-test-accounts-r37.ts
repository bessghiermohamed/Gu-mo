/**
 * round 37 housekeeping: remove the two walkthrough accounts
 * (owner37 / student37) and every data row they own.
 * FK-cascaded rows (student_profiles, prefs, read states) go automatically.
 * Run: bun run scripts/cleanup-test-accounts-r37.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const TEST_EMAILS = ["owner37@test.local", "student37@test.local"];

async function main() {
  for (const email of TEST_EMAILS) {
    const user = await db.appUser.findFirst({
      where: { email },
      select: { id: true, email: true, role: true },
    });
    if (!user) {
      console.log(`skip (missing): ${email}`);
      continue;
    }
    // personal schedule items have no FK relation — delete explicitly first
    await db.personalScheduleItem.deleteMany({ where: { userId: user.id } });
    await db.appUser.delete({ where: { id: user.id } });
    console.log(`deleted: ${email} (role=${user.role})`);
  }
  const users = await db.appUser.count();
  console.log({ usersRemaining: users });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
