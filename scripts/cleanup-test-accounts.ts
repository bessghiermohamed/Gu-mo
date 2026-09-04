/**
 * round 27 housekeeping: remove local test artifacts from the dev DB.
 *
 * Removes the round-26 acceptance-test account (test-student-26@talib.dev)
 * and every data row it owns. FK-cascaded rows (notification prefs, read
 * states, notifications) go automatically; personal schedule items have no
 * FK relation, so they are deleted explicitly first.
 *
 * Run: bun run scripts/cleanup-test-accounts.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const TEST_EMAILS = ["test-student-26@talib.dev"];

async function main() {
  for (const email of TEST_EMAILS) {
    const user = await db.appUser.findFirst({
      where: { email },
      select: { id: true, email: true, role: true },
    });
    if (!user) {
      console.log(`• ${email}: not found (already clean)`);
      continue;
    }
    const personal = await db.personalScheduleItem.deleteMany({ where: { userId: user.id } });
    await db.appUser.delete({ where: { id: user.id } }); // FK cascades handle the rest
    console.log(`✓ removed ${email} (id=${user.id}, role=${user.role}, personalSlots=${personal.count})`);
  }
  const left = await db.appUser.count();
  console.log(`→ remaining users in dev DB: ${left}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
