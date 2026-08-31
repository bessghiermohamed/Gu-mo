/**
 * Promote a user to a new role — fix: the UI called this endpoint but it
 * never existed (404), so the "دور" button in the users list was broken.
 *
 * Rules (from permissions.ts):
 * - caller must outrank the target's current role AND the new role
 * - REPRESENTATIVE can only assign STUDENT
 * - SPECIALTY_ADMIN can only affect users of their specialty
 * - scope fields are updated together with the role
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canPromoteTo, type UserRole } from "@/lib/auth/permissions";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
const VALID_ROLES: UserRole[] = ["STUDENT", "REPRESENTATIVE", "SPECIALTY_ADMIN", "OWNER"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const caller = await getCurrentUser();
  if (!caller) return NextResponse.json({ error: "غير مسجّل" }, { status: 401 });

  try {
    const { id } = await params;
    const targetId = parseInt(id);
    const body = await req.json();
    const { newRole, scope } = body ?? {};

    if (!VALID_ROLES.includes(newRole)) {
      return NextResponse.json({ error: "دور غير صالح" }, { status: 400 });
    }

    // Fetch target
    let target: { id: number; role: string; assignedSpecialtyId: number; scopeCohortGroupId: number | null };
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("app_users")
        .select("id, role, assigned_specialty_id, scope_cohort_group_id")
        .eq("id", targetId)
        .maybeSingle();
      if (error || !data) return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
      target = {
        id: Number(data.id),
        role: String(data.role),
        assignedSpecialtyId: Number(data.assigned_specialty_id ?? 1),
        scopeCohortGroupId: data.scope_cohort_group_id ? Number(data.scope_cohort_group_id) : null,
      };
    } else {
      const u = await db.appUser.findUnique({ where: { id: targetId } });
      if (!u) return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
      target = {
        id: u.id, role: u.role,
        assignedSpecialtyId: u.assignedSpecialtyId,
        scopeCohortGroupId: u.scopeCohortGroupId ?? null,
      };
    }

    if (!canPromoteTo(caller, target as never, newRole)) {
      return NextResponse.json({ error: "غير مصرّح: لا يمكنك تعديل دور هذا المستخدم" }, { status: 403 });
    }

    // Safety: never demote/remove the last OWNER
    if (target.role === "OWNER" && newRole !== "OWNER") {
      if (isVercel) {
        const supabase = await createSupabaseServerClient();
        const { count } = await supabase
          .from("app_users")
          .select("id", { count: "exact", head: true })
          .eq("role", "OWNER");
        if ((count ?? 0) <= 1) {
          return NextResponse.json({ error: "لا يمكن تخفيض دور المالك الوحيد" }, { status: 400 });
        }
      } else {
        const owners = await db.appUser.count({ where: { role: "OWNER" } });
        if (owners <= 1) {
          return NextResponse.json({ error: "لا يمكن تخفيض دور المالك الوحيد" }, { status: 400 });
        }
      }
    }

    const scopeCohortId = scope?.cohortId ? Number(scope.cohortId) : null;
    const scopeGroupId = scope?.groupId ? Number(scope.groupId) : null;
    const scopeYearId = scope?.yearId ? Number(scope.yearId) : null;
    const scopeSpecialtyId = scope?.specialtyId ? Number(scope.specialtyId) : target.assignedSpecialtyId;
    const scopeInstitutionId = scope?.institutionId ? Number(scope.institutionId) : null;

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase
        .from("app_users")
        .update({
          role: newRole,
          scope_cohort_group_id: newRole === "STUDENT" ? null : scopeCohortId,
          scope_group_id: newRole === "STUDENT" ? null : scopeGroupId,
          scope_academic_year_id: newRole === "STUDENT" ? null : scopeYearId,
          scope_specialty_id: newRole === "STUDENT" ? null : scopeSpecialtyId,
          scope_institution_id: newRole === "STUDENT" ? null : scopeInstitutionId,
          representative_scope: newRole === "REPRESENTATIVE" ? (scopeCohortId ? "فوج واحد" : "سنة كاملة") : "فوج واحد",
        })
        .eq("id", targetId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, message: `تم تحديث الدور إلى ${newRole}` });
    }

    await db.appUser.update({
      where: { id: targetId },
      data: {
        role: newRole,
        scopeCohortGroupId: newRole === "STUDENT" ? null : scopeCohortId,
        scopeGroupId: newRole === "STUDENT" ? null : scopeGroupId,
        scopeAcademicYearId: newRole === "STUDENT" ? null : scopeYearId,
        scopeSpecialtyId: newRole === "STUDENT" ? null : scopeSpecialtyId,
        scopeInstitutionId: newRole === "STUDENT" ? null : scopeInstitutionId,
        representativeScope: newRole === "REPRESENTATIVE" ? (scopeCohortId ? "فوج واحد" : "سنة كاملة") : "فوج واحد",
      },
    });
    return NextResponse.json({ ok: true, message: `تم تحديث الدور إلى ${newRole}` });
  } catch (e) {
    return NextResponse.json({ error: `خطأ داخلي: ${(e as Error).message}` }, { status: 500 });
  }
}
