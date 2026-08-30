/**
 * Delete Own Account API
 * - POST: the current user deletes their own account.
 *   SAFETY: OWNER accounts cannot self-delete (must transfer ownership first).
 *   Cleans up: device_sessions, join_requests, notification_read_states,
 *   content_upload_logs, then app_users.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser, SESSION_COOKIE } from "@/lib/auth/service";

const isVercel = process.env.VERCEL === "1";

export async function POST(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "غير مسجّل الدخول" }, { status: 401 });
  }

  // OWNER safety check
  if (user.role === "OWNER") {
    return NextResponse.json(
      {
        error:
          "لا يمكن لحساب المالك حذف نفسه. نقل الملكية لمستخدم آخر أولاً قبل الحذف.",
      },
      { status: 403 }
    );
  }

  try {
    const userId = user.id;

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      await supabase.from("device_sessions").delete().eq("user_id", userId);
      await supabase.from("join_requests").delete().eq("requester_id", userId);
      await supabase
        .from("notification_read_states")
        .delete()
        .eq("user_id", userId);
      await supabase
        .from("content_upload_logs")
        .delete()
        .eq("uploaded_by_id", userId);
      const { error } = await supabase
        .from("app_users")
        .delete()
        .eq("id", userId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      await db.deviceSession.deleteMany({ where: { userId } });
      await (db as never).joinRequest?.deleteMany?.({
        where: { requesterId: userId } as never,
      });
      await db.notificationReadState.deleteMany({ where: { userId } });
      await db.contentUploadLog.deleteMany({ where: { uploadedById: userId } });
      await db.appUser.delete({ where: { id: userId } });
    }

    const res = NextResponse.json({ ok: true, message: "تم حذف الحساب" });
    res.cookies.delete(SESSION_COOKIE);
    return res;
  } catch (e) {
    return NextResponse.json(
      { error: `خطأ داخلي: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
