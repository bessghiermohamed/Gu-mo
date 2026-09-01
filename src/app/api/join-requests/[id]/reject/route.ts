import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canReviewJoinRequests } from "@/lib/auth/permissions";
import { loadScopeContext, requestVisibleTo } from "@/lib/auth/scope";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

/**
 * Reject a join request (spec §3.2 — Reject): student stays "No Group",
 * may submit a new request (same or another sub-group). round 9: the
 * reviewer's scope must contain the requested sub-group (routing §8).
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
    const ctx = await loadScopeContext();
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: request } = await supabase
        .from("join_requests").select("id, cohort_id, status").eq("id", parseInt(id)).maybeSingle();
      if (!request) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
      if (request.status !== "pending") return NextResponse.json({ error: "تمت المعالجة" }, { status: 400 });
      if (!requestVisibleTo(user, Number(request.cohort_id), ctx)) {
        return NextResponse.json({ error: "هذا الطلب خارج نطاق إشرافك" }, { status: 403 });
      }
      const { error } = await supabase.from("join_requests").update({
        status: "rejected", reviewer_id: user.id, reviewer_note: reviewerNote,
        reviewed_at: new Date().toISOString(),
      }).eq("id", parseInt(id));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, message: "تم رفض الطلب. يعود الطالب لحالة 'بلا فوج' ويمكنه إرسال طلب جديد." });
    }
    const request = await db.joinRequest.findUnique({ where: { id: parseInt(id) } as never });
    if (!request) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
    if (request.status !== "pending") return NextResponse.json({ error: "تمت المعالجة" }, { status: 400 });
    if (!requestVisibleTo(user, request.cohortId, ctx)) {
      return NextResponse.json({ error: "هذا الطلب خارج نطاق إشرافك" }, { status: 403 });
    }
    await db.joinRequest.update({
      where: { id: parseInt(id) } as never,
      data: { status: "rejected", reviewerId: user.id, reviewerNote, reviewedAt: new Date() } as never,
    });
    return NextResponse.json({ ok: true, message: "تم رفض الطلب. يعود الطالب لحالة 'بلا فوج'." });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
