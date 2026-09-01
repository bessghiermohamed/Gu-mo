import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canManageRoles } from "@/lib/auth/permissions";
import { fetchPendingJoinRequests } from "@/lib/data-layer";
import { loadScopeContext, requestVisibleTo } from "@/lib/auth/scope";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !canManageRoles(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    // round 9 (spec §8): one record per request, routed to the supervisor
    // with the most specific matching scope; higher levels also see it.
    const requests = await fetchPendingJoinRequests(user);
    return NextResponse.json({ requests });
  } catch (e) {
    return NextResponse.json({ requests: [] });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const { cohortId, groupId, message } = body;
    if (!cohortId) return NextResponse.json({ error: "cohortId مطلوب" }, { status: 400 });

    // ---- spec §5 conflict rules ----
    // Rule 1: any user with an active sub-group membership (students AND
    // cohort-scoped representatives — their scope cohort IS their
    // membership) must NOT submit new join requests. Transfers are done
    // by an authorized supervisor via direct assignment.
    if (user.scopeCohortGroupId != null) {
      return NextResponse.json(
        {
          error:
            "أنت عضو في فوج بالفعل. للانتقال إلى فوج آخر تواصل مع ممثل فوجك أو المشرف.",
        },
        { status: 409 }
      );
    }

    // Rule 2: the requested sub-group must be compatible with the user's
    // own scope (institution → specialty → track → year), enforced at the
    // data/API level (spec §3.1/§6).
    if (user.role === "STUDENT") {
      const ctx = await loadScopeContext();
      if (!requestCompatibleWithStudent(user, Number(cohortId), ctx)) {
        return NextResponse.json(
          { error: "هذا الفوج خارج نطاق مؤسستك/تخصصك/ملمحك/سنتك الدراسية" },
          { status: 403 }
        );
      }
    }

    // Rule 3 (existing): prevent duplicate pending requests for the same
    // student and the same sub-group.
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: existing } = await supabase.from("join_requests").select("id")
        .eq("requester_id", user.id).eq("cohort_id", cohortId).eq("status", "pending").maybeSingle();
      if (existing) return NextResponse.json({ error: "لديك طلب معلّق لهذا الفوج بالفعل" }, { status: 409 });
      const { data, error } = await supabase.from("join_requests").insert({
        requester_id: user.id, cohort_id: cohortId, group_id: groupId ?? null,
        status: "pending", message: message?.trim() ?? "",
      }).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ request: data });
    }
    const existing = await db.joinRequest.findFirst({
      where: { requesterId: user.id, cohortId, status: "pending" } as never,
    });
    if (existing) return NextResponse.json({ error: "لديك طلب معلّق" }, { status: 409 });
    const request = await db.joinRequest.create({
      data: { requesterId: user.id, cohortId, groupId: groupId ?? null, status: "pending", message: message?.trim() ?? "" } as never,
    });
    return NextResponse.json({ request });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}

/**
 * A student may only request sub-groups of their OWN institution +
 * specialty + year, and (when the cohort is track-bound) their own track.
 * Track-null cohorts are shared across tracks (round-3 rule).
 */
function requestCompatibleWithStudent(
  user: {
    assignedSpecialtyId: number;
    scopeInstitutionId: number | null;
    scopeSpecialtyId: number | null;
    scopeAcademicYearId: number | null;
    scopeTrackId: number | null;
  },
  cohortId: number,
  ctx: Awaited<ReturnType<typeof loadScopeContext>>
): boolean {
  const cohort = ctx.cohorts.get(cohortId);
  if (!cohort) return false;
  if (cohort.specialtyId !== user.assignedSpecialtyId) return false;
  if (cohort.yearId !== user.scopeAcademicYearId) return false;
  // track compatibility: a cohort/group with no track is shared by all
  // tracks of the (specialty, year) — strict equality is only applied
  // when the cohort declares a track.
  if (cohort.trackId != null && user.scopeTrackId != null && cohort.trackId !== user.scopeTrackId) {
    return false;
  }
  // institution: the cohort's specialty must belong to the student's
  // institution (when the student has one).
  if (user.scopeInstitutionId != null) {
    const spec = ctx.specialties.get(cohort.specialtyId);
    if (spec && spec.institutionId !== user.scopeInstitutionId) return false;
  }
  return true;
}
