import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canManageRoles } from "@/lib/auth/permissions";
import { loadScopeContext, studentVisibleTo, loadPendingRequestIndex, type StudentRowLike } from "@/lib/auth/scope";
import type { UserRole } from "@/lib/auth/types";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

/**
 * Users list (supervisors only) — round 9 (spec §7):
 *   OWNER                → everyone
 *   INSTITUTION-level    → only students of that institution (§7.2)
 *   SPECIALTY-level      → only students of that specialty
 *   YEAR-level           → students of that year
 *   GROUP-level          → members of the group's sub-groups + unassigned
 *                          students of the same (specialty, year) (§7.3)
 *   SUBGROUP-level       → ONLY members of that sub-group + students with
 *                          a pending request to it (§7.4)
 * Enforced at the data/API level — the previous branch filtered with
 * eq(scope_group_id) which matched NO student (students have no
 * scope_group_id), so group reps saw an empty list.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !canManageRoles(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const ctx = await loadScopeContext();
    const pendingIdx = await loadPendingRequestIndex();

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("app_users")
        .select("id, full_name, email, student_id, role, specialty_name, year_name, group_number, scope_cohort_group_id, scope_group_id, scope_academic_year_id, scope_track_id, scope_specialty_id, scope_institution_id, assigned_specialty_id, representative_scope, created_at")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) return NextResponse.json({ users: [] });
      const mapped = (data ?? []).map((u: Record<string, unknown>) => ({
        id: Number(u.id), fullName: String(u.full_name ?? ""), email: String(u.email ?? ""),
        studentId: String(u.student_id ?? ""), role: String(u.role ?? "STUDENT") as UserRole,
        specialtyName: String(u.specialty_name ?? ""), yearName: String(u.year_name ?? ""),
        groupNumber: String(u.group_number ?? ""), assignedSpecialtyId: Number(u.assigned_specialty_id ?? 1),
        scopeCohortGroupId: u.scope_cohort_group_id ? Number(u.scope_cohort_group_id) : null,
        scopeGroupId: u.scope_group_id ? Number(u.scope_group_id) : null,
        scopeAcademicYearId: u.scope_academic_year_id ? Number(u.scope_academic_year_id) : null,
        scopeTrackId: u.scope_track_id ? Number(u.scope_track_id) : null,
        scopeSpecialtyId: u.scope_specialty_id ? Number(u.scope_specialty_id) : null,
        scopeInstitutionId: u.scope_institution_id ? Number(u.scope_institution_id) : null,
        representativeScope: String(u.representative_scope ?? "فوج واحد"),
        createdAt: String(u.created_at ?? ""),
      }));
      const users = user.role === "OWNER"
        ? mapped
        : mapped.filter((u: StudentRowLike) => u.id === user.id || studentVisibleTo(user, u, ctx, pendingIdx.requesterIds, pendingIdx.byCohort));
      return NextResponse.json({ users });
    }
    // Local Prisma fallback
    const { db } = await import("@/lib/db");
    const items = await db.appUser.findMany({ orderBy: { createdAt: "desc" }, take: 300 });
    const mapped = items.map((u) => ({
      id: u.id, fullName: u.fullName, email: u.email, studentId: u.studentId, role: u.role as UserRole,
      specialtyName: u.specialtyName, yearName: u.yearName, groupNumber: u.groupNumber,
      assignedSpecialtyId: u.assignedSpecialtyId,
      scopeCohortGroupId: u.scopeCohortGroupId ?? null,
      scopeGroupId: null, scopeAcademicYearId: u.scopeAcademicYearId ?? null,
      scopeTrackId: u.scopeTrackId ?? null, scopeSpecialtyId: u.scopeSpecialtyId ?? null,
      scopeInstitutionId: u.scopeInstitutionId ?? null, representativeScope: u.representativeScope,
      createdAt: u.createdAt.toISOString(),
    }));
    const users = user.role === "OWNER"
      ? mapped
      : mapped.filter((u: StudentRowLike) => u.id === user.id || studentVisibleTo(user, u, ctx, pendingIdx.requesterIds, pendingIdx.byCohort));
    return NextResponse.json({ users });
  } catch (e) {
    console.error("GET /api/users error:", e);
    return NextResponse.json({ users: [] });
  }
}
