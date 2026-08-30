/**
 * Approve a Join Request
 * - POST /api/join-requests/[id]/approve
 *   Sets request.status = "approved", and assigns the student to the cohort
 *   (updates app_users.scope_cohort_group_id + cohort_id snapshot fields).
 *   Requires canReviewJoinRequests.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canReviewJoinRequests } from "@/lib/auth/permissions";

const isVercel = process.env.VERCEL === "1";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "غير مسجّل الدخول" }, { status: 401 });
  }
  if (!canReviewJoinRequests(user)) {
    return NextResponse.json(
      { error: "غير مصرّح: قبول الطلبات يتطلب صلاحية إشراف" },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    const requestId = parseInt(id);
    if (Number.isNaN(requestId)) {
      return NextResponse.json(
        { error: "معرّف الطلب غير صالح" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const reviewerNote = String(body?.reviewerNote ?? "");

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      // 1. Fetch the request
      const { data: request, error: fetchErr } = await supabase
        .from("join_requests")
        .select("id, requester_id, cohort_id, status")
        .eq("id", requestId)
        .maybeSingle();
      if (fetchErr || !request) {
        return NextResponse.json(
          { error: "الطلب غير موجود" },
          { status: 404 }
        );
      }
      if (request.status !== "pending") {
        return NextResponse.json(
          { error: `لا يمكن قبول طلب بحالة "${request.status}"` },
          { status: 400 }
        );
      }

      // 2. Mark approved
      const { error: updErr } = await supabase
        .from("join_requests")
        .update({
          status: "approved",
          reviewer_note: reviewerNote,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", requestId);
      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 500 });
      }

      // 3. Assign student to cohort
      if (request.requester_id && request.cohort_id) {
        const { error: userErr } = await supabase
          .from("app_users")
          .update({ scope_cohort_group_id: request.cohort_id })
          .eq("id", request.requester_id);
        if (userErr) {
          return NextResponse.json(
            { error: `فشل ربط الطالب بالفوج: ${userErr.message}` },
            { status: 500 }
          );
        }
      }
      return NextResponse.json({ ok: true, message: "تم قبول الطلب" });
    }

    // Prisma local path
    const existing = await (db as never).joinRequest.findUnique({
      where: { id: requestId },
    });
    if (!existing) {
      return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
    }
    if ((existing as { status: string }).status !== "pending") {
      return NextResponse.json(
        {
          error: `لا يمكن قبول طلب بحالة "${(existing as { status: string }).status}"`,
        },
        { status: 400 }
      );
    }

    await (db as never).joinRequest.update({
      where: { id: requestId },
      data: {
        status: "approved",
        reviewerNote,
        reviewedAt: new Date(),
      },
    });

    const requesterId = (existing as { requesterId?: number }).requesterId;
    const cohortId = (existing as { cohortId?: number }).cohortId;
    if (requesterId && cohortId) {
      await db.appUser.update({
        where: { id: requesterId },
        data: { scopeCohortGroupId: cohortId },
      });
    }

    return NextResponse.json({ ok: true, message: "تم قبول الطلب" });
  } catch (e) {
    return NextResponse.json(
      { error: `خطأ داخلي: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
