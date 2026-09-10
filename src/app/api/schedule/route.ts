import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canManageSchedule } from "@/lib/auth/permissions";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

/**
 * r70 (track fix): resolve the year ids that represent the caller's track.
 * A year row is per-track, so "items of my track" = items whose
 * academic_year_id belongs to a year of MY track (or a shared NULL-track
 * year). Used by GET when the caller has a track but no pinned year, and
 * by POST to replace the old `?? 1` fallback (year id 1 can belong to a
 * DIFFERENT specialty/track — the item would land in someone else's
 * timetable).
 */
async function scopedYearIds(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  specialtyId: number,
  trackId: number | null
): Promise<number[]> {
  let q = supabase.from("academic_years").select("id").eq("specialty_id", specialtyId);
  if (trackId != null) q = q.or(`track_id.is.null,track_id.eq.${trackId}`);
  const { data } = await q.order("id", { ascending: true });
  return (data ?? []).map((y: { id: number }) => Number(y.id));
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ items: [] });
    // fix أ.3: filter by the student's year too, not only the specialty
    const yearId = user.scopeAcademicYearId ?? null;
    // r70: the student's track — year rows are per-track, so a student
    // without a pinned year must still never see another track's timetable
    const trackId = user.scopeTrackId ?? null;
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      let query = supabase
        .from("schedule_items")
        .select("*")
        .eq("specialty_id", user.assignedSpecialtyId);
      if (yearId) {
        query = query.eq("academic_year_id", yearId);
      } else if (trackId != null) {
        const ids = await scopedYearIds(supabase, user.assignedSpecialtyId, trackId);
        if (ids.length === 0) return NextResponse.json({ items: [] });
        query = query.in("academic_year_id", ids);
      }
      const { data, error } = await query.order("day_of_week", { ascending: true });
      if (error) return NextResponse.json({ items: [] });
      const items = (data ?? []).map((s: Record<string, unknown>) => ({
        id: Number(s.id), dayOfWeek: Number(s.day_of_week ?? 1),
        startTime: String(s.start_time ?? ""), endTime: String(s.end_time ?? ""),
        moduleName: String(s.module_name ?? ""), type: String(s.type ?? "محاضرة"),
        room: String(s.room ?? ""), professor: String(s.professor ?? ""),
      }));
      return NextResponse.json({ items });
    }
    let prismaWhere: Record<string, unknown> = { specialtyId: user.assignedSpecialtyId };
    if (yearId) {
      prismaWhere.academicYearId = yearId;
    } else if (trackId != null) {
      const years = await db.academicYear.findMany({
        where: { specialtyId: user.assignedSpecialtyId, OR: [{ trackId: null }, { trackId }] },
        select: { id: true },
      });
      if (years.length === 0) return NextResponse.json({ items: [] });
      prismaWhere.academicYearId = { in: years.map((y) => y.id) };
    }
    const items = await db.scheduleItem.findMany({
      where: prismaWhere as never,
      orderBy: { dayOfWeek: "asc" },
    });
    return NextResponse.json({
      items: items.map((s) => ({
        id: s.id, dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime,
        moduleName: s.moduleName, type: s.type, room: s.room, professor: s.professor,
      })),
    });
  } catch (e) {
    return NextResponse.json({ items: [] });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canManageSchedule(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { dayOfWeek, startTime, endTime, moduleName, type, room, professor } = body;
    if (!dayOfWeek || !startTime?.trim() || !moduleName?.trim()) {
      return NextResponse.json({ error: "اليوم، وقت البداية، واسم المقياس مطلوبة" }, { status: 400 });
    }
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      // r70: replaced the `?? 1` fallback — year id 1 may belong to a
      // different specialty/track. Resolve the caller's own year (pinned
      // year, else first year of their track, else first year of the
      // specialty); refuse the insert if the specialty has no years yet.
      let finalYearId = user.scopeAcademicYearId ?? null;
      if (finalYearId == null) {
        const ids = await scopedYearIds(supabase, user.assignedSpecialtyId, user.scopeTrackId ?? null);
        finalYearId = ids.length > 0 ? ids[0] : null;
      }
      if (finalYearId == null) {
        return NextResponse.json({ error: "لا توجد سنوات لهذا التخصص بعد — أنشئ السنوات أولاً من تبويب الهيكل" }, { status: 400 });
      }
      const { data, error } = await supabase.from("schedule_items").insert({
        specialty_id: user.assignedSpecialtyId,
        academic_year_id: finalYearId,
        day_of_week: dayOfWeek, start_time: startTime.trim(),
        end_time: endTime?.trim() || "", module_name: moduleName.trim(),
        type: type || "محاضرة", room: room?.trim() || "", professor: professor?.trim() || "",
      }).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ item: data });
    }
    // r70 local parity: same track-aware year resolution
    let localYearId = user.scopeAcademicYearId ?? null;
    if (localYearId == null) {
      const years = await db.academicYear.findMany({
        where: {
          specialtyId: user.assignedSpecialtyId,
          ...(user.scopeTrackId != null ? { OR: [{ trackId: null }, { trackId: user.scopeTrackId }] } : {}),
        },
        select: { id: true },
        orderBy: { id: "asc" },
      });
      localYearId = years.length > 0 ? years[0].id : null;
    }
    if (localYearId == null) {
      return NextResponse.json({ error: "لا توجد سنوات لهذا التخصص بعد — أنشئ السنوات أولاً من تبويب الهيكل" }, { status: 400 });
    }
    const item = await db.scheduleItem.create({
      data: {
        specialtyId: user.assignedSpecialtyId, academicYearId: localYearId,
        dayOfWeek, startTime: startTime.trim(), endTime: endTime?.trim() || "",
        moduleName: moduleName.trim(), type: type || "محاضرة",
        room: room?.trim() || "", professor: professor?.trim() || "",
      },
    });
    return NextResponse.json({ item });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}

