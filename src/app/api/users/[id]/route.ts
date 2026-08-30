/**
 * Delete a user account (supervisors only, with safety checks)
 * - OWNER cannot be deleted by anyone
 * - Cannot delete the only remaining OWNER
 * - SUPERVISOR can only delete users within their scope
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canPromoteTo } from "@/lib/auth/permissions";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const caller = await getCurrentUser();
  if (!caller) {
    return NextResponse.json({ error: "غير مسجّل" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const targetId = parseInt(id);

    // Fetch target user
    let target: { id: number; role: string; assignedSpecialtyId: number; scopeCohortGroupId: number | null; scopeGroupId: number | null };
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("app_users")
        .select("id, role, assigned_specialty_id, scope_cohort_group_id, scope_group_id")
        .eq("id", targetId)
        .maybeSingle();
      if (error || !data) {
        return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
      }
      target = {
        id: Number(data.id),
        role: String(data.role),
        assignedSpecialtyId: Number(data.assigned_specialty_id ?? 1),
        scopeCohortGroupId: data.scope_cohort_group_id ? Number(data.scope_cohort_group_id) : null,
        scopeGroupId: data.scope_group_id ? Number(data.scope_group_id) : null,
      };
    } else {
      const u = await db.appUser.findUnique({ where: { id: targetId } });
      if (!u) {
        return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
      }
      target = {
        id: u.id,
        role: u.role,
        assignedSpecialtyId: u.assignedSpecialtyId,
        scopeCohortGroupId: u.scopeCohortGroupId ?? null,
        scopeGroupId: u.scopeGroupId ?? null,
      };
    }

    // Cannot delete OWNER
    if (target.role === "OWNER") {
      return NextResponse.json(
        { error: "لا يمكن حذف حساب مالك. غيّر دوره أولاً." },
        { status: 403 }
      );
    }

    // Check permission (caller must outrank target)
    const canDelete = canPromoteTo(caller, target as never, "STUDENT");
    if (!canDelete) {
      return NextResponse.json(
        { error: "غير مصرّح: لا يمكنك حذف هذا المستخدم" },
        { status: 403 }
      );
    }

    // Delete related records + user
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      await supabase.from("device_sessions").delete().eq("user_id", targetId);
      await supabase.from("join_requests").delete().eq("requester_id", targetId);
      await supabase.from("notification_read_states").delete().eq("user_id", targetId);
      await supabase.from("content_upload_logs").delete().eq("uploaded_by_id", targetId);
      const { error } = await supabase.from("app_users").delete().eq("id", targetId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      await db.deviceSession.deleteMany({ where: { userId: targetId } });
      await db.joinRequest.deleteMany({ where: { requesterId: targetId } });
      await db.notificationReadState.deleteMany({ where: { userId: targetId } });
      await db.contentUploadLog.deleteMany({ where: { uploadedById: targetId } });
      await db.appUser.delete({ where: { id: targetId } });
    }

    return NextResponse.json({ ok: true, message: "تم حذف المستخدم" });
  } catch (e) {
    return NextResponse.json(
      { error: `خطأ داخلي: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
