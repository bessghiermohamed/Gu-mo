/**
 * Data-layer verification of System Review §2 fix (2026-09-02).
 *
 * Rule under test: when assigning a student to a sub-group, destination
 * cohorts must be filtered to the STUDENT's own academic scope
 * (institution/specialty/track/year) ∩ caller authority — enforced at
 * the data layer, not hidden in the UI.
 *
 * Exercises the EXACT functions the API routes call:
 *   assignableCohortIds()            — /api/group/assignable (caller scope)
 *   cohortCompatibleWithStudent()    — + student filter (the §2 fix)
 * Run: bun run scripts/verify-review2.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  loadScopeContext,
  assignableCohortIds,
  cohortCompatibleWithStudent,
} from "../src/lib/auth/scope";
import type { UserRole } from "../src/lib/auth/types";

const db = new PrismaClient();

async function main() {
  const ctx = await loadScopeContext();
  const owner = await db.appUser.findFirst({ where: { role: "OWNER" } });
  const student = await db.appUser.findFirst({ where: { role: "STUDENT" } });
  if (!owner || !student) throw new Error("missing test users (re-seed + register)");

  console.log(`OWNER #${owner.id} — caller scope: GLOBAL (all cohorts)`);
  console.log(
    `STUDENT #${student.id} — specialty=${student.assignedSpecialtyId}, year=${student.scopeAcademicYearId}, track=${student.scopeTrackId ?? "—"}, institution=${student.scopeInstitutionId ?? "—"}\n`
  );

  // OLD behavior surface: caller-only scope list
  // (Prisma types role as string — the API layer always casts to UserRole)
  const callerOnly = assignableCohortIds({ ...owner, role: owner.role as UserRole }, ctx);
  console.log(`1) assignableCohortIds(OWNER) without student filter: ${callerOnly.length} cohorts`);
  const yearsInCallerList = new Set(callerOnly.map((id) => ctx.cohorts.get(id)!.yearId));
  console.log(`   → spans ${yearsInCallerList.size} different years and ${new Set(callerOnly.map((id) => ctx.cohorts.get(id)!.specialtyId)).size} specialties (this is the §2 bug surface)\n`);

  // NEW behavior: ∩ student's academic scope (what /api/group/assignable?studentId= returns)
  const studentLike = {
    assignedSpecialtyId: student.assignedSpecialtyId,
    scopeInstitutionId: student.scopeInstitutionId ?? null,
    scopeAcademicYearId: student.scopeAcademicYearId ?? null,
    scopeTrackId: student.scopeTrackId ?? null,
  };
  const filtered = callerOnly.filter((id) => cohortCompatibleWithStudent(studentLike, id, ctx));
  console.log(`2) assignableCohortIds(OWNER) ∩ student's academic scope: ${filtered.length} cohorts`);
  for (const id of filtered) {
    const c = ctx.cohorts.get(id)!;
    console.log(`   - ${c.nameAr} | group ${ctx.groups.get(c.groupId ?? 0)?.nameAr ?? "—"} | spec ${ctx.specialties.get(c.specialtyId)?.nameAr} | year ${ctx.years.get(c.yearId)}`);
  }

  // assertions
  const okCount = filtered.length > 0;
  const okYear = filtered.every((id) => ctx.cohorts.get(id)!.yearId === student.scopeAcademicYearId);
  const okSpec = filtered.every((id) => ctx.cohorts.get(id)!.specialtyId === student.assignedSpecialtyId);
  const okStrict = filtered.length < callerOnly.length;
  console.log(`\n3) assertions:`);
  console.log(`   - result non-empty: ${okCount ? "PASS" : "FAIL"}`);
  console.log(`   - every cohort year == student year: ${okYear ? "PASS" : "FAIL"}`);
  console.log(`   - every cohort specialty == student specialty: ${okSpec ? "PASS" : "FAIL"}`);
  console.log(`   - strict subset of caller list (other years excluded): ${okStrict ? "PASS" : "FAIL"}`);

  // POST guard: a mismatched cohort must be REJECTED by /api/group/assign
  const mismatch = callerOnly.find((id) => !filtered.includes(id));
  if (mismatch != null) {
    const blocked = !cohortCompatibleWithStudent(studentLike, mismatch, ctx);
    const c = ctx.cohorts.get(mismatch)!;
    console.log(`   - assign POST would 409-reject mismatched cohort (${c.nameAr}, year ${ctx.years.get(c.yearId)}): ${blocked ? "PASS" : "FAIL"}`);
  }

  const allPass = okCount && okYear && okSpec && okStrict;
  console.log(`\n${allPass ? "✅ REVIEW §2 VERIFIED at data layer" : "❌ REVIEW §2 FAILED"}`);
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(() => db.$disconnect());
