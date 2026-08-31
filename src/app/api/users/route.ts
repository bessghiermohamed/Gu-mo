import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canManageRoles } from "@/lib/auth/permissions";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !canManageRoles(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      let query = supabase
        .from("app_users")
        .select("id, full_name, email, student_id, role, specialty_name, year_name, group_number, scope_cohort_group_id, scope_group_id, scope_academic_year_id, scope_track_id, scope_specialty_id, scope_institution_id, assigned_specialty_id, representative_scope, created_at")
        .order("created_at", { ascending: false });
      if (user.role === "REPRESENTATIVE") {
        if (user.scopeCohortGroupId) query = query.eq("scope_cohort_group_id", user.scopeCohortGroupId);
        else if (user.scopeGroupId) query = query.eq("scope_group_id", user.scopeGroupId);
      } else if (user.role === "SPECIALTY_ADMIN") {
        query = query.eq("assigned_specialty_id", user.assignedSpecialtyId);
      }
      const { data, error } = await query.limit(100);
      if (error) return NextResponse.json({ users: [] });
      const users = (data ?? []).map((u: Record<string, unknown>) => ({
        id: Number(u.id), fullName: String(u.full_name ?? ""), email: String(u.email ?? ""),
        studentId: String(u.student_id ?? ""), role: String(u.role ?? "STUDENT"),
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
      return NextResponse.json({ users });
    }
    // Local Prisma fallback
    const { db } = await import("@/lib/db");
    const items = await db.appUser.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    return NextResponse.json({
      users: items.map((u) => ({
        id: u.id, fullName: u.fullName, email: u.email, studentId: u.studentId, role: u.role,
        specialtyName: u.specialtyName, yearName: u.yearName, groupNumber: u.groupNumber,
        assignedSpecialtyId: u.assignedSpecialtyId,
        scopeCohortGroupId: u.scopeCohortGroupId ?? null,
        scopeGroupId: null, scopeAcademicYearId: u.scopeAcademicYearId ?? null,
        scopeTrackId: u.scopeTrackId ?? null, scopeSpecialtyId: u.scopeSpecialtyId ?? null,
        scopeInstitutionId: u.scopeInstitutionId ?? null, representativeScope: u.representativeScope,
        createdAt: u.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    console.error("GET /api/users error:", e);
    return NextResponse.json({ users: [] });
  }
}
