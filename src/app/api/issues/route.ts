/**
 * Issue Reports API (التبليغات) — round 6.
 *
 * LOGICAL FLAW: students could REPORT problems ("تبليغ عن مشكلة" buttons on
 * the courses/assignments screens) but there was NO way for any supervisor
 * to SEE the reports — no GET endpoint, no admin UI. Reports vanished into
 * the database. This closes the loop:
 *
 *   POST   { itemType, itemTitle, description } → students report (existing)
 *   GET    → list all reports (supervisors only, newest first)
 *   PATCH  { id, status } → mark resolved / reopen (supervisors)
 *   DELETE ?id= → remove a report (supervisors)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canManageRoles } from "@/lib/auth/permissions";
import { notifyReportSubmitted, notifyReportResolved } from "@/lib/notifications";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

/** r69: عمود reporter_id غير منشأ في الإنتاج بعد (SQL الجولة 56 اختياري) —
 * نتائج PostgREST: 42703 «column ... does not exist». كل عملية عليه تتراجع
 * بلا العمود فيعمل التبليغ فوراً، ويظل إشعار الحل يعمل بمطابقة الاسم. */
function reporterIdMissing(e: unknown): boolean {
  if (e == null) return false;
  const err = e as { message?: unknown; code?: unknown; error?: { message?: unknown; code?: unknown } };
  const msg = [err.message, err.code, err.error?.message, err.error?.code]
    .map((x) => (x == null ? "" : String(x)))
    .join(" ");
  return /reporter_id/i.test(msg) || /42703/.test(msg);
}

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
      // r69: نحاول أولاً بعمود المُبلِّغ (r56)، وإن غاب العمود في هذا الإنتاج
      // نعيد المحاولة بدونه — فلا يتعطل التبليغ أبداً غياب عمود اختياري.
      const baseRow = {
        student_name: user.fullName,
        student_group: user.scopeCohortGroupId ? String(user.scopeCohortGroupId) : "بلا فوج",
        item_type: itemType.trim(), item_title: itemTitle.trim(),
        description: description?.trim() ?? "", date: now, status: "قيد المراجعة",
      };
      let { data, error } = await supabase
        .from("student_issue_reports")
        .insert({ ...baseRow, reporter_id: user.id })
        .select()
        .single();
      if (error && reporterIdMissing(error)) {
        ({ data, error } = await supabase.from("student_issue_reports").insert(baseRow).select().single());
      }
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      // round 10 (review §14/§4): the report announces itself to supervisors
      // instead of waiting to be discovered in the "التبليغات" tab.
      await notifyReportSubmitted({
        reporterId: user.id,
        studentName: user.fullName,
        itemTitle: itemTitle.trim(),
      });
      return NextResponse.json({ report: data });
    }
    const report = await db.studentIssueReport.create({
      data: {
        studentName: user.fullName,
        studentGroup: user.scopeCohortGroupId ? String(user.scopeCohortGroupId) : "بلا فوج",
        itemType: itemType.trim(), itemTitle: itemTitle.trim(),
        description: description?.trim() ?? "", date: now,
        // round 56 — reporter identity for the resolution notification
        reporterId: user.id,
      },
    });
    await notifyReportSubmitted({
      reporterId: user.id,
      studentName: user.fullName,
      itemTitle: itemTitle.trim(),
    });
    return NextResponse.json({ report });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }
  if (!canManageRoles(user)) {
    return NextResponse.json({ error: "غير مصرّح — التبليغات متاحة للمشرفين" }, { status: 403 });
  }
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("student_issue_reports")
        .select("*")
        .order("id", { ascending: false })
        .limit(200);
      if (error) return NextResponse.json({ reports: [] });
      const reports = (data ?? []).map((r: Record<string, unknown>) => ({
        id: Number(r.id), studentName: String(r.student_name ?? ""),
        studentGroup: String(r.student_group ?? ""), itemType: String(r.item_type ?? ""),
        itemTitle: String(r.item_title ?? ""), description: String(r.description ?? ""),
        date: String(r.date ?? ""), status: String(r.status ?? "قيد المراجعة"),
      }));
      return NextResponse.json({ reports });
    }
    const rows = await db.studentIssueReport.findMany({ orderBy: { id: "desc" }, take: 200 });
    return NextResponse.json({
      reports: rows.map((r) => ({
        id: r.id, studentName: r.studentName, studentGroup: r.studentGroup,
        itemType: r.itemType, itemTitle: r.itemTitle, description: r.description,
        date: r.date, status: r.status,
      })),
    });
  } catch (e) {
    return NextResponse.json({ reports: [] });
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }
  if (!canManageRoles(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { id, status } = body;
    if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
    const nextStatus = String(status ?? "").trim();
    if (nextStatus !== "تم الحل" && nextStatus !== "قيد المراجعة") {
      return NextResponse.json({ error: "الحالة يجب أن تكون 'تم الحل' أو 'قيد المراجعة'" }, { status: 400 });
    }
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      // round 56 — read identity + previous status so we can notify the
      // reporter of the OUTCOME (owner: «لا يصلني إشعار عند الحل»)
      // r69: عمود المُبلِّغ اختياري — إن غاب نقرأ بدونه (الإشعار يسقط إلى
      // مطابقة full_name كما كان قبل الجولة 56).
      let report: Record<string, unknown> | null = null;
      const primary = await supabase
        .from("student_issue_reports")
        .select("id, status, student_name, item_title, reporter_id")
        .eq("id", Number(id)).maybeSingle();
      if (primary.error && reporterIdMissing(primary.error)) {
        const fallback = await supabase
          .from("student_issue_reports")
          .select("id, status, student_name, item_title")
          .eq("id", Number(id)).maybeSingle();
        report = (fallback.data ?? null) as Record<string, unknown> | null;
      } else {
        report = (primary.data ?? null) as Record<string, unknown> | null;
      }
      if (!report) return NextResponse.json({ error: "التبليغ غير موجود" }, { status: 404 });
      const prevStatus = String(report.status ?? "");
      const { error } = await supabase
        .from("student_issue_reports").update({ status: nextStatus }).eq("id", Number(id));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      // notify the reporter ONLY when the status actually CHANGES to
      // resolved (or back to review) — a repeated PATCH of the same
      // status is not news.
      if (prevStatus !== nextStatus) {
        await notifyReportResolved({
          reporterId: report.reporter_id != null ? Number(report.reporter_id) : null,
          reporterName: String(report.student_name ?? ""),
          itemTitle: String(report.item_title ?? ""),
          resolved: nextStatus === "تم الحل",
        });
      }
    } else {
      const report = await db.studentIssueReport.findUnique({
        where: { id: Number(id) },
        select: { id: true, status: true, studentName: true, itemTitle: true, reporterId: true },
      });
      if (!report) return NextResponse.json({ error: "التبليغ غير موجود" }, { status: 404 });
      await db.studentIssueReport.update({ where: { id: Number(id) }, data: { status: nextStatus } });
      if (report.status !== nextStatus) {
        await notifyReportResolved({
          reporterId: report.reporterId,
          reporterName: report.studentName,
          itemTitle: report.itemTitle,
          resolved: nextStatus === "تم الحل",
        });
      }
    }
    return NextResponse.json({ ok: true, message: nextStatus === "تم الحل" ? "تم حل التبليغ" : "أُعيد التبليغ للمراجعة" });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }
  if (!canManageRoles(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
  const reportId = parseInt(id);
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: report } = await supabase
        .from("student_issue_reports").select("id").eq("id", reportId).maybeSingle();
      if (!report) return NextResponse.json({ error: "التبليغ غير موجود" }, { status: 404 });
      const { error } = await supabase.from("student_issue_reports").delete().eq("id", reportId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const report = await db.studentIssueReport.findUnique({ where: { id: reportId }, select: { id: true } });
      if (!report) return NextResponse.json({ error: "التبليغ غير موجود" }, { status: 404 });
      await db.studentIssueReport.delete({ where: { id: reportId } });
    }
    return NextResponse.json({ ok: true, message: "تم حذف التبليغ" });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
