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
      const { data: request } = await supabase
        .from("join_requests").select("id, status").eq("id", parseInt(id)).maybeSingle();
      if (!request) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
      if (request.status !== "pending") return NextResponse.json({ error: "تمت المعالجة" }, { status: 400 });
      const { error } = await supabase.from("join_requests").update({
        status: "rejected", reviewer_id: user.id, reviewer_note: reviewerNote,
        reviewed_at: new Date().toISOString(),
      }).eq("id", parseInt(id));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, message: "تم رفض الطلب. يعود الطالب لحالة 'بلا فوج'." });
    }
    const request = await db.joinRequest.findUnique({ where: { id: parseInt(id) } as never });
    if (!request) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
    if (request.status !== "pending") return NextResponse.json({ error: "تمت المعالجة" }, { status: 400 });
    await db.joinRequest.update({
      where: { id: parseInt(id) } as never,
      data: { status: "rejected", reviewerId: user.id, reviewerNote, reviewedAt: new Date() } as never,
    });
    return NextResponse.json({ ok: true, message: "تم رفض الطلب" });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
