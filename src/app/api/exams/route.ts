/**
 * Exams API — fix ج (Exams screen had no data, no button, no API)
 *
 * GET    → exams of the caller's scope (specialty + year), split-ready
 * POST   → create an exam (supervisors only), tied to a module of the scope
 * DELETE → remove an exam (supervisors only)
 *
 * Scope filtering uses a two-step query (module ids of the user's scope, then
 * exams in those modules) so it works regardless of live FK constraint names.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canUploadContent } from "@/lib/auth/permissions";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

async function scopedModuleIds(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> | null,
  specialtyId: number,
  yearId: number | null
): Promise<number[]> {
  if (supabase) {
    let q = supabase.from("module_courses").select("id").eq("specialty_id", specialtyId);
    if (yearId) q = q.eq("academic_year_id", yearId);
    const { data } = await q;
    return (data ?? []).map((m: { id: number }) => Number(m.id));
  }
  const mods = await db.moduleCourse.findMany({
    where: { specialtyId, ...(yearId ? { academicYearId: yearId } : {}) },
    select: { id: true },
  });
  return mods.map((m) => m.id);
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ exams: [] });
  try {
    const yearId = user.scopeAcademicYearId ?? null;
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const moduleIds = await scopedModuleIds(supabase, user.assignedSpecialtyId, yearId);
      if (moduleIds.length === 0) return NextResponse.json({ exams: [] });
      const { data, error } = await supabase
        .from("exams")
        .select("*")
        .in("module_id", moduleIds)
        .order("exam_date", { ascending: true });
      if (error) return NextResponse.json({ exams: [] });
      const exams = (data ?? []).map((e: Record<string, unknown>) => ({
        id: Number(e.id), moduleId: Number(e.module_id ?? 0),
        moduleName: String(e.module_name ?? ""), title: String(e.title ?? ""),
        examDate: String(e.exam_date ?? ""), time: String(e.time ?? ""),
        room: String(e.room ?? ""), coefficient: Number(e.coefficient ?? 2),
        isFinished: Boolean(e.is_finished ?? false),
      }));
      return NextResponse.json({ exams });
    }
    const items = await db.exam.findMany({
      where: {
        module: {
          specialtyId: user.assignedSpecialtyId,
          ...(yearId ? { academicYearId: yearId } : {}),
        },
      },
      orderBy: { examDate: "asc" },
    });
    return NextResponse.json({
      exams: items.map((e) => ({
        id: e.id, moduleId: e.moduleId, moduleName: e.moduleName, title: e.title,
        examDate: e.examDate, time: e.time, room: e.room,
        coefficient: e.coefficient, isFinished: e.isFinished,
      })),
    });
  } catch (e) {
    return NextResponse.json({ exams: [] });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canUploadContent(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { moduleId, title, examDate, time, room, coefficient } = body;
    if (!moduleId || !title?.trim() || !examDate?.trim()) {
      return NextResponse.json({ error: "المقياس، العنوان، والتاريخ مطلوبة" }, { status: 400 });
    }
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      // verify the module is inside the caller's specialty scope
      const { data: module } = await supabase
        .from("module_courses")
        .select("id, name, specialty_id")
        .eq("id", moduleId)
        .maybeSingle();
      if (!module) return NextResponse.json({ error: "المقياس غير موجود" }, { status: 400 });
      if (Number(module.specialty_id) !== user.assignedSpecialtyId) {
        return NextResponse.json({ error: "هذا المقياس خارج نطاق تخصصك" }, { status: 403 });
      }
      const { data, error } = await supabase.from("exams").insert({
        module_id: moduleId, module_name: String(module.name ?? ""),
        title: title.trim(), exam_date: examDate.trim(),
        time: time?.trim() || "—", room: room?.trim() || "—",
        coefficient: coefficient ?? 2,
      }).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ exam: data });
    }
    const module = await db.moduleCourse.findUnique({ where: { id: moduleId } });
    if (!module) return NextResponse.json({ error: "المقياس غير موجود" }, { status: 400 });
    if (module.specialtyId !== user.assignedSpecialtyId) {
      return NextResponse.json({ error: "هذا المقياس خارج نطاق تخصصك" }, { status: 403 });
    }
    const exam = await db.exam.create({
      data: {
        moduleId, moduleName: module.name, title: title.trim(),
        examDate: examDate.trim(), time: time?.trim() || "—",
        room: room?.trim() || "—", coefficient: coefficient ?? 2,
      },
    });
    return NextResponse.json({ exam });
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
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.from("exams").delete().eq("id", parseInt(id));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      await db.exam.delete({ where: { id: parseInt(id) } });
    }
    return NextResponse.json({ ok: true, message: "تم حذف الاختبار" });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
