/**
 * Temporal Reminder Generation — round 24 (notification system completion).
 *
 * POST { completedAssignmentIds?: number[] }
 *   → { created: number, examsChecked, assignmentsChecked }
 *
 * Generates idempotent exam & assignment-deadline reminders for the
 * CURRENT user:
 *   exam_reminder       D-3 / D-1 / D-0 buckets ("قبل ثلاثة أيام", "غداً", "اليوم")
 *   assignment_reminder D-2 / D-1 / D-0 buckets (skipping assignments the
 *   CLIENT reports as completed — completion state lives in the student's
 *   localStorage, the server cannot know it)
 *
 * Idempotency: a deterministic meta signature {examId,bucket} /
 * {assignmentId,bucket} is embedded in the notification meta. Before
 * inserting, the route checks for an existing reminder with the same
 * type + user + meta signature, so repeated calls (the client calls on
 * app mount and every 10 minutes) never duplicate a reminder.
 *
 * Why generation-on-poll instead of a cron: Vercel Hobby allows a single
 * daily cron — not enough for day-level buckets, and reminders only
 * matter when the student actually opens the app. The client triggers
 * this route on mount + every 10 minutes (NOT the 30s poll — the 30s
 * loop stays read-only so the round-13 polling-cost ceiling is not
 * worsened).
 *
 * Reminder texts are the same on both layers; recipient = the caller.
 * Muted "reminders"/"exams"/"assignments" categories are respected by
 * createNotifications (prefs filter) — the category of exam_reminder is
 * "reminders", so muting reminders silences everything here.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { createNotifications, type NewNotification } from "@/lib/notifications";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

interface ExamRow {
  id: number;
  title: string;
  moduleName: string;
  examDate: string; // YYYY-MM-DD expected (string-compare safe at 0-padded ISO dates)
}

interface AssignmentRow {
  id: number;
  title: string;
  moduleName: string;
  dueDate: string;
}

/** Parse YYYY-MM-DD defensively; returns null on junk (exam_date is a
 *  free TEXT column — round 12 already flagged its fragility). */
function dayDiff(dateStr: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr ?? "").trim());
  if (!m) return null;
  const target = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(target)) return null;
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - todayUtc) / 86400000);
}

function examBucket(diff: number): string | null {
  if (diff === 3) return "D3";
  if (diff === 1) return "D1";
  if (diff === 0) return "D0";
  return null;
}

function assignmentBucket(diff: number): string | null {
  if (diff === 2) return "D2";
  if (diff === 1) return "D1";
  if (diff === 0) return "D0";
  return null;
}

function bucketLabel(bucket: string): string {
  if (bucket === "D0") return "اليوم";
  if (bucket === "D1") return "غداً";
  if (bucket === "D2") return "بعد يومين";
  return "بعد ثلاثة أيام";
}

async function loadExams(specialtyId: number): Promise<ExamRow[]> {
  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("exams")
      .select("id, title, exam_date, module_name, module_courses!exams_module_id_fkey(specialty_id)")
      .order("exam_date", { ascending: true })
      .limit(200);
    if (error) return [];
    return (data ?? [])
      .filter((r: Record<string, unknown>) => {
        const rel = r.module_courses;
        const sid = Number(
          Array.isArray(rel) ? (rel as Array<Record<string, unknown>>)[0]?.specialty_id : (rel as Record<string, unknown> | null)?.specialty_id
        );
        return sid === specialtyId;
      })
      .map((r: Record<string, unknown>) => ({
        id: Number(r.id),
        title: String(r.title ?? ""),
        moduleName: String(r.module_name ?? ""),
        examDate: String(r.exam_date ?? ""),
      }));
  }
  const rows = await db.exam.findMany({
    where: { module: { specialtyId } },
    select: { id: true, title: true, examDate: true, moduleName: true },
    orderBy: { examDate: "asc" },
    take: 200,
  });
  return rows.map((r) => ({ id: r.id, title: r.title, moduleName: r.moduleName, examDate: r.examDate }));
}

async function loadAssignments(specialtyId: number): Promise<AssignmentRow[]> {
  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("assignments")
      .select("id, title, due_date, module_courses!assignments_module_id_fkey(specialty_id, name)")
      .order("due_date", { ascending: true })
      .limit(200);
    if (error) return [];
    return (data ?? [])
      .filter((r: Record<string, unknown>) => {
        const rel = r.module_courses;
        const sid = Number(
          Array.isArray(rel) ? (rel as Array<Record<string, unknown>>)[0]?.specialty_id : (rel as Record<string, unknown> | null)?.specialty_id
        );
        return sid === specialtyId;
      })
      .map((r: Record<string, unknown>) => {
        const rel = r.module_courses as Record<string, unknown> | Array<Record<string, unknown>>;
        const modName = String((Array.isArray(rel) ? rel[0]?.name : rel?.name) ?? "");
        return {
          id: Number(r.id),
          title: String(r.title ?? ""),
          moduleName: modName,
          dueDate: String(r.due_date ?? ""),
        };
      });
  }
  const rows = await db.assignment.findMany({
    where: { module: { specialtyId } },
    select: { id: true, title: true, dueDate: true, module: { select: { name: true } } },
    orderBy: { dueDate: "asc" },
    take: 200,
  });
  return rows.map((r) => ({ id: r.id, title: r.title, moduleName: r.module.name, dueDate: r.dueDate }));
}

