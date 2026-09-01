import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canManageRoles } from "@/lib/auth/permissions";
import { loadScopeContext, scopeContains, type ScopedUserLike } from "@/lib/auth/scope";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

/**
 * Remove a supervisor (spec §12).
 *
 * "Remove" = strip the supervisory role (demote to STUDENT, clear scope
 * fields) — the account itself is kept, so the action is reversible via
 * the existing promote dialog. This IS the existing removal flow for
 * role changes; account deletion stays in the Users tab.
 *
 * If the target has subordinates (supervisors nested inside their scope),
 * the client must first show the 3-option warning dialog; this endpoint
 * receives the chosen option:
 *   option "keep"    → remove the target only; subordinates remain
 *                      supervisors (they are already inside the caller's
 *                      scope, so the caller now manages them directly)
 *   option "cascade" → remove the target AND demote every subordinate
 *                      recursively
 *   option "cancel"  → client-side only (request is never sent)
 */
async function demoteToStudent(userId: number): Promise<void> {
  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    await supabase
      .from("app_users")
      .update({
        role: "STUDENT",
        scope_cohort_group_id: null,
        scope_group_id: null,
        ...await studentScopeRestoreSupabase(supabase, userId),
        representative_scope: "فوج واحد",
      })
      .eq("id", userId);
  } else {
    await db.appUser.update({
      where: { id: userId },
      data: {
        role: "STUDENT",
        scopeCohortGroupId: null,
        scopeGroupId: null,
        ...await studentScopeRestorePrisma(userId),
        representativeScope: "فوج واحد",
      } as never,
    });
  }
}

/**
 * round 9: a demoted supervisor "returns to being a normal student"
 * (spec §12) — their plain academic identity (specialty/year/track/
 * institution) is restored from their student_profile instead of being
 * wiped, so they keep seeing their own year's content. Cohort membership
 * is NOT restored: they come back as "No Group" and can re-request or be
 * re-assigned. Users without a profile (never onboarded) keep empty scope.
 */
type ScopePatch = Record<string, number | null>;

async function studentScopeRestoreSupabase(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: number
): Promise<ScopePatch> {
  const patch: ScopePatch = {
    scope_academic_year_id: null,
    scope_specialty_id: null,
    scope_institution_id: null,
  };
  try {
    const { data: profile } = await supabase
      .from("student_profiles")
      .select("selected_specialty_id, selected_year_id, track_id")
      .eq("id", userId)
      .maybeSingle();
    if (profile) {
      const specialtyId = profile.selected_specialty_id != null ? Number(profile.selected_specialty_id) : null;
      patch.scope_specialty_id = specialtyId;
      patch.scope_academic_year_id = profile.selected_year_id != null ? Number(profile.selected_year_id) : null;
      patch.scope_track_id = profile.track_id != null ? Number(profile.track_id) : null;
      if (specialtyId != null) {
        const { data: spec } = await supabase
          .from("specialties")
          .select("institution_id")
          .eq("id", specialtyId)
          .maybeSingle();
        patch.scope_institution_id = spec?.institution_id != null ? Number(spec.institution_id) : null;
      }
    }
  } catch {
    // profile lookup failed → conservative empty scope
  }
  return patch;
}

async function studentScopeRestorePrisma(userId: number): Promise<ScopePatch> {
  const patch: ScopePatch = {
    scopeAcademicYearId: null,
    scopeSpecialtyId: null,
    scopeInstitutionId: null,
  };
  try {
    const profile = await db.studentProfile.findUnique({ where: { id: userId } });
    if (profile) {
      const specialtyId = profile.selectedSpecialtyId ?? null;
      patch.scopeSpecialtyId = specialtyId;
      patch.scopeAcademicYearId = profile.selectedYearId ?? null;
      patch.scopeTrackId = profile.trackId ?? null;
      if (specialtyId != null) {
        const spec = await db.specialty.findUnique({ where: { id: specialtyId }, select: { institutionId: true } });
        patch.scopeInstitutionId = spec?.institutionId ?? null;
      }
    }
  } catch {
    // profile lookup failed → conservative empty scope
  }
  return patch;
}

