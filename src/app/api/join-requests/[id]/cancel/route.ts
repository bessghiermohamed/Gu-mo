/**
 * Cancel a pending join request — round 10, review §3/§17(D Actions).
 *
 * Previously a student could NOT withdraw a submitted request: if they
 * changed their mind (or picked the wrong sub-group), the request sat in
 * the reviewer's queue until someone acted on it. A complete action set
 * includes Cancel for the requester, not just Accept/Reject for the
 * reviewer.
 *
 * Rules:
 *   - only the REQUESTER may cancel (403 otherwise, supervisor forging
 *     another user's id)
 *   - only PENDING requests may be cancelled (400 after review)
 *   - status → "cancelled"; the student stays/becomes "No Group" and may
 *     submit a new request immediately
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  try {
    const { id } = await params;
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: request } = await supabase
        .from("join_requests")
        .select("id, requester_id, status")
        .eq("id", parseInt(id))
        .maybeSingle();
      if (!request) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
      if (Number(request.requester_id) !== user.id) {
        return NextResponse.json({ error: "يمكنك إلغاء طلباتك فقط" }, { status: 403 });
      }
      if (request.status !== "pending") {
        return NextResponse.json({ error: "تمت معالجة هذا الطلب — لا يمكن إلغاؤه" }, { status: 400 });
      }
      const { error } = await supabase
        .from("join_requests")
        .update({ status: "cancelled", reviewed_at: new Date().toISOString() })
        .eq("id", parseInt(id));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, message: "تم إلغاء الطلب. يمكنك إرسال طلب جديد." });
    }
    const request = await db.joinRequest.findUnique({ where: { id: parseInt(id) } as never });
    if (!request) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
    if (request.requesterId !== user.id) {
      return NextResponse.json({ error: "يمكنك إلغاء طلباتك فقط" }, { status: 403 });
    }
    if (request.status !== "pending") {
      return NextResponse.json({ error: "تمت معالجة هذا الطلب — لا يمكن إلغاؤه" }, { status: 400 });
    }
    await db.joinRequest.update({
      where: { id: parseInt(id) } as never,
      data: { status: "cancelled" as never, reviewedAt: new Date() as never } as never,
    });
    return NextResponse.json({ ok: true, message: "تم إلغاء الطلب. يمكنك إرسال طلب جديد." });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