/** Which reminders for this user already exist? Loads the most recent
 *  reminders of both types and collects their meta signatures. */
async function loadExistingSignatures(userId: number): Promise<Set<string>> {
  const sigs = new Set<string>();
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("app_notifications")
        .select("meta")
        .eq("user_id", userId)
        .in("type", ["exam_reminder", "assignment_reminder"])
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) return sigs;
      for (const row of data ?? []) {
        try {
          const meta = JSON.parse(String((row as Record<string, unknown>).meta ?? "{}")) as Record<string, unknown>;
          const kind = meta.examId != null ? "exam" : meta.assignmentId != null ? "assignment" : null;
          if (kind && meta.bucket != null) {
            sigs.add(`${kind}:${kind === "exam" ? meta.examId : meta.assignmentId}:${meta.bucket}`);
          }
        } catch {
          // junk meta — ignore
        }
      }
      return sigs;
    }
    const rows = await db.appNotification.findMany({
      where: { userId, type: { in: ["exam_reminder", "assignment_reminder"] } },
      select: { meta: true },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    for (const row of rows) {
      try {
        const meta = JSON.parse(row.meta) as Record<string, unknown>;
        const kind = meta.examId != null ? "exam" : meta.assignmentId != null ? "assignment" : null;
        if (kind && meta.bucket != null) {
          sigs.add(`${kind}:${kind === "exam" ? meta.examId : meta.assignmentId}:${meta.bucket}`);
        }
      } catch {
        // junk meta — ignore
      }
    }
    return sigs;
  } catch (e) {
    console.error("[reminders] signature load failed:", (e as Error).message);
    return sigs;
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const completedIds = new Set(
      (Array.isArray((body as Record<string, unknown>)?.completedAssignmentIds) ? (body as Record<string, unknown>).completedAssignmentIds as unknown[] : [])
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n))
    );

    const [exams, assignments, existing] = await Promise.all([
      loadExams(user.assignedSpecialtyId),
      loadAssignments(user.assignedSpecialtyId),
      loadExistingSignatures(user.id),
    ]);

    const pending: NewNotification[] = [];

    for (const exam of exams) {
      const diff = dayDiff(exam.examDate);
      if (diff == null || diff < 0) continue; // past or unparseable date
      const bucket = examBucket(diff);
      if (!bucket) continue; // not in a reminder window
      if (existing.has(`exam:${exam.id}:${bucket}`)) continue;
      pending.push({
        userId: user.id,
        type: "exam_reminder",
        title: diff === 0 ? "اختبار اليوم" : diff === 1 ? "اختبار غداً" : "اختبار بعد ثلاثة أيام",
        body: `«${exam.title}»${exam.moduleName ? ` — ${exam.moduleName}` : ""} • ${exam.examDate}${diff === 0 ? " — بالتوفيق!" : ""}`,
        meta: { examId: exam.id, bucket, examDate: exam.examDate, urgency: diff <= 1 ? "عاجل" : "هام" },
      });
    }

    for (const asg of assignments) {
      if (completedIds.has(asg.id)) continue; // the student already did it
      const diff = dayDiff(asg.dueDate);
      if (diff == null || diff < 0) continue;
      const bucket = assignmentBucket(diff);
      if (!bucket) continue;
      if (existing.has(`assignment:${asg.id}:${bucket}`)) continue;
      pending.push({
        userId: user.id,
        type: "assignment_reminder",
        title: `موعد تسليم واجب ${bucketLabel(bucket)}`,
        body: `«${asg.title}»${asg.moduleName ? ` — ${asg.moduleName}` : ""} • آخر موعد: ${asg.dueDate}`,
        meta: { assignmentId: asg.id, bucket, dueDate: asg.dueDate, urgency: diff === 0 ? "عاجل" : "هام" },
      });
    }

    // createNotifications applies the prefs filter (muted reminders/exams/
    // assignments categories) and never throws.
    await createNotifications(pending);

    return NextResponse.json({
      created: pending.length,
      examsChecked: exams.length,
      assignmentsChecked: assignments.length,
    });
  } catch (e) {
    // a failed generation must never surface as an app error
    return NextResponse.json({ created: 0, error: (e as Error).message });
  }
}
