import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canCreateGroups } from "@/lib/auth/permissions";
import { fetchAcademicYears } from "@/lib/data-layer";

/**
 * Academic Years management (السنوات الدراسية) — NEW in round 3.
 *
 * The admin panel had NO way to create or delete academic years: the year
 * dropdowns everywhere were read-only lists from /api/onboarding/years, so a
 * new specialty could never get its years → the user literally could not
 * "add years of study" (cannot create groups/cohorts either without them).
 *
 *   GET    ?specialtyId=1[&trackId=3]  → list years of a specialty
 *          (optionally only that track's + shared NULL-track years)
 *   POST   { specialtyId, yearName, trackId?, semester? } → add a year
 *          (supervisory roles). r70: years are PER-TRACK — the same
 *          year_name can exist once per track; trackId = null means the
 *          shared/"no track" bucket.
 *   PATCH  { id, yearName?, semester?, trackId? } → rename a year / change
 *          semester / move it to another track. Moving a year re-tags its
 *          module_courses so modules always inherit the year's track.
 *   DELETE ?id=7                     → delete a year (blocked while groups/
 *                                      cohorts/modules still reference it)
 *
 * Permission: same as group creation (OWNER / SPECIALTY_ADMIN / REPRESENTATIVE).
 * Round 5: non-OWNER callers may only touch years of their OWN specialty
 * (scope check on PATCH and DELETE — previously only the role was checked,
 * so a representative of specialty A could delete a year of specialty B).
 *
 * r70 (track fix): the duplicate guard used to check (specialty_id,
 * year_name) ONLY — with per-track years ("السنة الثانية" for PEP and for
 * PEM), the guard rejected legitimate years and screens merged different
 * tracks' rows by name. Uniqueness is now (specialty_id, year_name,
 * track_id) with NULL as its OWN distinct "no track" bucket.
 */
const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

