/**
 * Issues (Student Issue Reports) API
 * - POST: create a new issue report (any logged-in user)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";

const isVercel = process.env.VERCEL === "1";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "غير مسجّل الدخول" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { studentName, studentGroup, itemType, itemTitle, description } =
      body ?? {};

    if (!itemType || !itemTitle || !description) {
      return NextResponse.json(
        { error: "الحقول المطلوبة: itemType, itemTitle, description" },
        { status: 400 }
      );
    }

    const name = String(studentName ?? user.fullName).trim();
    const group = String(studentGroup ?? "").trim();
    const date = new Date().toISOString().slice(0, 10);

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("student_issue_reports")
        .insert({
          student_name: name,
          student_group: group,
          item_type: String(itemType),
          item_title: String(itemTitle).trim(),
          description: String(description).trim(),
          date,
          status: "قيد المراجعة",
          representative_note: "",
        })
        .select()
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ issue: data });
    }

    const issue = await db.studentIssueReport.create({
      data: {
        studentName: name,
        studentGroup: group,
        itemType: String(itemType),
        itemTitle: String(itemTitle).trim(),
        description: String(description).trim(),
        date,
        status: "قيد المراجعة",
        representativeNote: "",
      },
    });
    return NextResponse.json({ issue });
  } catch (e) {
    return NextResponse.json(
      { error: `خطأ داخلي: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
