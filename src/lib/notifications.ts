/**
 * App Notification emitter — round 10, System Review §3/§4/§16.
 *
 * The app previously had NO real notification channel: "notifications" were
 * only unread ANNOUNCEMENTS. A student never learned their join request was
 * approved/rejected (review §3 "what happens after"), and a supervisor was
 * never told a request/report is waiting (review §4 "notification badge").
 *
 * This module is the single server-side emitter for app_notifications
 * (Prisma locally / Supabase app_notifications table in production — see
 * download/supabase_notifications.sql). All inserts happen here so every
 * event stays consistent in wording, payload shape, and recipient routing.
 *
 * Recipient routing rules:
 *   join_new       → every supervisor for whom requestVisibleTo(cohort) is
 *                    true — the exact set that will see it in their
 *                    "الطلبات" tab (scope module, single source of truth).
 *   join_approved / join_rejected → the requesting student only.
 *   report_new     → every supervisor (reports are not scope-routed today;
 *                    the issues tab shows them to all supervisors).
 */
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadScopeContext, requestVisibleTo } from "@/lib/auth/scope";
import type { ScopedUserLike } from "@/lib/auth/scope";
import { canManageRoles } from "@/lib/auth/permissions";
import type { AuthUser } from "@/lib/auth/permissions";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export type NotificationType =
  | "join_new"
  | "join_approved"
  | "join_rejected"
  | "report_new"
  | "content_announcement"
  | "content_exam"
  | "content_assignment"
  | "content_library"
  | "exam_reminder"
  | "assignment_reminder"
  | "generic";

export interface NewNotification {
  userId: number;
  type: NotificationType;
  title: string;
  body?: string;
  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------
// round 24 — notification categories & preferences (anti-spam).
// Every type maps to exactly one user-muteable category, or to
// null = "never muteable" (transactional outcomes of the user's
// own request, and internal generic events).
// ---------------------------------------------------------------
export const MUTABLE_CATEGORIES = [
  "announcements",
  "exams",
  "assignments",
  "library",
  "reminders",
  "group_events",
  "reports",
] as const;

export type MuteableCategory = (typeof MUTABLE_CATEGORIES)[number];

const TYPE_TO_CATEGORY: Record<string, MuteableCategory | null> = {
  join_new: "group_events",
  join_approved: null, // own request outcome — always delivered
  join_rejected: null, // own request outcome — always delivered
  report_new: "reports",
  content_announcement: "announcements",
  content_exam: "exams",
  content_assignment: "assignments",
  content_library: "library",
  exam_reminder: "reminders",
  assignment_reminder: "reminders",
  generic: null,
};

export function categoryOf(type: string): MuteableCategory | null {
  return TYPE_TO_CATEGORY[type] ?? null;
}

/** Parse a stored muted_types JSON string into a clean category set. */
export function parseMutedTypes(raw: string): MuteableCategory[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => String(x))
      .filter((x): x is MuteableCategory =>
        (MUTABLE_CATEGORIES as readonly string[]).includes(x)
      );
  } catch {
    return [];
  }
}

/** Load muted categories for a batch of users (both layers).
 *  Graceful on every failure: a missing table or an error simply
 *  means "nothing muted" — preferences must never break delivery. */
async function loadMutedMap(userIds: number[]): Promise<Map<number, Set<MuteableCategory>>> {
  const map = new Map<number, Set<MuteableCategory>>();
  if (userIds.length === 0) return map;
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("notification_prefs")
        .select("user_id, muted_types")
        .in("user_id", userIds);
      if (error) {
        // missing table (PGRST205 etc.) or transient error → no mutes applied
        return map;
      }
      for (const row of data ?? []) {
        const id = Number((row as Record<string, unknown>).user_id);
        const muted = parseMutedTypes(String((row as Record<string, unknown>).muted_types ?? "[]"));
        if (muted.length > 0) map.set(id, new Set(muted));
      }
      return map;
    }
    const rows = await db.notificationPref.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, mutedTypes: true },
    });
    for (const row of rows) {
      const muted = parseMutedTypes(row.mutedTypes);
      if (muted.length > 0) map.set(row.userId, new Set(muted));
    }
    return map;
  } catch (e) {
    console.error("[notifications] prefs load failed:", (e as Error).message);
    return map;
  }
}

/** Insert notifications (both branches), FILTERED by recipient
 *  preferences. Never throws — notification failure must not break
 *  the business action that triggered it. */
export async function createNotifications(items: NewNotification[]): Promise<void> {
  if (items.length === 0) return;
  try {
    // round 24: drop items whose category the recipient has muted
    const mutedMap = await loadMutedMap(Array.from(new Set(items.map((n) => n.userId))));
    const deliverable = items.filter((n) => {
      const cat = categoryOf(n.type);
      if (cat == null) return true; // never muteable
      return !mutedMap.get(n.userId)?.has(cat);
    });
    if (deliverable.length === 0) return;

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.from("app_notifications").insert(
        deliverable.map((n) => ({
          user_id: n.userId,
          type: n.type,
          title: n.title,
          body: n.body ?? "",
          meta: JSON.stringify(n.meta ?? {}),
        }))
      );
      if (error) console.error("[notifications] insert failed:", error.message);
      return;
    }
    await db.appNotification.createMany({
      data: deliverable.map((n) => ({
        userId: n.userId,
        type: n.type,
        title: n.title,
        body: n.body ?? "",
        meta: JSON.stringify(n.meta ?? {}),
      })) as never,
    });
  } catch (e) {
    console.error("[notifications] insert failed:", (e as Error).message);
  }
}

