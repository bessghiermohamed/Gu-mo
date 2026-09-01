import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canManageRoles } from "@/lib/auth/permissions";
import { loadScopeContext, assignableCohortIds } from "@/lib/auth/scope";

/**
 * Cohorts the CALLER may assign/transfer students into (spec §4: "a
 * sub-group within the representative's scope"). Used by the direct-
 * assignment dialog to list destination sub-groups only.
 *
 * Response rows carry the parent group + year + specialty labels so the
 * UI can show "الفوج 02 — المجموعة 01 — السنة الثانية" without extra calls.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !canManageRoles(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const ctx = await loadScopeContext();
    const ids = assignableCohortIds(user, ctx);
    const cohorts = ids.map((id) => {
      const c = ctx.cohorts.get(id)!;
      return {
        id,
        nameAr: c.nameAr,
        groupId: c.groupId,
        groupName: c.groupId != null ? ctx.groups.get(c.groupId)?.nameAr ?? "" : "",
        yearId: c.yearId,
        yearName: ctx.years.get(c.yearId) ?? "",
        specialtyId: c.specialtyId,
        specialtyName: ctx.specialties.get(c.specialtyId)?.nameAr ?? "",
        trackId: c.trackId,
      };
    });
    return NextResponse.json({ cohorts });
  } catch {
    return NextResponse.json({ cohorts: [] });
  }
}