/** r70: normalize trackId from a request body/param — null/""/"null" → null. */
function normalizeTrackId(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined; // not provided
  if (raw === null || raw === "" || raw === "null" || raw === 0) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  const url = new URL(req.url);
  const specialtyId = url.searchParams.get("specialtyId");
  if (!specialtyId) return NextResponse.json({ years: [] });
  // r70: optional track filter — returns that track's years + shared NULL-track
  // years (house convention: NULL-track rows are visible to every track).
  const trackId = normalizeTrackId(url.searchParams.get("trackId"));
  try {
    const years = await fetchAcademicYears(parseInt(specialtyId), trackId ?? undefined);
    return NextResponse.json({ years });
  } catch (e) {
    return NextResponse.json({ years: [] });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canCreateGroups(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { specialtyId, yearName, semester, trackId } = body;
    if (!specialtyId || !yearName?.trim()) {
      return NextResponse.json({ error: "specialtyId و yearName مطلوبة" }, { status: 400 });
    }
    const name = yearName.trim();
    const tid = normalizeTrackId(trackId) ?? null; // absent → "no track" bucket
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      // r70: a track-tagged year must reference a track OF THIS specialty
      if (tid != null) {
        const { data: track } = await supabase
          .from("academic_tracks")
          .select("id")
          .eq("id", tid)
          .eq("specialty_id", specialtyId)
          .maybeSingle();
        if (!track) {
          return NextResponse.json({ error: "الملمح المحدد لا ينتمي إلى هذا التخصص" }, { status: 400 });
        }
      }
      // r70 duplicate guard: same specialty + same year name + SAME TRACK
      // bucket (NULL is its own distinct bucket — "السنة الثانية" for PEP
      // and for PEM are different years and may coexist).
      let dupQuery = supabase
        .from("academic_years")
        .select("id")
        .eq("specialty_id", specialtyId)
        .eq("year_name", name);
      dupQuery = tid != null ? dupQuery.eq("track_id", tid) : dupQuery.is("track_id", null);
      const { data: existing } = await dupQuery.maybeSingle();
      if (existing) {
        return NextResponse.json({ error: `السنة "${name}" موجودة مسبقاً في هذا الملمح` }, { status: 409 });
      }
      const { data, error } = await supabase
        .from("academic_years")
        .insert({
          specialty_id: specialtyId,
          year_name: name,
          semester: semester === 2 ? 2 : 1,
          track_id: tid,
        })
        .select()
        .single();
      if (error || !data) {
        return NextResponse.json({ error: `فشل الإنشاء: ${error?.message ?? "خطأ"}` }, { status: 500 });
      }
      return NextResponse.json({
        year: { id: data.id, specialtyId: data.specialty_id, yearName: data.year_name, semester: data.semester, trackId: data.track_id ?? null },
      });
    }
    // local parity: validate the track belongs to the specialty
    if (tid != null) {
      const track = await db.academicTrack.findFirst({ where: { id: tid, specialtyId: Number(specialtyId) } });
      if (!track) {
        return NextResponse.json({ error: "الملمح المحدد لا ينتمي إلى هذا التخصص" }, { status: 400 });
      }
    }
    const dup = await db.academicYear.findFirst({
      where: { specialtyId: Number(specialtyId), yearName: name, trackId: tid },
    });
    if (dup) {
      return NextResponse.json({ error: `السنة "${name}" موجودة مسبقاً في هذا الملمح` }, { status: 409 });
    }
    const year = await db.academicYear.create({
      data: {
        specialtyId: Number(specialtyId),
        yearName: name,
        semester: semester === 2 ? 2 : 1,
        trackId: tid,
      },
    });
    return NextResponse.json({
      year: { id: year.id, specialtyId: year.specialtyId, yearName: year.yearName, semester: year.semester, trackId: year.trackId ?? null },
    });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canCreateGroups(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { id, yearName, semester, trackId } = body;
    if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
    const name = yearName?.trim();
    if (yearName !== undefined && !name) {
      return NextResponse.json({ error: "اسم السنة لا يمكن أن يكون فارغاً" }, { status: 400 });
    }
    // r70: optional track move — undefined = keep the current track
    const newTrackId = normalizeTrackId(trackId);
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: year } = await supabase
        .from("academic_years")
        .select("id, specialty_id, year_name, semester, track_id")
        .eq("id", Number(id))
        .maybeSingle();
      if (!year) return NextResponse.json({ error: "السنة غير موجودة" }, { status: 404 });
      // round 5: scope check — non-OWNER may only edit their own specialty's years
      if (user.role !== "OWNER" && Number(year.specialty_id) !== user.assignedSpecialtyId) {
        return NextResponse.json({ error: "هذه السنة خارج نطاق تخصصك" }, { status: 403 });
      }
      const targetTrackId = newTrackId !== undefined ? newTrackId : (year.track_id ?? null);
      // r70: moving the year to a track — the track must belong to the specialty
      if (newTrackId != null) {
        const { data: track } = await supabase
          .from("academic_tracks")
          .select("id")
          .eq("id", newTrackId)
          .eq("specialty_id", year.specialty_id)
          .maybeSingle();
        if (!track) {
          return NextResponse.json({ error: "الملمح المحدد لا ينتمي إلى هذا التخصص" }, { status: 400 });
        }
      }
      // r70 duplicate guard: same specialty + name + TARGET track bucket
      // (NULL is its own bucket), excluding this row
      if (name && (name !== year.year_name || targetTrackId !== (year.track_id ?? null))) {
        let dupQuery = supabase
          .from("academic_years")
          .select("id")
          .eq("specialty_id", year.specialty_id)
          .eq("year_name", name)
          .neq("id", Number(id));
        dupQuery = targetTrackId != null ? dupQuery.eq("track_id", targetTrackId) : dupQuery.is("track_id", null);
        const { data: dup } = await dupQuery.maybeSingle();
        if (dup) {
          return NextResponse.json({ error: `السنة "${name}" موجودة مسبقاً في هذا الملمح` }, { status: 409 });
        }
      }
      const patch: Record<string, unknown> = {};
      if (name) patch.year_name = name;
      if (semester === 1 || semester === 2) patch.semester = semester;
      if (newTrackId !== undefined) patch.track_id = newTrackId;
      const { data, error } = await supabase
        .from("academic_years")
        .update(patch)
        .eq("id", Number(id))
        .select()
        .single();
      if (error || !data) {
        return NextResponse.json({ error: `فشل التحديث: ${error?.message ?? "خطأ"}` }, { status: 500 });
      }
      // r70: modules inherit the year's track — keep them in sync on a move
      if (newTrackId !== undefined && newTrackId !== (year.track_id ?? null)) {
        const modPatch: Record<string, unknown> = { track_id: newTrackId };
        await supabase.from("module_courses").update(modPatch).eq("academic_year_id", Number(id));
      }
      return NextResponse.json({
        year: { id: data.id, specialtyId: data.specialty_id, yearName: data.year_name, semester: data.semester, trackId: data.track_id ?? null },
      });
    }
    const year = await db.academicYear.findUnique({ where: { id: Number(id) } });
    if (!year) return NextResponse.json({ error: "السنة غير موجودة" }, { status: 404 });
    if (user.role !== "OWNER" && year.specialtyId !== user.assignedSpecialtyId) {
      return NextResponse.json({ error: "هذه السنة خارج نطاق تخصصك" }, { status: 403 });
    }
    const targetTrackId = newTrackId !== undefined ? newTrackId : (year.trackId ?? null);
    if (newTrackId != null) {
      const track = await db.academicTrack.findFirst({ where: { id: newTrackId, specialtyId: year.specialtyId } });
      if (!track) {
        return NextResponse.json({ error: "الملمح المحدد لا ينتمي إلى هذا التخصص" }, { status: 400 });
      }
    }
    if (name && (name !== year.yearName || targetTrackId !== (year.trackId ?? null))) {
      const dup = await db.academicYear.findFirst({
        where: { specialtyId: year.specialtyId, yearName: name, trackId: targetTrackId, id: { not: Number(id) } },
      });
      if (dup) {
        return NextResponse.json({ error: `السنة "${name}" موجودة مسبقاً في هذا الملمح` }, { status: 409 });
      }
    }
    const updated = await db.academicYear.update({
      where: { id: Number(id) },
      data: {
        ...(name ? { yearName: name } : {}),
        ...(semester === 1 || semester === 2 ? { semester } : {}),
        ...(newTrackId !== undefined ? { trackId: newTrackId } : {}),
      },
    });
    // r70: modules inherit the year's track — keep them in sync on a move
    if (newTrackId !== undefined && newTrackId !== (year.trackId ?? null)) {
      await db.moduleCourse.updateMany({ where: { academicYearId: Number(id) }, data: { trackId: newTrackId } });
    }
    return NextResponse.json({
      year: { id: updated.id, specialtyId: updated.specialtyId, yearName: updated.yearName, semester: updated.semester, trackId: updated.trackId ?? null },
    });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canCreateGroups(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
  // round 36: ?force=1 — OWNER-only escape hatch: wipes the year with ALL
  // its groups/cohorts/courses and detaches attached accounts (accounts are
  // never deleted — they simply re-pick their path).
  const force = url.searchParams.get("force") === "1" && user.role === "OWNER";
  const yearId = parseInt(id);
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      // round 5: scope check — non-OWNER may only delete their own specialty's years
      const { data: yr } = await supabase.from("academic_years").select("specialty_id").eq("id", yearId).maybeSingle();
      if (!yr) return NextResponse.json({ error: "السنة غير موجودة" }, { status: 404 });
      if (user.role !== "OWNER" && Number(yr.specialty_id) !== user.assignedSpecialtyId) {
        return NextResponse.json({ error: "هذه السنة خارج نطاق تخصصك" }, { status: 403 });
      }
      // protect: block while dependents still reference the year (unless force)
      const [groups, cohorts, modules] = await Promise.all([
        supabase.from("study_groups").select("id", { count: "exact", head: true }).eq("academic_year_id", yearId),
        supabase.from("cohort_groups").select("id", { count: "exact", head: true }).eq("academic_year_id", yearId),
        supabase.from("module_courses").select("id", { count: "exact", head: true }).eq("academic_year_id", yearId),
      ]);
      const g = groups.count ?? 0, c = cohorts.count ?? 0, m = modules.count ?? 0;
      if (g + c + m > 0 && !force) {
        return NextResponse.json({
          error: `لا يمكن حذف السنة: تحتوي ${g} مجموعة و ${c} فوج و ${m} مقياس. احذفها أو انقلها أولاً.`,
          counts: { groups: g, cohorts: c, courses: m },
        }, { status: 400 });
      }
      if (g + c + m > 0 && force) {
        // detach accounts scoped into this year's cohorts/groups before the wipe
        const { data: cohortRows } = await supabase.from("cohort_groups").select("id").eq("academic_year_id", yearId);
        const cohortIds = (cohortRows ?? []).map((r) => Number(r.id));
        const { data: groupRows } = await supabase.from("study_groups").select("id").eq("academic_year_id", yearId);
        const groupIds = (groupRows ?? []).map((r) => Number(r.id));
        if (cohortIds.length) await supabase.from("app_users").update({ scope_cohort_group_id: null }).in("scope_cohort_group_id", cohortIds);
        if (groupIds.length) await supabase.from("app_users").update({ scope_group_id: null }).in("scope_group_id", groupIds);
      }
      // clear dangling user scopes (no FK on this column)
      await supabase.from("app_users").update({ scope_academic_year_id: null }).eq("scope_academic_year_id", yearId);
      const { error } = await supabase.from("academic_years").delete().eq("id", yearId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      // round 5: scope check (local branch parity)
      const yr = await db.academicYear.findUnique({ where: { id: yearId }, select: { specialtyId: true } });
      if (!yr) return NextResponse.json({ error: "السنة غير موجودة" }, { status: 404 });
      if (user.role !== "OWNER" && yr.specialtyId !== user.assignedSpecialtyId) {
        return NextResponse.json({ error: "هذه السنة خارج نطاق تخصصك" }, { status: 403 });
      }
      const g = await db.studyGroup.count({ where: { academicYearId: yearId } });
      const c = await db.cohortGroup.count({ where: { academicYearId: yearId } });
      const m = await db.moduleCourse.count({ where: { academicYearId: yearId } });
      if (g + c + m > 0 && !force) {
        return NextResponse.json({
          error: `لا يمكن حذف السنة: تحتوي ${g} مجموعة و ${c} فوج و ${m} مقياس. احذفها أو انقلها أولاً.`,
          counts: { groups: g, cohorts: c, courses: m },
        }, { status: 400 });
      }
      if (g + c + m > 0 && force) {
        // detach accounts scoped into this year's cohorts/groups BEFORE the
        // cascade (scopeCohortGroupId is a RESTRICT FK; scopeGroupId is SetNull
        // but cleared explicitly for parity)
        await db.appUser.updateMany({ where: { cohortGroup: { academicYearId: yearId } }, data: { scopeCohortGroupId: null } });
        await db.appUser.updateMany({ where: { scopeGroup: { academicYearId: yearId } }, data: { scopeGroupId: null } });
      }
      await db.appUser.updateMany({ where: { scopeAcademicYearId: yearId }, data: { scopeAcademicYearId: null } });
      await db.academicYear.delete({ where: { id: yearId } });
    }
    return NextResponse.json({
      ok: true,
      forced: force,
      message: force ? "تم حذف السنة مع كل محتواها — الحسابات المرتبطة لم تُحذف، وسيعيد أعضاؤها اختيار مسارهم" : "تم حذف السنة",
    });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