/** Load every supervisory user (excluding one id) as ScopedUserLike. */
async function loadSupervisors(excludeId: number): Promise<ScopedUserLike[]> {
  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("app_users")
      .select(
        "id, role, assigned_specialty_id, scope_institution_id, scope_specialty_id, scope_academic_year_id, scope_group_id, scope_cohort_group_id"
      )
      .neq("id", excludeId);
    return (data ?? []).map((u: Record<string, unknown>) => ({
      id: Number(u.id),
      role: String(u.role) as ScopedUserLike["role"],
      assignedSpecialtyId: Number(u.assigned_specialty_id ?? 0),
      scopeInstitutionId: u.scope_institution_id != null ? Number(u.scope_institution_id) : null,
      scopeSpecialtyId: u.scope_specialty_id != null ? Number(u.scope_specialty_id) : null,
      scopeAcademicYearId: u.scope_academic_year_id != null ? Number(u.scope_academic_year_id) : null,
      scopeGroupId: u.scope_group_id != null ? Number(u.scope_group_id) : null,
      scopeCohortGroupId: u.scope_cohort_group_id != null ? Number(u.scope_cohort_group_id) : null,
    }));
  }
  const users = await db.appUser.findMany({
    where: { id: { not: excludeId } },
    select: {
      id: true,
      role: true,
      assignedSpecialtyId: true,
      scopeInstitutionId: true,
      scopeSpecialtyId: true,
      scopeAcademicYearId: true,
      scopeGroupId: true,
      scopeCohortGroupId: true,
    },
  });
  return users as unknown as ScopedUserLike[];
}

/**
 * §3/§4 — a NEW join request must announce itself to the supervisors who
 * can review it (same routing as the pending list), instead of waiting to
 * be discovered in a tab.
 */
export async function notifyJoinRequestSubmitted(opts: {
  requesterId: number;
  requesterName: string;
  requestId: number;
  cohortId: number;
  cohortName: string;
}): Promise<void> {
  try {
    const supervisors = await loadSupervisors(opts.requesterId);
    const ctx = await loadScopeContext();
    const recipients = supervisors.filter(
      (u) =>
        canManageRoles(u as AuthUser) &&
        requestVisibleTo(u, opts.cohortId, ctx)
    );
    await createNotifications(
      recipients.map((u) => ({
        userId: u.id,
        type: "join_new" as const,
        title: "طلب انضمام جديد",
        body: `أرسل ${opts.requesterName} طلباً للانضمام إلى «${opts.cohortName}». يتطلب الأمر مراجعتك.`,
        meta: { requestId: opts.requestId, cohortId: opts.cohortId },
      }))
    );
  } catch (e) {
    console.error("[notifications] join_new fan-out failed:", (e as Error).message);
  }
}

/** §3 — the student is told the outcome of their request (approve). */
export async function notifyJoinRequestApproved(opts: {
  studentId: number;
  cohortName: string;
  note?: string;
}): Promise<void> {
  await createNotifications([
    {
      userId: opts.studentId,
      type: "join_approved",
      title: "تم قبول طلب الانضمام",
      body: `تم قبول طلبك — أنت الآن عضو في «${opts.cohortName}».${
        opts.note?.trim() ? ` ملاحظة المراجع: ${opts.note.trim()}` : ""
      }`,
      meta: { cohortName: opts.cohortName },
    },
  ]);
}

/** §3 — the student is told the outcome of their request (reject) + that
 *  they may submit a new request (review §3 "whether the student can
 *  request again"). */
export async function notifyJoinRequestRejected(opts: {
  studentId: number;
  cohortName: string;
  note?: string;
}): Promise<void> {
  await createNotifications([
    {
      userId: opts.studentId,
      type: "join_rejected",
      title: "تم رفض طلب الانضمام",
      body: `لم يُقبل طلبك للانضمام إلى «${opts.cohortName}».${
        opts.note?.trim() ? ` السبب: ${opts.note.trim()}.` : ""
      } يمكنك إرسال طلب جديد إلى فوج آخر من شاشة «تصفح المجموعات».`,
      meta: { cohortName: opts.cohortName },
    },
  ]);
}

/** §14-adjacent — a new student report announces itself to supervisors. */
export async function notifyReportSubmitted(opts: {
  reporterId: number;
  studentName: string;
  itemTitle: string;
}): Promise<void> {
  try {
    const supervisors = await loadSupervisors(opts.reporterId);
    const recipients = supervisors.filter((u) => canManageRoles(u as AuthUser));
    await createNotifications(
      recipients.map((u) => ({
        userId: u.id,
        type: "report_new" as const,
        title: "تبليغ جديد من طالب",
        body: `بلّغ ${opts.studentName} عن مشكلة: «${opts.itemTitle}». بانتظار المراجعة.`,
        meta: {},
      }))
    );
  } catch (e) {
    console.error("[notifications] report_new fan-out failed:", (e as Error).message);
  }
}
