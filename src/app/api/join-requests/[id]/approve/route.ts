import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canReviewJoinRequests } from "@/lib/auth/permissions";
import { loadScopeContext, requestVisibleTo } from "@/lib/auth/scope";
import { notifyJoinRequestApproved } from "@/lib/notifications";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

/**
 * Approve a join request (spec §3.2 — Accept):
 *   1. request status → approved
 *   2. student is assigned to the requested sub-group
 *   3. student state: "No Group" → "Assigned"
 *   4. request leaves the pending list (status change)
 *   5. membership (scope_cohort_group_id + group_number) updates immediately
 * round 9: the reviewer must actually be able to SEE the request
 * (scope routing, spec §8) — previously any supervisor could approve any
 * request by forging the id. Other pending requests from the same student
 * are auto-closed so a later approval can't double-assign them.
 * round 10 (review §3): the STUDENT is now notified of the outcome.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || !canReviewJoinRequests(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const reviewerNote = body.note?.trim() ?? "";

    // scope check (§8): the request must be visible to this reviewer
    const ctx = await loadScopeContext();

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: request, error: fetchErr } = await supabase
        .from("join_requests").select("id, requester_id, cohort_id, status").eq("id", parseInt(id)).maybeSingle();
      if (fetchErr || !request) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
      if (request.status !== "pending") return NextResponse.json({ error: "تمت معالجة هذا الطلب" }, { status: 400 });
      if (!requestVisibleTo(user, Number(request.cohort_id), ctx)) {
        return NextResponse.json({ error: "هذا الطلب خارج نطاق إشرافك" }, { status: 403 });
      }

      // fetch cohort name for the denormalized group_number
      const { data: cohort } = await supabase
        .from("cohort_groups").select("group_name").eq("id", Number(request.cohort_id)).maybeSingle();

      const { error: updateErr } = await supabase.from("join_requests").update({
        status: "approved", reviewer_id: user.id, reviewer_note: reviewerNote,
        reviewed_at: new Date().toISOString(),
      }).eq("id", parseInt(id));
      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

      // assign membership immediately
      await supabase.from("app_users").update({
        scope_cohort_group_id: Number(request.cohort_id),
        group_number: cohort?.group_name ?? "",
      }).eq("id", Number(request.requester_id));

      // auto-close the student's OTHER pending requests (same student,
      // different sub-groups) — they are now assigned; a later approval
      // must not silently re-assign them.
      await supabase.from("join_requests").update({
        status: "rejected", reviewer_id: user.id,
        reviewer_note: "أُغلق تلقائياً بعد قبول الطالب في فوج آخر",
        reviewed_at: new Date().toISOString(),
      }).eq("requester_id", Number(request.requester_id))
        .eq("status", "pending")
        .neq("id", parseInt(id));

      await notifyJoinRequestApproved({
        studentId: Number(request.requester_id),
        cohortName: cohort?.group_name ?? "",
        note: reviewerNote,
      });

      return NextResponse.json({ ok: true, message: "تم قبول الطلب وإلحاق الطالب بالفوج" });
    }

    const request = await db.joinRequest.findUnique({ where: { id: parseInt(id) } as never });
    if (!request) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
    if (request.status !== "pending") return NextResponse.json({ error: "تمت معالجة الطلب" }, { status: 400 });
    if (!requestVisibleTo(user, request.cohortId, ctx)) {
      return NextResponse.json({ error: "هذا الطلب خارج نطاق إشرافك" }, { status: 403 });
    }
    const cohort = await db.cohortGroup.findUnique({ where: { id: request.cohortId } as never });
    await db.joinRequest.update({
      where: { id: parseInt(id) } as never,
      data: { status: "approved", reviewerId: user.id, reviewerNote, reviewedAt: new Date() } as never,
    });
    await db.appUser.update({
      where: { id: request.requesterId },
      data: {
        scopeCohortGroupId: request.cohortId,
        groupNumber: cohort?.groupName ?? "",
      },
    });
    // auto-close other pending requests of the same student
    await db.joinRequest.updateMany({
      where: { requesterId: request.requesterId, status: "pending", id: { not: parseInt(id) } } as never,
      data: { status: "rejected", reviewerId: user.id, reviewerNote: "أُغلق تلقائياً بعد قبول الطالب في فوج آخر", reviewedAt: new Date() } as never,
    });
    await notifyJoinRequestApproved({
      studentId: request.requesterId,
      cohortName: cohort?.groupName ?? "",
      note: reviewerNote,
    });
    return NextResponse.json({ ok: true, message: "تم قبول الطلب وإلحاق الطالب بالفوج" });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
