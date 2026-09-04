import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";

/**
 * Personal Schedule API (round 27 — review §7)
 *
 * The student's PRIVATE timetable: classes they add for themselves
 * (day / time / course / location / optional notes). Every route is
 * hard-scoped to the CURRENT user — a student can never see or touch
 * another user's personal classes, and no role is required beyond
 * being logged in (this is intentionally separate from /api/schedule,
 * which stays the OFFICIAL specialty schedule managed by supervisors).
 *
 * GET    → my personal items, ordered by day then start time
 * POST   → add a personal item
 * PATCH  → edit one of my items (by id)
 * DELETE → remove one of my items (?id=)
 */

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

function sanitize(body: Record<string, unknown>) {
  const str = (v: unknown, max: number) =>
    typeof v === "string" ? v.trim().slice(0, max) : "";
  return {
    dayOfWeek: Number(body.dayOfWeek),
    startTime: str(body.startTime, 10),
    endTime: str(body.endTime, 10),
    moduleName: str(body.moduleName, 120),
    type: str(body.type, 40) || "محاضرة",
    room: str(body.room, 60),
    notes: str(body.notes, 300),
  };
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ items: [] });
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("personal_schedule_items")
        .select("*")
        .eq("user_id", user.id)
        .order("day_of_week", { ascending: true })
        .order("start_time", { ascending: true });
      // table not migrated yet → graceful empty (official schedule still works)
      if (error) return NextResponse.json({ items: [] });
      const items = (data ?? []).map((s: Record<string, unknown>) => ({
        id: Number(s.id), dayOfWeek: Number(s.day_of_week ?? 1),
        startTime: String(s.start_time ?? ""), endTime: String(s.end_time ?? ""),
        moduleName: String(s.module_name ?? ""), type: String(s.type ?? "محاضرة"),
        room: String(s.room ?? ""), notes: String(s.notes ?? ""),
      }));
      return NextResponse.json({ items });
    }
    const items = await db.personalScheduleItem.findMany({
      where: { userId: user.id },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  try {
    const body = await req.json();
    const v = sanitize(body);
    if (!(v.dayOfWeek >= 1 && v.dayOfWeek <= 7) || !v.startTime || !v.moduleName) {
      return NextResponse.json(
        { error: "اليوم، وقت البداية، واسم المقياس مطلوبة" },
        { status: 400 }
      );
    }
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("personal_schedule_items")
        .insert({
          user_id: user.id, day_of_week: v.dayOfWeek,
          start_time: v.startTime, end_time: v.endTime,
          module_name: v.moduleName, type: v.type, room: v.room, notes: v.notes,
        })
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ item: data });
    }
    const item = await db.personalScheduleItem.create({
      data: { ...v, userId: user.id },
    });
    return NextResponse.json({ item });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
    const v = sanitize(body);
    if (!(v.dayOfWeek >= 1 && v.dayOfWeek <= 7) || !v.startTime || !v.moduleName) {
      return NextResponse.json(
        { error: "اليوم، وقت البداية، واسم المقياس مطلوبة" },
        { status: 400 }
      );
    }
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      // ownership check: personal rows are visible only to their owner
      const { data: item } = await supabase
        .from("personal_schedule_items")
        .select("user_id")
        .eq("id", Number(body.id))
        .maybeSingle();
      if (!item) return NextResponse.json({ error: "الحصة غير موجودة" }, { status: 404 });
      if (Number(item.user_id) !== user.id) {
        return NextResponse.json({ error: "هذه حصة شخصية لا تملكها" }, { status: 403 });
      }
      const { data, error } = await supabase
        .from("personal_schedule_items")
        .update({
          day_of_week: v.dayOfWeek, start_time: v.startTime, end_time: v.endTime,
          module_name: v.moduleName, type: v.type, room: v.room, notes: v.notes,
        })
        .eq("id", Number(body.id))
        .select()
        .single();
      if (error || !data) {
        return NextResponse.json({ error: `فشل التحديث: ${error?.message ?? "خطأ"}` }, { status: 500 });
      }
      return NextResponse.json({ item: data });
    }
    const item = await db.personalScheduleItem.findUnique({ where: { id: Number(body.id) } });
    if (!item) return NextResponse.json({ error: "الحصة غير موجودة" }, { status: 404 });
    if (item.userId !== user.id) {
      return NextResponse.json({ error: "هذه حصة شخصية لا تملكها" }, { status: 403 });
    }
    const updated = await db.personalScheduleItem.update({
      where: { id: item.id },
      data: {
        dayOfWeek: v.dayOfWeek, startTime: v.startTime, endTime: v.endTime,
        moduleName: v.moduleName, type: v.type, room: v.room, notes: v.notes,
      },
    });
    return NextResponse.json({ item: updated });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: item } = await supabase
        .from("personal_schedule_items")
        .select("user_id")
        .eq("id", parseInt(id))
        .maybeSingle();
      if (!item) return NextResponse.json({ error: "الحصة غير موجودة" }, { status: 404 });
      if (Number(item.user_id) !== user.id) {
        return NextResponse.json({ error: "هذه حصة شخصية لا تملكها" }, { status: 403 });
      }
      const { error } = await supabase
        .from("personal_schedule_items")
        .delete()
        .eq("id", parseInt(id));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const item = await db.personalScheduleItem.findUnique({
        where: { id: parseInt(id) },
        select: { userId: true },
      });
      if (!item) return NextResponse.json({ error: "الحصة غير موجودة" }, { status: 404 });
      if (item.userId !== user.id) {
        return NextResponse.json({ error: "هذه حصة شخصية لا تملكها" }, { status: 403 });
      }
      await db.personalScheduleItem.delete({ where: { id: parseInt(id) } });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
