/**
 * Announcements API — fix ج (no way to create announcements)
 * GET   → announcements visible to the caller's specialty
 * POST  → create an announcement (supervisors: REPRESENTATIVE with scope / SPECIALTY_ADMIN / OWNER)
 * PATCH → edit an announcement (round 5 — previously a mistake was permanent)
 * DELETE → remove an announcement (round 5 — previously impossible)
 *
 * Edit/delete eligibility (round 5):
 *   OWNER           → any announcement
 *   SPECIALTY_ADMIN → any announcement of their own specialty
 *   REPRESENTATIVE  → only announcements they authored, within their specialty
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { notifyContentPublished } from "@/lib/notifications";
import { canUploadContent, canManageRoles } from "@/lib/auth/permissions";
import { fetchAnnouncements } from "@/lib/data-layer";
import { loadScopeContext } from "@/lib/auth/scope";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

interface AnnouncementRow {
  id: number;
  specialty_id: number | null;
  author: string | null;
}

async function loadAnnouncement(id: number): Promise<AnnouncementRow | null> {
  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("announcements")
      .select("id, specialty_id, author")
      .eq("id", id)
      .maybeSingle();
    return data ? { id: Number(data.id), specialty_id: data.specialty_id == null ? null : Number(data.specialty_id), author: String(data.author ?? "") } : null;
  }
  const a = await db.announcement.findUnique({ where: { id } });
  return a ? { id: a.id, specialty_id: a.specialtyId == null ? null : Number(a.specialtyId), author: a.author } : null;
}

/** round 5: eligibility check shared by PATCH and DELETE */
function canEditAnnouncement(
  user: { role: string; assignedSpecialtyId: number; fullName: string },
  row: AnnouncementRow
): boolean {
  if (user.role === "OWNER") return true;
  if (row.specialty_id !== user.assignedSpecialtyId) return false;
  if (user.role === "SPECIALTY_ADMIN") return true;
  if (user.role === "REPRESENTATIVE") return row.author === user.fullName;
  return false;
}

// round 52 — نطاق الإعلانات: three visibility levels stored on the existing
// dead columns (visibilityScope / targetGroups). The target is validated
// against the caller's specialty so a cohort/year of ANOTHER specialty can
// never be targeted. Returns either the validated pair or an error string.
const SCOPE_LEVELS = ["تخصص كامل", "سنة دراسية", "فوج"] as const;

type ScopeUser = { role: string; assignedSpecialtyId: number; scopeTrackId?: number | null };

async function resolveScope(
  user: ScopeUser,
  scopeLevel: unknown,
  scopeTargetId: unknown
): Promise<{ visibilityScope: string; targetGroups: string } | { error: string }> {
  const level = SCOPE_LEVELS.includes(scopeLevel as (typeof SCOPE_LEVELS)[number])
    ? (scopeLevel as (typeof SCOPE_LEVELS)[number])
    : "تخصص كامل";
  if (level === "تخصص كامل") return { visibilityScope: level, targetGroups: "الكل" };
  const target = Number(scopeTargetId);
  if (!Number.isFinite(target) || target <= 0) {
    return { error: `حدّد ${level === "فوج" ? "الفوج" : "السنة الدراسية"} المستهدفة` };
  }
  const ctx = await loadScopeContext();
  if (level === "فوج") {
    const cohort = ctx.cohorts.get(target);
    if (!cohort || cohort.specialtyId !== user.assignedSpecialtyId) {
      return { error: "الفوج المحدد غير موجود في تخصصك" };
    }
    return { visibilityScope: level, targetGroups: String(target) };
  }
  // سنة دراسية
  let yearSpecialtyId: number | null = null;
  let yearTrackId: number | null = null;
  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.from("academic_years").select("id, specialty_id, track_id").eq("id", target).maybeSingle();
    if (!data) return { error: "السنة المحددة غير موجودة في تخصصك" };
    const r = data as Record<string, unknown>;
    yearSpecialtyId = Number(r.specialty_id);
    yearTrackId = r.track_id != null ? Number(r.track_id) : null;
  } else {
    const year = await db.academicYear.findUnique({ where: { id: target }, select: { specialtyId: true, trackId: true } });
    if (!year) return { error: "السنة المحددة غير موجودة في تخصصك" };
    yearSpecialtyId = year.specialtyId;
    yearTrackId = year.trackId ?? null;
  }
  if (yearSpecialtyId !== user.assignedSpecialtyId) {
    return { error: "السنة المحددة غير موجودة في تخصصك" };
  }
  // r70: a track-scoped REPRESENTATIVE may only target their own track's
  // year rows (or shared NULL-track years) — "السنة الثانية" of PEP and of
  // PEM are different years with the same name.
  if (
    user.role !== "OWNER" &&
    user.role !== "SPECIALTY_ADMIN" &&
    user.scopeTrackId != null &&
    yearTrackId != null &&
    yearTrackId !== user.scopeTrackId
  ) {
    return { error: "السنة المحددة تنتمي إلى ملمح آخر" };
  }
  return { visibilityScope: level, targetGroups: String(target) };
}

