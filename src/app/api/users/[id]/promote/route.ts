/**
 * Promote a user to a new role / edit a supervisor's scope — fix: the UI
 * called this endpoint but it never existed (404), so the "دور" button in
 * the users list was broken.
 *
 * Rules (from permissions.ts):
 * - caller must outrank the target's current role AND the new role
 * - REPRESENTATIVE can only assign STUDENT
 * - SPECIALTY_ADMIN can only affect users of their specialty
 * - scope fields are updated together with the role
 *
 * round 9 (spec §6): the NEW scope must be nested inside the caller's own
 * scope (previously any SPECIALTY_ADMIN could mint a representative for
 * ANY cohort, even outside their specialty). Also adds explicit scope
 * levels for the Edit-Scope dialog:
 *   INSTITUTION | SPECIALTY | YEAR | GROUP | SUBGROUP
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canPromoteTo, type UserRole } from "@/lib/auth/permissions";
import { loadScopeContext, scopeContains, type ScopedUserLike } from "@/lib/auth/scope";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
const VALID_ROLES: UserRole[] = ["STUDENT", "REPRESENTATIVE", "SPECIALTY_ADMIN", "OWNER"];
const VALID_LEVELS = ["INSTITUTION", "SPECIALTY", "YEAR", "GROUP", "SUBGROUP"] as const;
type ScopeLevelName = (typeof VALID_LEVELS)[number];

const SCOPE_LABELS: Record<string, string> = {
  INSTITUTION: "مؤسسة كاملة",
  SPECIALTY: "تخصص كامل",
  YEAR: "سنة كاملة",
  GROUP: "مجموعة",
  SUBGROUP: "فوج واحد",
};

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
    const { newRole, scope, level } = body ?? {};

    if (!VALID_ROLES.includes(newRole)) {
      return NextResponse.json({ error: "دور غير صالح" }, { status: 400 });
    }
    if (level != null && !VALID_LEVELS.includes(level)) {
      return NextResponse.json({ error: "مستوى نطاق غير صالح" }, { status: 400 });
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

    const ctx = await loadScopeContext();

    // ---- resolve the new scope fields ----
    let scopeCohortId: number | null = null;
    let scopeGroupId: number | null = null;
    let scopeYearId: number | null = null;
    let scopeSpecialtyId: number | null = null;
    let scopeInstitutionId: number | null = null;

    if (newRole === "STUDENT") {
      // demotion clears every scope field (existing flow)
    } else if (level == null) {
      // legacy shape (old PromoteDialog): cohort if provided, else specialty
      scopeCohortId = scope?.cohortId ? Number(scope.cohortId) : null;
      scopeGroupId = scope?.groupId ? Number(scope.groupId) : null;
      scopeYearId = scope?.yearId ? Number(scope.yearId) : null;
      scopeSpecialtyId = scope?.specialtyId ? Number(scope.specialtyId) : target.assignedSpecialtyId;
      scopeInstitutionId = scope?.institutionId ? Number(scope.institutionId) : null;
      if (scopeCohortId != null) {
        // fill parent levels from the cohort record
        const c = ctx.cohorts.get(scopeCohortId);
        if (c) {
          scopeGroupId = c.groupId ?? scopeGroupId;
          scopeYearId = scopeYearId ?? c.yearId;
          scopeSpecialtyId = c.specialtyId;
        }
      } else if (scopeGroupId != null) {
        const g = ctx.groups.get(scopeGroupId);
        if (g) {
          scopeYearId = scopeYearId ?? g.yearId;
          scopeSpecialtyId = g.specialtyId;
        }
      }
    } else {
      const lvl = level as ScopeLevelName;
      if (lvl === "INSTITUTION") {
        scopeInstitutionId = scope?.institutionId ? Number(scope.institutionId) : null;
        if (scopeInstitutionId == null) {
          return NextResponse.json({ error: "اختر المؤسسة لهذا النطاق" }, { status: 400 });
        }
      } else if (lvl === "SPECIALTY") {
        scopeSpecialtyId = scope?.specialtyId ? Number(scope.specialtyId) : target.assignedSpecialtyId;
      } else if (lvl === "YEAR") {
        scopeYearId = scope?.yearId ? Number(scope.yearId) : null;
        if (scopeYearId == null) {
          return NextResponse.json({ error: "اختر السنة لهذا النطاق" }, { status: 400 });
        }
        scopeSpecialtyId = scope?.specialtyId ? Number(scope.specialtyId) : target.assignedSpecialtyId;
      } else if (lvl === "GROUP") {
        scopeGroupId = scope?.groupId ? Number(scope.groupId) : null;
        if (scopeGroupId == null) {
          return NextResponse.json({ error: "اختر المجموعة لهذا النطاق" }, { status: 400 });
        }
        const g = ctx.groups.get(scopeGroupId);
        if (g) {
          scopeYearId = g.yearId;
          scopeSpecialtyId = g.specialtyId;
        }
      } else if (lvl === "SUBGROUP") {
        scopeCohortId = scope?.cohortId ? Number(scope.cohortId) : null;
        if (scopeCohortId == null) {
          return NextResponse.json({ error: "اختر الفوج لهذا النطاق" }, { status: 400 });
        }
        const c = ctx.cohorts.get(scopeCohortId);
        if (c) {
          scopeGroupId = c.groupId;
          scopeYearId = c.yearId;
          scopeSpecialtyId = c.specialtyId;
        }
      }
    }

    // ---- round 9: the new supervisory scope must be inside the caller's
    // own scope (spec §6 — enforced at the data/API level, not just UI) ----
    if (newRole !== "STUDENT" && caller.role !== "OWNER") {
      const virtual: ScopedUserLike = {
        id: target.id,
        role: newRole,
        assignedSpecialtyId: scopeSpecialtyId ?? target.assignedSpecialtyId,
        scopeInstitutionId,
        scopeSpecialtyId,
        scopeAcademicYearId: scopeYearId,
        scopeGroupId,
        scopeCohortGroupId: scopeCohortId,
      };
      if (!scopeContains(caller, virtual, ctx)) {
        return NextResponse.json(
          { error: "النطاق الجديد خارج صلاحياتك — لا يمكن تعيين نطاق أوسع من نطاقك" },
          { status: 403 }
        );
      }
    }

    const representativeScope =
      newRole === "REPRESENTATIVE"
        ? (level != null ? SCOPE_LABELS[level] : (scopeCohortId ? "فوج واحد" : "سنة كاملة"))
        : "فوج واحد";

    // Demote-to-STUDENT: clear the supervisory scope — but ONLY on a real
    // demotion (target was supervisory). Saving "STUDENT" on a user who is
    // already a student must be a no-op: it used to silently wipe the
    // student's cohort membership (round 9 fix). On a real demotion the
    // plain academic identity (specialty/year/track/institution) is
    // restored from the student_profile so the demoted supervisor keeps
    // seeing their own year's content ("returns to being a normal student").
    const isDemotion = newRole === "STUDENT" && target.role !== "STUDENT";
    const cohortField = newRole === "STUDENT" ? (isDemotion ? null : undefined) : scopeCohortId;
    const groupField = newRole === "STUDENT" ? (isDemotion ? null : undefined) : scopeGroupId;
    let yearField = newRole === "STUDENT" ? (isDemotion ? null : undefined) : scopeYearId;
    let specialtyField = newRole === "STUDENT" ? (isDemotion ? null : undefined) : scopeSpecialtyId;
    let institutionField = newRole === "STUDENT" ? (isDemotion ? null : undefined) : scopeInstitutionId;
    let trackField: number | null | undefined = undefined;
    if (isDemotion) {
      if (isVercel) {
        const supabase = await createSupabaseServerClient();
        const { data: profile } = await supabase
          .from("student_profiles")
          .select("selected_specialty_id, selected_year_id, track_id")
          .eq("id", targetId)
          .maybeSingle();
        if (profile) {
          specialtyField = profile.selected_specialty_id != null ? Number(profile.selected_specialty_id) : null;
          yearField = profile.selected_year_id != null ? Number(profile.selected_year_id) : null;
          trackField = profile.track_id != null ? Number(profile.track_id) : null;
          if (specialtyField != null) {
            const { data: spec } = await supabase
              .from("specialties").select("institution_id").eq("id", specialtyField).maybeSingle();
            institutionField = spec?.institution_id != null ? Number(spec.institution_id) : null;
          }
        }
      } else {
        const profile = await db.studentProfile.findUnique({ where: { id: targetId } });
        if (profile) {
          specialtyField = profile.selectedSpecialtyId ?? null;
          yearField = profile.selectedYearId ?? null;
          trackField = profile.trackId ?? null;
          if (specialtyField != null) {
            const spec = await db.specialty.findUnique({ where: { id: specialtyField }, select: { institutionId: true } });
            institutionField = spec?.institutionId ?? null;
          }
        }
      }
    }

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase
        .from("app_users")
        .update({
          role: newRole,
          scope_cohort_group_id: cohortField,
          scope_group_id: groupField,
          scope_academic_year_id: yearField,
          scope_specialty_id: specialtyField,
          scope_institution_id: institutionField,
          ...(trackField !== undefined ? { scope_track_id: trackField } : {}),
          representative_scope: representativeScope,
        })
        .eq("id", targetId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, message: `تم تحديث الدور إلى ${newRole}` });
    }

    await db.appUser.update({
      where: { id: targetId },
      data: {
        role: newRole,
        scopeCohortGroupId: cohortField,
        scopeGroupId: groupField,
        scopeAcademicYearId: yearField,
        scopeSpecialtyId: specialtyField,
        scopeInstitutionId: institutionField,
        ...(trackField !== undefined ? { scopeTrackId: trackField } : {}),
        representativeScope,
      } as never,
    });
    return NextResponse.json({ ok: true, message: `تم تحديث الدور إلى ${newRole}` });
  } catch (e) {
    return NextResponse.json({ error: `خطأ داخلي: ${(e as Error).message}` }, { status: 500 });
  }
}
