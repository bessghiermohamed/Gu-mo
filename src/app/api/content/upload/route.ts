import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canUploadContent } from "@/lib/auth/permissions";

const isVercel = process.env.VERCEL === "1";
const TABLE_MAP: Record<string, string> = {
  lecture: "lectures", exam: "exams", announcement: "announcements", assignment: "assignments",
};

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canUploadContent(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { contentType, title, description, moduleId } = body;
    if (!contentType || !TABLE_MAP[contentType]) {
      return NextResponse.json({ error: `نوع محتوى غير صالح: ${contentType}` }, { status: 400 });
    }
    if (!title?.trim()) return NextResponse.json({ error: "العنوان مطلوب" }, { status: 400 });
    const now = new Date().toISOString().split("T")[0];
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      let insertData: Record<string, unknown> = {};
      let insertTable = TABLE_MAP[contentType];
      if (contentType === "lecture") {
        insertTable = "lectures";
        insertData = { module_id: moduleId ?? 1, week_number: 1, title: title.trim(), summary: description?.trim() ?? "", author_name: user.fullName, date: now };
      } else if (contentType === "exam") {
        insertTable = "exams";
        insertData = { module_id: moduleId ?? 1, module_name: title.trim(), title: title.trim(), exam_date: now, time: "—", room: "—" };
      } else if (contentType === "announcement") {
        insertTable = "announcements";
        insertData = { title: title.trim(), content: description?.trim() ?? "", author: user.fullName, date: now, urgency: "عام", specialty_id: user.assignedSpecialtyId };
      } else if (contentType === "assignment") {
        insertTable = "assignments";
        insertData = { module_id: moduleId ?? 1, title: title.trim(), due_date: now, description: description?.trim() ?? "" };
      }
      const { data: saved, error } = await supabase.from(insertTable).insert(insertData).select().single();
      if (error || !saved) return NextResponse.json({ error: `فشل الحفظ: ${error?.message}` }, { status: 500 });
      await supabase.from("content_upload_logs").insert({
        content_type: contentType, target_table: TABLE_MAP[contentType], title: title.trim(),
        uploaded_by_id: user.id, cloud_status: "uploaded", cloud_url: "", error_message: "",
        payload: JSON.stringify({ id: saved.id, title, description }),
      });
      return NextResponse.json({ ok: true, id: saved.id, contentType, targetTable: TABLE_MAP[contentType], cloudStatus: "uploaded", errorMessage: "" });
    }
    let savedId: number | null = null;
    if (contentType === "lecture") {
      const l = await db.lecture.create({ data: { moduleId: moduleId ?? 1, weekNumber: 1, title: title.trim(), summary: description?.trim() ?? "", authorName: user.fullName, date: now } });
      savedId = l.id;
    } else if (contentType === "exam") {
      const e = await db.exam.create({ data: { moduleId: moduleId ?? 1, moduleName: title.trim(), title: title.trim(), examDate: now, time: "—", room: "—" } });
      savedId = e.id;
    } else if (contentType === "announcement") {
      const a = await db.announcement.create({ data: { title: title.trim(), content: description?.trim() ?? "", author: user.fullName, date: now, urgency: "عام", specialtyId: user.assignedSpecialtyId } });
      savedId = a.id;
    } else if (contentType === "assignment") {
      const a = await db.assignment.create({ data: { moduleId: moduleId ?? 1, title: title.trim(), dueDate: now, description: description?.trim() ?? "" } });
      savedId = a.id;
    }
    return NextResponse.json({ ok: true, id: savedId, contentType, targetTable: TABLE_MAP[contentType], cloudStatus: "uploaded", errorMessage: "" });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
