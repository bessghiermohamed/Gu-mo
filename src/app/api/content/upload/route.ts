/**
 * Content Upload API (fix A.3 + A.5)
 * Routes content to correct table based on contentType.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canUploadContent } from "@/lib/auth/permissions";

const isVercel = process.env.VERCEL === "1";

const TABLE_MAP: Record<string, string> = {
  lecture: "lectures",
  exam: "exams",
  announcement: "announcements",
  assignment: "assignments",
};

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canUploadContent(user)) {
    return NextResponse.json(
      { error: "غير مصرّح: أنت بحاجة إلى صلاحية الإشراف لرفع المحتوى" },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { contentType, title, description, moduleId } = body;

    if (!contentType || !TABLE_MAP[contentType]) {
      return NextResponse.json(
        { error: `نوع محتوى غير صالح: ${contentType}` },
        { status: 400 }
      );
    }

    if (!title?.trim()) {
      return NextResponse.json(
        { error: "العنوان مطلوب" },
        { status: 400 }
      );
    }

    const targetTable = TABLE_MAP[contentType];
    const now = new Date().toISOString().split("T")[0];
    let savedId: number | null = null;

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      let insertData: Record<string, unknown> = {};
      let insertTable = targetTable;

      if (contentType === "lecture") {
        insertTable = "lectures";
        insertData = {
          module_id: moduleId ?? 1,
          week_number: 1,
          title: title.trim(),
          summary: description?.trim() ?? "",
          author_name: user.fullName,
          date: now,
        };
      } else if (contentType === "exam") {
        insertTable = "exams";
        insertData = {
          module_id: moduleId ?? 1,
          module_name: title.trim(),
          title: title.trim(),
          exam_date: now,
          time: "—",
          room: "—",
        };
      } else if (contentType === "announcement") {
        insertTable = "announcements";
        insertData = {
          title: title.trim(),
          content: description?.trim() ?? "",
          author: user.fullName,
          date: now,
          urgency: "عام",
          specialty_id: user.assignedSpecialtyId,
        };
      } else if (contentType === "assignment") {
        insertTable = "assignments";
        insertData = {
          module_id: moduleId ?? 1,
          title: title.trim(),
          due_date: now,
          description: description?.trim() ?? "",
        };
      }

      const { data: saved, error: insertError } = await supabase
        .from(insertTable)
        .insert(insertData)
        .select()
        .single();

      if (insertError || !saved) {
        return NextResponse.json(
          { error: `فشل الحفظ: ${insertError?.message ?? "خطأ"}` },
          { status: 500 }
        );
      }
      savedId = saved.id;

      await supabase.from("content_upload_logs").insert({
        content_type: contentType,
        target_table: targetTable,
        title: title.trim(),
        uploaded_by_id: user.id,
        cloud_status: "uploaded",
        cloud_url: "",
        error_message: "",
        payload: JSON.stringify({ id: savedId, title, description }),
      });

      return NextResponse.json({
        ok: true,
        id: savedId,
        contentType,
        targetTable,
        cloudStatus: "uploaded",
        errorMessage: "",
      });
    }

    // Local
    if (contentType === "lecture") {
      const lecture = await db.lecture.create({
        data: {
          moduleId: moduleId ?? 1,
          weekNumber: 1,
          title: title.trim(),
          summary: description?.trim() ?? "",
          authorName: user.fullName,
          date: now,
        },
      });
      savedId = lecture.id;
    } else if (contentType === "exam") {
      const exam = await db.exam.create({
        data: {
          moduleId: moduleId ?? 1,
          moduleName: title.trim(),
          title: title.trim(),
          examDate: now,
          time: "—",
          room: "—",
        },
      });
      savedId = exam.id;
    } else if (contentType === "announcement") {
      const ann = await db.announcement.create({
        data: {
          title: title.trim(),
          content: description?.trim() ?? "",
          author: user.fullName,
          date: now,
          urgency: "عام",
          specialtyId: user.assignedSpecialtyId,
        },
      });
      savedId = ann.id;
    } else if (contentType === "assignment") {
      const assign = await db.assignment.create({
        data: {
          moduleId: moduleId ?? 1,
          title: title.trim(),
          dueDate: now,
          description: description?.trim() ?? "",
        },
      });
      savedId = assign.id;
    }

    const logEntry = await db.contentUploadLog.create({
      data: {
        contentType,
        targetTable,
        title: title.trim(),
        uploadedById: user.id,
        cloudStatus: "uploaded",
        cloudUrl: "",
        errorMessage: "",
        payload: JSON.stringify({ id: savedId, title, description }),
      },
    });

    return NextResponse.json({
      ok: true,
      id: savedId,
      contentType,
      targetTable,
      cloudStatus: logEntry.cloudStatus,
      errorMessage: logEntry.errorMessage,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `خطأ داخلي: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
