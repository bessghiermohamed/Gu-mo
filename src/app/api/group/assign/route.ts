import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canManageRoles } from "@/lib/auth/permissions";
import { loadScopeContext, cohortAssignableBy, cohortCompatibleWithStudent, studentVisibleTo, loadPendingRequestIndex, type StudentRowLike } from "@/lib/auth/scope";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

/**
 * Direct assignment / transfer (spec §4 — Method B, §5 conflict rules,
 * §7.3 "Move students between sub-groups").
 *
 * POST { userId, cohortId }
 *   - caller must be a supervisor (canManageRoles)
 *   - target must be a STUDENT (supervisor scopes are never touched here)
 *   - caller must be able to MANAGE the target student (scope containment)
 *   - the destination sub-group must be inside the CALLER's scope
 *   - the destination must match the STUDENT's own academic scope
 *     (institution/specialty/track/year — system review §2, same rule
 *     as student join requests, enforced data-layer side)
 *   - membership (scope_cohort_group_id + group_number) updates immediately
 *   - pending join requests of the student are resolved automatically:
 *     the one targeting the destination → approved; all others → rejected
 *
 * Both assignment methods coexist: this endpoint never disables or
 * replaces student join requests (spec §4 "Important").
 */
export async function POST(req: NextRequest) {
  const caller = await getCurrentUser();
  if (!caller || !canManageRoles(caller)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const userId = Number(body?.userId);
    const cohortId = Number(body?.cohortId);
    if (!userId || !cohortId) {
      return NextResponse.json({ error: "userId و cohortId مطلوبان" }, { status: 400 });
    }

    const ctx = await loadScopeContext();
    const pendingIdx = await loadPendingRequestIndex();

    // destination must be within the caller's assignment scope (spec §4.4)
    if (!cohortAssignableBy(caller, cohortId, ctx)) {
      return NextResponse.json(
        { error: "هذا الفوج خارج نطاق صلاحياتك — يمكنك الإلحاق فقط ضمن نطاقك" },
        { status: 403 }
      );
    }

    const cohortName = ctx.cohorts.get(cohortId)?.nameAr ?? "";

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: target, error: tErr } = await supabase
        .from("app_users")
        .select("id, full_name, role, assigned_specialty_id, scope_institution_id, scope_specialty_id, scope_academic_year_id, scope_track_id, scope_group_id, scope_cohort_group_id")
        .eq("id", userId)
        .maybeSingle();
      if (tErr || !target) return NextResponse.json({ error: "الطالب غير موجود" }, { status: 404 });

      if (String(target.role) !== "STUDENT") {
        return NextResponse.json(
          { error: "الإلحاق المباشر يخص الطلاب فقط — أدوار المشرفين تُدار من «المستخدمون»" },
          { status: 400 }
        );
      }

      // caller must be able to see/manage this student (spec §7 visibility)
      const targetLike: StudentRowLike = {
        id: Number(target.id),
        role: "STUDENT",
        assignedSpecialtyId: Number(target.assigned_specialty_id ?? 1),
        scopeInstitutionId: target.scope_institution_id != null ? Number(target.scope_institution_id) : null,
        scopeAcademicYearId: target.scope_academic_year_id != null ? Number(target.scope_academic_year_id) : null,
        scopeCohortGroupId: target.scope_cohort_group_id != null ? Number(target.scope_cohort_group_id) : null,
      };
      if (!studentVisibleTo(caller, targetLike, ctx, pendingIdx.requesterIds, pendingIdx.byCohort)) {
        return NextResponse.json({ error: "هذا الطالب خارج نطاق إشرافك" }, { status: 403 });
      }

      // system review §2: the destination must match the STUDENT's own
      // academic data (institution/specialty/track/year) — never offer or
      // accept sub-groups outside it, even inside the caller's authority.
      const studentAcademic = {
        assignedSpecialtyId: Number(target.assigned_specialty_id ?? 1),
        scopeInstitutionId: target.scope_institution_id != null ? Number(target.scope_institution_id) : null,
        scopeAcademicYearId: target.scope_academic_year_id != null ? Number(target.scope_academic_year_id) : null,
        scopeTrackId: target.scope_track_id != null ? Number(target.scope_track_id) : null,
      };
      if (!cohortCompatibleWithStudent(studentAcademic, cohortId, ctx)) {
        return NextResponse.json(
          { error: "هذا الفوج لا يطابق البيانات الأكاديمية للطالب (المؤسسة/التخصص/المسار/السنة) — اختر فوجاً يوافق تخصص الطالب وسنته الدراسية" },
          { status: 409 }
        );
      }

      // assign membership immediately
      const { error: assignErr } = await supabase
        .from("app_users")
        .update({ scope_cohort_group_id: cohortId, group_number: cohortName })
        .eq("id", userId);
      if (assignErr) return NextResponse.json({ error: assignErr.message }, { status: 500 });

      // resolve the student's pending join requests
      const { data: pendings } = await supabase
        .from("join_requests")
        .select("id, cohort_id")
        .eq("requester_id", userId)
        .eq("status", "pending");
      for (const p of pendings ?? []) {
        if (Number(p.cohort_id) === cohortId) {
          await supabase.from("join_requests").update({
            status: "approved", reviewer_id: caller.id,
            reviewer_note: "تم الإلحاق المباشر بالفوج",
            reviewed_at: new Date().toISOString(),
          }).eq("id", Number(p.id));
        } else {
          await supabase.from("join_requests").update({
            status: "rejected", reviewer_id: caller.id,
            reviewer_note: "أُغلق بعد إلحاق الطالب مباشرةً في فوج آخر",
            reviewed_at: new Date().toISOString(),
          }).eq("id", Number(p.id));
        }
      }

      return NextResponse.json({
        ok: true,
        message: `تم إلحاق ${String(target.full_name)} بـ «${cohortName}»`,
      });
    }

    // ---- local Prisma branch ----
    const target = await db.appUser.findUnique({ where: { id: userId } });
    if (!target) return NextResponse.json({ error: "الطالب غير موجود" }, { status: 404 });
    if (target.role !== "STUDENT") {
      return NextResponse.json(
        { error: "الإلحاق المباشر يخص الطلاب فقط — أدوار المشرفين تُدار من «المستخدمون»" },
        { status: 400 }
      );
    }
    const targetLike: StudentRowLike = {
      id: target.id,
      role: "STUDENT",
      assignedSpecialtyId: target.assignedSpecialtyId,
      scopeInstitutionId: target.scopeInstitutionId ?? null,
      scopeAcademicYearId: target.scopeAcademicYearId ?? null,
      scopeCohortGroupId: target.scopeCohortGroupId ?? null,
    };
    if (!studentVisibleTo(caller, targetLike, ctx, pendingIdx.requesterIds, pendingIdx.byCohort)) {
      return NextResponse.json({ error: "هذا الطالب خارج نطاق إشرافك" }, { status: 403 });
    }

    // system review §2 (local branch): destination must match the
    // student's own academic scope — same rule as the Supabase branch.
    const studentAcademicLocal = {
      assignedSpecialtyId: target.assignedSpecialtyId,
      scopeInstitutionId: target.scopeInstitutionId ?? null,
      scopeAcademicYearId: target.scopeAcademicYearId ?? null,
      scopeTrackId: target.scopeTrackId ?? null,
    };
    if (!cohortCompatibleWithStudent(studentAcademicLocal, cohortId, ctx)) {
      return NextResponse.json(
        { error: "هذا الفوج لا يطابق البيانات الأكاديمية للطالب (المؤسسة/التخصص/المسار/السنة) — اختر فوجاً يوافق تخصص الطالب وسنته الدراسية" },
        { status: 409 }
      );
    }

    await db.appUser.update({
      where: { id: userId },
      data: { scopeCohortGroupId: cohortId, groupNumber: cohortName },
    });

    const pendings = await db.joinRequest.findMany({
      where: { requesterId: userId, status: "pending" } as never,
    });
    for (const p of pendings) {
      await db.joinRequest.update({
        where: { id: p.id } as never,
        data: p.cohortId === cohortId
          ? { status: "approved", reviewerId: caller.id, reviewerNote: "تم الإلحاق المباشر بالفوج", reviewedAt: new Date() } as never
          : { status: "rejected", reviewerId: caller.id, reviewerNote: "أُغلق بعد إلحاق الطالب مباشرةً في فوج آخر", reviewedAt: new Date() } as never,
      });
    }

    return NextResponse.json({
      ok: true,
      message: `تم إلحاق ${target.fullName} بـ «${cohortName}»`,
    });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