async function fetchAllSupervisors(): Promise<ScopedUserLike[]> {
  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("app_users")
      .select("id, role, assigned_specialty_id, scope_institution_id, scope_specialty_id, scope_academic_year_id, scope_group_id, scope_cohort_group_id")
      .in("role", ["REPRESENTATIVE", "SPECIALTY_ADMIN"]);
    return (data ?? []).map((r: Record<string, unknown>) => ({
      id: Number(r.id),
      role: String(r.role) as ScopedUserLike["role"],
      assignedSpecialtyId: Number(r.assigned_specialty_id ?? 1),
      scopeInstitutionId: r.scope_institution_id != null ? Number(r.scope_institution_id) : null,
      scopeSpecialtyId: r.scope_specialty_id != null ? Number(r.scope_specialty_id) : null,
      scopeAcademicYearId: r.scope_academic_year_id != null ? Number(r.scope_academic_year_id) : null,
      scopeGroupId: r.scope_group_id != null ? Number(r.scope_group_id) : null,
      scopeCohortGroupId: r.scope_cohort_group_id != null ? Number(r.scope_cohort_group_id) : null,
    }));
  }
  const rows = await db.appUser.findMany({
    where: { role: { in: ["REPRESENTATIVE", "SPECIALTY_ADMIN"] } } as never,
  });
  return rows.map((r) => ({
    id: r.id,
    role: r.role as ScopedUserLike["role"],
    assignedSpecialtyId: r.assignedSpecialtyId,
    scopeInstitutionId: r.scopeInstitutionId ?? null,
    scopeSpecialtyId: r.scopeSpecialtyId ?? null,
    scopeAcademicYearId: r.scopeAcademicYearId ?? null,
    scopeGroupId: r.scopeGroupId ?? null,
    scopeCohortGroupId: r.scopeCohortGroupId ?? null,
  }));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const caller = await getCurrentUser();
  if (!caller || !canManageRoles(caller)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const { id } = await params;
    const targetId = parseInt(id);
    const body = await req.json().catch(() => ({}));
    const option = body?.option; // "keep" | "cascade"

    const ctx = await loadScopeContext();
    const supervisors = await fetchAllSupervisors();
    const target = supervisors.find((s) => s.id === targetId);
    if (!target) {
      // already a student / never a supervisor → nothing to remove
      return NextResponse.json({ error: "هذا المستخدم ليس مشرفاً" }, { status: 404 });
    }

    // caller must outrank the target AND contain their scope (§12
    // "supervisors that the current user is authorized to manage")
    if (!scopeContains(caller, target, ctx)) {
      return NextResponse.json(
        { error: "غير مصرّح: هذا المشرف خارج نطاق صلاحياتك" },
        { status: 403 }
      );
    }

    // the target's subordinates (supervisors nested inside their scope)
    const targetSubordinates = supervisors.filter(
      (s) => s.id !== target.id && scopeContains(target, s, ctx)
    );

    if (targetSubordinates.length > 0 && option !== "keep" && option !== "cascade") {
      // client skipped the dialog — refuse and flag the 3-option requirement
      return NextResponse.json(
        {
          error: "هذا المشرف لديه مرؤوسون — اختر أحد الخيارات الثلاثة أولاً",
          hasSubordinates: true,
          subordinatesCount: targetSubordinates.length,
        },
        { status: 400 }
      );
    }

    if (option === "cascade") {
      // demote target + every nested subordinate recursively
      const toRemove = new Set<number>([target.id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const s of supervisors) {
          if (toRemove.has(s.id)) continue;
          // s is removed if it is contained in ANY already-removed supervisor
          if ([...toRemove].some((rid) => {
            const r = supervisors.find((x) => x.id === rid);
            return r && scopeContains(r, s, ctx);
          })) {
            toRemove.add(s.id);
            changed = true;
          }
        }
      }
      for (const uid of toRemove) {
        await demoteToStudent(uid);
      }
      return NextResponse.json({
        ok: true,
        removedCount: toRemove.size,
        message: `تمت إزالة دور المشرف عن ${toRemove.size} مستخدم (المشرف ومرؤوسيه)`,
      });
    }

    // "keep" (or no subordinates): remove only the target
    await demoteToStudent(target.id);
    return NextResponse.json({
      ok: true,
      removedCount: 1,
      message:
        targetSubordinates.length > 0
          ? "تمت إزالة دور المشرف — مرؤوسوه أصبحوا الآن تحت إشرافك المباشر"
          : "تمت إزالة دور المشرف وإعادته طالباً",
    });
  } catch (e) {
    return NextResponse.json({ error: `خطأ داخلي: ${(e as Error).message}` }, { status: 500 });
  }
}
