/**
 * Round 44 housekeeping: remove the local UI-test account + probe leftovers
 * from the dev DB (probe deletes its own account; this is the safety net).
 *
 * Run: DATABASE_URL="file:./dev.db" bun run scripts/cleanup-test-accounts-r44.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const TEST_EMAILS = ["r44-ui-test@test.dz", "r44probe-@test.dz"];

async function main() {
  for (const pattern of TEST_EMAILS) {
    const users = await db.appUser.findMany({
      where: { email: { startsWith: pattern.replace("@test.dz", "") } },
      select: { id: true, email: true, role: true },
    });
    if (users.length === 0) {
      console.log(`• ${pattern}*: none found (already clean)`);
      continue;
    }
    for (const user of users) {
      await db.appUser.delete({ where: { id: user.id } });
      console.log(`✓ removed ${user.email} (id=${user.id}, role=${user.role})`);
    }
  }
  console.log("remaining users:", await db.appUser.count());
}

main().finally(() => db.$disconnect());
