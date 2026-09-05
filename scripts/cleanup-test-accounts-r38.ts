/**
 * round 38 housekeeping: remove the walkthrough accounts (owner38/student38)
 * — join requests + notifications cascade with the user rows.
 * Run: bun run scripts/cleanup-test-accounts-r38.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const TEST_EMAILS = ["owner38@test.local", "student38@test.local"];

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
    await db.personalScheduleItem.deleteMany({ where: { userId: user.id } });
    await db.appUser.delete({ where: { id: user.id } });
    console.log(`deleted: ${email} (role=${user.role})`);
  }
  const users = await db.appUser.count();
  const joinRequests = await db.joinRequest.count();
  console.log({ usersRemaining: users, joinRequestsRemaining: joinRequests });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
