/**
 * Content Upload API (fix A.3 + A.5)
 * - POST: upload content. Body must include `contentType`:
 *     "lecture" → table "lectures"        (ModuleCourse → Lecture)
 *     "exam"    → table "exams"           (ModuleCourse → Exam)
 *     "announcement" → table "announcements"
 *     "assignment"   → table "assignments"
 *   Also writes a row to content_upload_logs for traceability.
 *   Requires canUploadContent.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canUploadContent } from "@/lib/auth/permissions";

const isVercel = process.env.VERCEL === "1";

const VALID_TYPES = new Set([
  "lecture",
  "exam",
  "announcement",
  "assignment",
]);

const TYPE_TO_TABLE: Record<string, string> = {
  lecture: "lectures",
  exam: "exams",
  announcement: "announcements",
  assignment: "assignments",
};

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "غير مسجّل الدخول" }, { status: 401 });
  }
  if (!canUploadContent(user)) {
    return NextResponse.json(
      { error: "غير مصرّح: رفع المحتوى يتطلب صلاحية إشراف" },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const {
      contentType,
      title,
      moduleId,
      summary,
      content,
      description,
      dueDate,
      examDate,
      time,
      room,
      author,
      urgency,
      weekNumber,
      date,
      visibilityScope,
      targetGroup,
      pdfUrl,
      pdfFileName,
    } = body ?? {};

    if (!contentType || !VALID_TYPES.has(String(contentType))) {
      return NextResponse.json(
        {
          error: `نوع المحتوى غير صالح. الأنواع المدعومة: lecture, exam, announcement, assignment`,
        },
        { status: 400 }
      );
    }

    if (!title || !String(title).trim()) {
      return NextResponse.json(
        { error: "العنوان مطلوب" },
        { status: 400 }
      );
    }

    const type = String(contentType);
    const table = TYPE_TO_TABLE[type];
    const uploadedAtISO = new Date().toISOString();

    // Build payload per content type (snake_case for Supabase)
    const supabasePayload: Record<string, unknown> = {
      visibility_scope: String(visibilityScope ?? "تخصص كامل"),
      target_group: String(targetGroup ?? "الكل"),
    };

    if (type === "lecture") {
      if (!moduleId) {
        return NextResponse.json(
          { error: "moduleId مطلوب للمحاضرات" },
          { status: 400 }
        );
      }
      supabasePayload.module_id = Number(moduleId);
      supabasePayload.title = String(title).trim();
      supabasePayload.summary = String(summary ?? "");
      supabasePayload.week_number = Number(weekNumber ?? 1);
      supabasePayload.pdf_url = String(pdfUrl ?? "");
      supabasePayload.pdf_file_name = String(pdfFileName ?? "lecture_notes.pdf");
      supabasePayload.date = String(date ?? "");
      supabasePayload.author_name = String(author ?? user.fullName);
    } else if (type === "exam") {
      if (!moduleId) {
        return NextResponse.json(
          { error: "moduleId مطلوب للامتحانات" },
          { status: 400 }
        );
      }
      supabasePayload.module_id = Number(moduleId);
      supabasePayload.title = String(title).trim();
      supabasePayload.exam_date = String(examDate ?? "");
      supabasePayload.time = String(time ?? "");
      supabasePayload.room = String(room ?? "");
    } else if (type === "assignment") {
      if (!moduleId) {
        return NextResponse.json(
          { error: "moduleId مطلوب للواجبات" },
          { status: 400 }
        );
      }
      supabasePayload.module_id = Number(moduleId);
      supabasePayload.title = String(title).trim();
      supabasePayload.due_date = String(dueDate ?? "");
      supabasePayload.description = String(description ?? "");
    } else if (type === "announcement") {
      supabasePayload.title = String(title).trim();
      supabasePayload.content = String(content ?? "");
      supabasePayload.author = String(author ?? user.fullName);
      supabasePayload.date = String(date ?? uploadedAtISO.slice(0, 10));
      supabasePayload.urgency = String(urgency ?? "عام");
      supabasePayload.specialty_id = user.assignedSpecialtyId;
    }

    let savedRow: unknown = null;

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from(table)
        .insert(supabasePayload)
        .select()
        .single();
      if (error) {
        // Still log the attempt
        await supabase.from("content_upload_logs").insert({
          content_type: type,
          target_table: table,
          title: String(title).trim(),
          uploaded_by_id: user.id,
          cloud_status: "failed",
          cloud_url: "",
          error_message: error.message,
          payload: JSON.stringify(supabasePayload),
        });
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      savedRow = data;

      // Log success
      await supabase.from("content_upload_logs").insert({
        content_type: type,
        target_table: table,
        title: String(title).trim(),
        uploaded_by_id: user.id,
        cloud_status: "uploaded",
        cloud_url: "",
        error_message: "",
        payload: JSON.stringify(data),
      });
      return NextResponse.json({ ok: true, type, table, row: data });
    }

    // Prisma local path: build matching payload (camelCase)
    if (type === "lecture") {
      savedRow = await db.lecture.create({
        data: {
          moduleId: Number(moduleId),
          title: String(title).trim(),
          summary: String(summary ?? ""),
          weekNumber: Number(weekNumber ?? 1),
          pdfUrl: String(pdfUrl ?? ""),
          pdfFileName: String(pdfFileName ?? "lecture_notes.pdf"),
          date: String(date ?? ""),
          authorName: String(author ?? user.fullName),
          visibilityScope: String(visibilityScope ?? "تخصص كامل"),
          targetGroup: String(targetGroup ?? "الكل"),
        },
      });
    } else if (type === "exam") {
      savedRow = await db.exam.create({
        data: {
          moduleId: Number(moduleId),
          title: String(title).trim(),
          examDate: String(examDate ?? ""),
          time: String(time ?? ""),
          room: String(room ?? ""),
          visibilityScope: String(visibilityScope ?? "تخصص كامل"),
          targetGroup: String(targetGroup ?? "الكل"),
          moduleName: "",
        },
      });
    } else if (type === "assignment") {
      savedRow = await db.assignment.create({
        data: {
          moduleId: Number(moduleId),
          title: String(title).trim(),
          dueDate: String(dueDate ?? ""),
          description: String(description ?? ""),
          visibilityScope: String(visibilityScope ?? "تخصص كامل"),
          targetGroup: String(targetGroup ?? "الكل"),
        },
      });
    } else if (type === "announcement") {
      savedRow = await db.announcement.create({
        data: {
          title: String(title).trim(),
          content: String(content ?? ""),
          author: String(author ?? user.fullName),
          date: String(date ?? uploadedAtISO.slice(0, 10)),
          urgency: String(urgency ?? "عام"),
          specialtyId: user.assignedSpecialtyId,
          visibilityScope: String(visibilityScope ?? "تخصص كامل"),
          targetGroups: String(targetGroup ?? "الكل"),
        },
      });
    }

    // Log success locally
    await db.contentUploadLog.create({
      data: {
        contentType: type,
        targetTable: table,
        title: String(title).trim(),
        uploadedById: user.id,
        cloudStatus: "uploaded",
        cloudUrl: "",
        errorMessage: "",
        payload: JSON.stringify(savedRow),
      },
    });

    return NextResponse.json({ ok: true, type, table, row: savedRow });
  } catch (e) {
    return NextResponse.json(
      { error: `خطأ داخلي: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
