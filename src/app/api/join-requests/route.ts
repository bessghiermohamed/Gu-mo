import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canManageRoles } from "@/lib/auth/permissions";
import { fetchPendingJoinRequests } from "@/lib/data-layer";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !canManageRoles(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const requests = await fetchPendingJoinRequests(
      user.id, user.role,
      user.scopeCohortGroupId ?? undefined,
      user.scopeGroupId ?? undefined,
      user.scopeAcademicYearId ?? undefined,
      user.assignedSpecialtyId
    );
    return NextResponse.json({ requests });
  } catch (e) {
    return NextResponse.json({ requests: [] });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const { cohortId, groupId, message } = body;
    if (!cohortId) return NextResponse.json({ error: "cohortId مطلوب" }, { status: 400 });
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: existing } = await supabase.from("join_requests").select("id")
        .eq("requester_id", user.id).eq("cohort_id", cohortId).eq("status", "pending").maybeSingle();
      if (existing) return NextResponse.json({ error: "لديك طلب معلّق لهذا الفوج بالفعل" }, { status: 409 });
      const { data, error } = await supabase.from("join_requests").insert({
        requester_id: user.id, cohort_id: cohortId, group_id: groupId ?? null,
        status: "pending", message: message?.trim() ?? "",
      }).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ request: data });
    }
    const existing = await db.joinRequest.findFirst({
      where: { requesterId: user.id, cohortId, status: "pending" } as never,
    });
    if (existing) return NextResponse.json({ error: "لديك طلب معلّق" }, { status: 409 });
    const request = await db.joinRequest.create({
      data: { requesterId: user.id, cohortId, groupId: groupId ?? null, status: "pending", message: message?.trim() ?? "" } as never,
    });
    return NextResponse.json({ request });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
