/**
 * Mark app notifications as read — round 10, review §3/§4.
 *
 * POST { all: true }               → mark every own notification read
 * POST { ids: [1, 2, ...] }        → mark specific own notifications read
 * Own rows only: userId is taken from the session, never from the body.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const ids: number[] = Array.isArray(body.ids)
      ? body.ids.map((x: unknown) => Number(x)).filter((n) => Number.isFinite(n))
      : [];
    const all = body.all === true;

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      let query = supabase
        .from("app_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .is("read_at", null);
      if (!all && ids.length > 0) query = query.in("id", ids);
      if (!all && ids.length === 0) return NextResponse.json({ ok: true, updated: 0 });
      const { error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (!all && ids.length === 0) return NextResponse.json({ ok: true, updated: 0 });
    await db.appNotification.updateMany({
      where: {
        userId: user.id,
        readAt: null,
        ...(all ? {} : { id: { in: ids } }),
      } as never,
      data: { readAt: new Date() } as never,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
