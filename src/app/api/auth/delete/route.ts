import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";

const isVercel = process.env.VERCEL === "1";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  try {
    if (user.role === "OWNER") {
      if (isVercel) {
        const supabase = await createSupabaseServerClient();
        const { count } = await supabase.from("app_users").select("id", { count: "exact", head: true }).eq("role", "OWNER");
        if ((count ?? 0) <= 1) return NextResponse.json({ error: "لا يمكن حذف حساب المالك الوحيد" }, { status: 400 });
      } else {
        const c = await db.appUser.count({ where: { role: "OWNER" } });
        if (c <= 1) return NextResponse.json({ error: "لا يمكن حذف حساب المالك الوحيد" }, { status: 400 });
      }
    }
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      await supabase.from("device_sessions").delete().eq("user_id", user.id);
      await supabase.from("join_requests").delete().eq("requester_id", user.id);
      await supabase.from("notification_read_states").delete().eq("user_id", user.id);
      await supabase.from("content_upload_logs").delete().eq("uploaded_by_id", user.id);
      const { error } = await supabase.from("app_users").delete().eq("id", user.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      await db.deviceSession.deleteMany({ where: { userId: user.id } });
      await db.appUser.delete({ where: { id: user.id } });
    }
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    cookieStore.delete("talib_session");
    return NextResponse.json({ ok: true, message: "تم حذف حسابك بنجاح" });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
