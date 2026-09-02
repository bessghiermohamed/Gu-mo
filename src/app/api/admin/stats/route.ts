/**
 * Admin overview stats — round 10, review §16 (Control Center).
 *
 * ONE lightweight GET that powers the supervisor dashboard's three zones:
 *   Attention  → pendingJoinRequests (scope-routed), openReports
 *   Information→ students, subordinates, groups, cohorts (all CALLER-SCOPED
 *                via the scope module — a year representative must not see
 *                institution-wide numbers)
 *   Management → the existing tabs (not stats)
 *
 * Also feeds the pending-count badges on the "الطلبات" and "التبليغات" tabs.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canManageRoles } from "@/lib/auth/permissions";
import type { AuthUser } from "@/lib/auth/permissions";
import { fetchPendingJoinRequests } from "@/lib/data-layer";
import {
  loadScopeContext,
  assignableCohortIds,
  studentVisibleTo,
  directSubordinatesOf,
} from "@/lib/auth/scope";
import type { ScopedUserLike, StudentRowLike } from "@/lib/auth/scope";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !canManageRoles(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const empty = {
      pendingJoinRequests: 0,
      openReports: 0,
      students: 0,
      subordinates: 0,
      groups: 0,
      cohorts: 0,
    };
    const [pending, openReports, ctx] = await Promise.all([
      fetchPendingJoinRequests(user),
      countOpenReports(),
      loadScopeContext(),
    ]);

    // scope-mapped counts
    const cohortsInScope = assignableCohortIds(user, ctx);
    const groupsInScope = new Set(
      cohortsInScope
        .map((id) => ctx.cohorts.get(id)?.groupId ?? null)
        .filter((g): g is number => g != null)
    );

    // students + supervisors visible to the caller
    let students = 0;
    let subordinates = 0;
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("app_users")
        .select(
          "id, role, assigned_specialty_id, scope_institution_id, scope_specialty_id, scope_academic_year_id, scope_group_id, scope_cohort_group_id"
        );
      const users = (data ?? []).map((u: Record<string, unknown>) => ({
        id: Number(u.id),
        role: String(u.role) as ScopedUserLike["role"],
        assignedSpecialtyId: Number(u.assigned_specialty_id ?? 0),
        scopeInstitutionId: u.scope_institution_id != null ? Number(u.scope_institution_id) : null,
        scopeSpecialtyId: u.scope_specialty_id != null ? Number(u.scope_specialty_id) : null,
        scopeAcademicYearId: u.scope_academic_year_id != null ? Number(u.scope_academic_year_id) : null,
        scopeGroupId: u.scope_group_id != null ? Number(u.scope_group_id) : null,
        scopeCohortGroupId: u.scope_cohort_group_id != null ? Number(u.scope_cohort_group_id) : null,
      }));
      students = countScopedStudents(user, users, ctx);
      subordinates = directSubordinatesOf(
        user,
        users.filter((u) => canManageRoles(u as AuthUser)) as ScopedUserLike[],
        ctx
      ).length;
    } else {
      const users = await db.appUser.findMany({
        select: {
          id: true,
          role: true,
          assignedSpecialtyId: true,
          scopeInstitutionId: true,
          scopeSpecialtyId: true,
          scopeAcademicYearId: true,
          scopeGroupId: true,
          scopeCohortGroupId: true,
        },
      });
      students = countScopedStudents(user, users as unknown as StudentRowLike[], ctx);
      subordinates = directSubordinatesOf(
        user,
        users.filter((u) => canManageRoles(u as AuthUser)) as ScopedUserLike[],
        ctx
      ).length;
    }

    return NextResponse.json({
      pendingJoinRequests: pending.length,
      openReports,
      students,
      subordinates,
      groups: groupsInScope.size,
      cohorts: cohortsInScope.length,
    });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}

async function countOpenReports(): Promise<number> {
  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    const { count, error } = await supabase
      .from("student_issue_reports")
      .select("id", { count: "exact", head: true })
      .neq("status", "تم الحل");
    if (error) return 0;
    return count ?? 0;
  }
  return db.studentIssueReport.count({ where: { status: { not: "تم الحل" } } as never });
}

function countScopedStudents(
  user: AuthUser,
  users: StudentRowLike[],
  ctx: Awaited<ReturnType<typeof loadScopeContext>>
): number {
  const students = users.filter((u) => (u as { role: string }).role === "STUDENT");
  return students.filter((s) => studentVisibleTo(user, s, ctx)).length;
}
