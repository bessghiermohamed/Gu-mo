import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";

const isVercel = process.env.VERCEL === "1";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "يجب تسجيل الدخول لإرسال تبليغ" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const { itemType, itemTitle, description } = body;
    if (!itemType?.trim() || !itemTitle?.trim()) {
      return NextResponse.json({ error: "نوع المشكلة وعنوانها مطلوبان" }, { status: 400 });
    }
    const now = new Date().toISOString().split("T")[0];
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.from("student_issue_reports").insert({
        student_name: user.fullName,
        student_group: user.scopeCohortGroupId ? String(user.scopeCohortGroupId) : "بلا فوج",
        item_type: itemType.trim(), item_title: itemTitle.trim(),
        description: description?.trim() ?? "", date: now, status: "قيد المراجعة",
      }).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ report: data });
    }
    const report = await db.studentIssueReport.create({
      data: {
        studentName: user.fullName,
        studentGroup: user.scopeCohortGroupId ? String(user.scopeCohortGroupId) : "بلا فوج",
        itemType: itemType.trim(), itemTitle: itemTitle.trim(),
        description: description?.trim() ?? "", date: now,
      },
    });
    return NextResponse.json({ report });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
