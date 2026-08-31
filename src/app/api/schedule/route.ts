import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canManageSchedule } from "@/lib/auth/permissions";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ items: [] });
    // fix أ.3: filter by the student's year too, not only the specialty
    const yearId = user.scopeAcademicYearId ?? null;
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      let query = supabase
        .from("schedule_items")
        .select("*")
        .eq("specialty_id", user.assignedSpecialtyId);
      if (yearId) query = query.eq("academic_year_id", yearId);
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
    const items = await db.scheduleItem.findMany({
      where: {
        specialtyId: user.assignedSpecialtyId,
        ...(yearId ? { academicYearId: yearId } : {}),
      },
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
      const { data, error } = await supabase.from("schedule_items").insert({
        specialty_id: user.assignedSpecialtyId,
        academic_year_id: user.scopeAcademicYearId ?? 1,
        day_of_week: dayOfWeek, start_time: startTime.trim(),
        end_time: endTime?.trim() || "", module_name: moduleName.trim(),
        type: type || "محاضرة", room: room?.trim() || "", professor: professor?.trim() || "",
      }).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ item: data });
    }
    const item = await db.scheduleItem.create({
      data: {
        specialtyId: user.assignedSpecialtyId, academicYearId: user.scopeAcademicYearId ?? 1,
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
      const { error } = await supabase.from("schedule_items").delete().eq("id", parseInt(id));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      await db.scheduleItem.delete({ where: { id: parseInt(id) } });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