/** Human-readable scope label for the UI badges (server resolves the
 *  cohort/year names once per request — the client has no scope maps). */
async function scopeLabels(
  rows: Array<{ visibilityScope: string; targetGroups: string }>
): Promise<Map<string, string>> {
  const ctx = await loadScopeContext();
  const map = new Map<string, string>();
  for (const r of rows) {
    const key = `${r.visibilityScope}::${r.targetGroups}`;
    if (map.has(key) || r.visibilityScope === "تخصص كامل") continue;
    const id = Number(r.targetGroups);
    const label =
      r.visibilityScope === "فوج" ? ctx.cohorts.get(id)?.nameAr
      : r.visibilityScope === "سنة دراسية" ? ctx.years.get(id)
      : undefined;
    map.set(key, label ?? "نطاق محدد");
  }
  return map;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ announcements: [] });
  try {
    // round 52 — scope filtering: supervisors manage the whole specialty,
    // students only see specialty-wide + their year + their cohort.
    const seeAll = canManageRoles(user);
    let yearIds: number[] = [];
    if (user.scopeAcademicYearId != null) yearIds.push(Number(user.scopeAcademicYearId));
    if (user.scopeCohortGroupId != null) {
      try {
        const ctx = await loadScopeContext();
        const cohortYear = ctx.cohorts.get(Number(user.scopeCohortGroupId))?.yearId;
        if (cohortYear != null) yearIds.push(cohortYear);
      } catch {
        // scope context unavailable — year targeting falls back to the
        // user's own scopeAcademicYearId only
      }
    }
    const announcements = await fetchAnnouncements(user.assignedSpecialtyId, {
      cohortId: user.scopeCohortGroupId ?? null,
      yearIds,
      seeAll,
    });
    const labels = await scopeLabels(announcements);
    return NextResponse.json({
      announcements: announcements.map((a) => ({
        ...a,
        scopeLabel:
          a.visibilityScope === "تخصص كامل"
            ? "تخصص كامل"
            : labels.get(`${a.visibilityScope}::${a.targetGroups}`) ?? "نطاق محدد",
      })),
    });
  } catch (e) {
    return NextResponse.json({ announcements: [] });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canUploadContent(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { title, content, urgency, specialtyId, scopeLevel, scopeTargetId } = body;
    if (!title?.trim() || !content?.trim()) {
      return NextResponse.json({ error: "العنوان والمحتوى مطلوبان" }, { status: 400 });
    }
    const validUrgency = ["عاجل", "هام", "عام"].includes(urgency) ? urgency : "عام";
    const today = new Date().toISOString().split("T")[0];
    const finalSpecialtyId = specialtyId ?? user.assignedSpecialtyId;

    // round 52 — validate + persist the visibility scope
    const scope = await resolveScope(user, scopeLevel, scopeTargetId);
    if ("error" in scope) {
      return NextResponse.json({ error: scope.error }, { status: 400 });
    }
    const scopeCohortId = scope.visibilityScope === "فوج" ? Number(scope.targetGroups) : null;
    const scopeYearId = scope.visibilityScope === "سنة دراسية" ? Number(scope.targetGroups) : null;

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.from("announcements").insert({
        title: title.trim(),
        content: content.trim(),
        author: user.fullName,
        date: today,
        urgency: validUrgency,
        specialty_id: finalSpecialtyId,
        visibility_scope: scope.visibilityScope,
        target_groups: scope.targetGroups,
      }).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      // round 24: the announcement announces itself — students of this
      // specialty hear about it the moment it exists (was: silent until
      // they happened to open the announcements screen). round 52: the
      // fan-out respects the scope (cohort/year) instead of the whole
      // specialty.
      await notifyContentPublished({
        actorId: user.id,
        actorName: user.fullName,
        specialtyId: Number(finalSpecialtyId),
        type: "content_announcement",
        title: validUrgency === "عاجل" ? "إعلان عاجل" : "إعلان جديد",
        body: `«${title.trim()}» — ${user.fullName}`,
        meta: { announcementId: data?.id, urgency: validUrgency },
        cohortId: scopeCohortId,
        yearId: scopeYearId,
      });
      return NextResponse.json({ announcement: data });
    }
    const announcement = await db.announcement.create({
      data: {
        title: title.trim(),
        content: content.trim(),
        author: user.fullName,
        date: today,
        urgency: validUrgency,
        specialtyId: finalSpecialtyId,
        visibilityScope: scope.visibilityScope,
        targetGroups: scope.targetGroups,
      },
    });
    await notifyContentPublished({
      actorId: user.id,
      actorName: user.fullName,
      specialtyId: Number(finalSpecialtyId),
      type: "content_announcement",
      title: validUrgency === "عاجل" ? "إعلان عاجل" : "إعلان جديد",
      body: `«${title.trim()}» — ${user.fullName}`,
      meta: { announcementId: announcement.id, urgency: validUrgency },
      cohortId: scopeCohortId,
      yearId: scopeYearId,
    });
    return NextResponse.json({ announcement });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canUploadContent(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { id, title, content, urgency, scopeLevel, scopeTargetId } = body;
    if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
    const t = title?.trim();
    const c = content?.trim();
    if (title !== undefined && !t) return NextResponse.json({ error: "العنوان لا يمكن أن يكون فارغاً" }, { status: 400 });
    if (content !== undefined && !c) return NextResponse.json({ error: "المحتوى لا يمكن أن يكون فارغاً" }, { status: 400 });
    const validUrgency = ["عاجل", "هام", "عام"].includes(urgency) ? urgency : null;

    const row = await loadAnnouncement(Number(id));
    if (!row) return NextResponse.json({ error: "الإعلان غير موجود" }, { status: 404 });
    if (!canEditAnnouncement(user, row)) {
      return NextResponse.json({ error: "لا يمكنك تعديل هذا الإعلان" }, { status: 403 });
    }

    // round 52 — the scope may be edited too (validated against the
    // EDITOR's specialty, same rule as creation)
    let scope: { visibilityScope: string; targetGroups: string } | null = null;
    if (scopeLevel !== undefined) {
      const resolved = await resolveScope(user, scopeLevel, scopeTargetId);
      if ("error" in resolved) {
        return NextResponse.json({ error: resolved.error }, { status: 400 });
      }
      scope = resolved;
    }

    const patch: Record<string, unknown> = {};
    if (t) patch.title = t;
    if (c) patch.content = c;
    if (validUrgency) patch.urgency = validUrgency;
    if (scope) {
      patch.visibility_scope = scope.visibilityScope;
      patch.target_groups = scope.targetGroups;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "لا توجد تغييرات" }, { status: 400 });
    }

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("announcements")
        .update(patch)
        .eq("id", Number(id))
        .select()
        .single();
      if (error || !data) {
        return NextResponse.json({ error: `فشل التحديث: ${error?.message ?? "خطأ"}` }, { status: 500 });
      }
      return NextResponse.json({ announcement: data });
    }
    const updated = await db.announcement.update({
      where: { id: Number(id) },
      data: {
        ...(t ? { title: t } : {}),
        ...(c ? { content: c } : {}),
        ...(validUrgency ? { urgency: validUrgency } : {}),
        ...(scope ? { visibilityScope: scope.visibilityScope, targetGroups: scope.targetGroups } : {}),
      },
    });
    return NextResponse.json({ announcement: updated });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canUploadContent(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
  try {
    const row = await loadAnnouncement(Number(id));
    if (!row) return NextResponse.json({ error: "الإعلان غير موجود" }, { status: 404 });
    if (!canEditAnnouncement(user, row)) {
      return NextResponse.json({ error: "لا يمكنك حذف هذا الإعلان" }, { status: 403 });
    }
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      // round 5: clean read-state rows so the unread badge math stays correct
      await supabase.from("notification_read_states").delete().eq("announcement_id", Number(id));
      const { error } = await supabase.from("announcements").delete().eq("id", Number(id));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      await db.notificationReadState.deleteMany({ where: { announcementId: Number(id) } });
      await db.announcement.delete({ where: { id: Number(id) } });
    }
    return NextResponse.json({ ok: true, message: "تم حذف الإعلان" });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