/**
 * Schedule API
 * GET    → items of the caller's specialty (+year), grouped by day
 * POST   → add an item (supervisors only, stamped with the caller's specialty)
 * PATCH  → edit an item (round 5 — fix a typo/move a slot without delete+retype)
 * DELETE → remove an item (supervisors only)
 *
 * Round 5: PATCH and DELETE now verify the item belongs to the caller's
 * specialty (the previous DELETE only checked the role — any supervisor
 * could delete another specialty's schedule by forging the id).
 */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canManageSchedule(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { id, dayOfWeek, startTime, endTime, moduleName, type, room, professor } = body;
    if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
    const st = startTime?.trim();
    if (startTime !== undefined && !st) return NextResponse.json({ error: "وقت البداية مطلوب" }, { status: 400 });
    const mn = moduleName?.trim();
    if (moduleName !== undefined && !mn) return NextResponse.json({ error: "اسم المقياس مطلوب" }, { status: 400 });
    if (dayOfWeek !== undefined && !(Number(dayOfWeek) >= 1 && Number(dayOfWeek) <= 7)) {
      return NextResponse.json({ error: "اليوم غير صحيح" }, { status: 400 });
    }

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      // round 5: ownership check
      const { data: item } = await supabase.from("schedule_items").select("specialty_id").eq("id", Number(id)).maybeSingle();
      if (!item) return NextResponse.json({ error: "الحصة غير موجودة" }, { status: 404 });
      if (user.role !== "OWNER" && Number(item.specialty_id) !== user.assignedSpecialtyId) {
        return NextResponse.json({ error: "هذه الحصة خارج نطاق تخصصك" }, { status: 403 });
      }
      const patch: Record<string, unknown> = {};
      if (dayOfWeek !== undefined) patch.day_of_week = Number(dayOfWeek);
      if (st) patch.start_time = st;
      if (endTime !== undefined) patch.end_time = endTime?.trim() || "";
      if (mn) patch.module_name = mn;
      if (type !== undefined && type?.trim()) patch.type = type.trim();
      if (room !== undefined) patch.room = room?.trim() || "";
      if (professor !== undefined) patch.professor = professor?.trim() || "";
      if (Object.keys(patch).length === 0) return NextResponse.json({ error: "لا توجد تغييرات" }, { status: 400 });
      const { data, error } = await supabase.from("schedule_items").update(patch).eq("id", Number(id)).select().single();
      if (error || !data) return NextResponse.json({ error: `فشل التحديث: ${error?.message ?? "خطأ"}` }, { status: 500 });
      return NextResponse.json({ item: data });
    }
    const item = await db.scheduleItem.findUnique({ where: { id: Number(id) } });
    if (!item) return NextResponse.json({ error: "الحصة غير موجودة" }, { status: 404 });
    if (user.role !== "OWNER" && item.specialtyId !== user.assignedSpecialtyId) {
      return NextResponse.json({ error: "هذه الحصة خارج نطاق تخصصك" }, { status: 403 });
    }
    const updated = await db.scheduleItem.update({
      where: { id: Number(id) },
      data: {
        ...(dayOfWeek !== undefined ? { dayOfWeek: Number(dayOfWeek) } : {}),
        ...(st ? { startTime: st } : {}),
        ...(endTime !== undefined ? { endTime: endTime?.trim() || "" } : {}),
        ...(mn ? { moduleName: mn } : {}),
        ...(type !== undefined && type?.trim() ? { type: type.trim() } : {}),
        ...(room !== undefined ? { room: room?.trim() || "" } : {}),
        ...(professor !== undefined ? { professor: professor?.trim() || "" } : {}),
      },
    });
    return NextResponse.json({ item: updated });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canManageSchedule(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      // round 5: ownership check
      const { data: item } = await supabase.from("schedule_items").select("specialty_id").eq("id", parseInt(id)).maybeSingle();
      if (!item) return NextResponse.json({ error: "الحصة غير موجودة" }, { status: 404 });
      if (user.role !== "OWNER" && Number(item.specialty_id) !== user.assignedSpecialtyId) {
        return NextResponse.json({ error: "هذه الحصة خارج نطاق تخصصك" }, { status: 403 });
      }
      const { error } = await supabase.from("schedule_items").delete().eq("id", parseInt(id));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const item = await db.scheduleItem.findUnique({ where: { id: parseInt(id) }, select: { specialtyId: true } });
      if (!item) return NextResponse.json({ error: "الحصة غير موجودة" }, { status: 404 });
      if (user.role !== "OWNER" && item.specialtyId !== user.assignedSpecialtyId) {
        return NextResponse.json({ error: "هذه الحصة خارج نطاق تخصصك" }, { status: 403 });
      }
      await db.scheduleItem.delete({ where: { id: parseInt(id) } });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
