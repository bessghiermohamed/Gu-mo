import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canReviewJoinRequests } from "@/lib/auth/permissions";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

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
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: request, error: fetchErr } = await supabase
        .from("join_requests").select("id, requester_id, cohort_id, status")
        .eq("id", parseInt(id)).maybeSingle();
      if (fetchErr || !request) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
      if (request.status !== "pending") return NextResponse.json({ error: "تمت معالجة هذا الطلب" }, { status: 400 });
      const { error: updateErr } = await supabase.from("join_requests").update({
        status: "approved", reviewer_id: user.id, reviewer_note: reviewerNote,
        reviewed_at: new Date().toISOString(),
      }).eq("id", parseInt(id));
      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
      await supabase.from("app_users").update({ scope_cohort_group_id: request.cohort_id }).eq("id", request.requester_id);
      return NextResponse.json({ ok: true, message: "تم قبول الطلب وإلحاق الطالب بالفوج" });
    }
    const request = await (db as never).joinRequest.findUnique({ where: { id: parseInt(id) } as never });
    if (!request) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
    if (request.status !== "pending") return NextResponse.json({ error: "تمت معالجة الطلب" }, { status: 400 });
    await (db as never).joinRequest.update({
      where: { id: parseInt(id) } as never,
      data: { status: "approved", reviewerId: user.id, reviewerNote, reviewedAt: new Date() } as never,
    });
    await (db as never).appUser.update({
      where: { id: request.requesterId } as never,
      data: { scopeCohortGroupId: request.cohortId } as never,
    });
    return NextResponse.json({ ok: true, message: "تم قبول الطلب" });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
