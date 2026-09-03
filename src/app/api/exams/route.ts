/**
 * Exams API — fix ج (Exams screen had no data, no button, no API)
 *
 * GET    → exams of the caller's scope (specialty + year), split-ready
 * POST   → create an exam (supervisors only), tied to a module of the scope
 * PATCH  → edit an exam (round 5 — reschedule/fix without delete+retype)
 * DELETE → remove an exam (supervisors only)
 *
 * Round 5: PATCH and DELETE now verify the exam's module belongs to the
 * caller's specialty (the previous DELETE only checked the role, so any
 * supervisor could delete another specialty's exams by forging the id).
 *
 * Scope filtering uses a two-step query (module ids of the user's scope, then
 * exams in those modules) so it works regardless of live FK constraint names.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canUploadContent } from "@/lib/auth/permissions";
import { notifyContentPublished } from "@/lib/notifications";

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
      // round 24: a scheduled exam announces itself to the students of
      // that specialty — exams are the highest-stakes content in the app.
      await notifyContentPublished({
        actorId: user.id,
        actorName: user.fullName,
        specialtyId: Number(module.specialty_id),
        type: "content_exam",
        title: "اختبار جديد",
        body: `«${title.trim()}» في ${module.name} — ${examDate.trim()}${time?.trim() ? ` الساعة ${time.trim()}` : ""}`,
        meta: { examId: data?.id, moduleId: Number(moduleId), examDate: examDate.trim(), urgency: "هام" },
      });
      return NextResponse.json({ exam: data });
    }
    const courseModule = await db.moduleCourse.findUnique({ where: { id: moduleId } });
    if (!courseModule) return NextResponse.json({ error: "المقياس غير موجود" }, { status: 400 });
    if (courseModule.specialtyId !== user.assignedSpecialtyId) {
      return NextResponse.json({ error: "هذا المقياس خارج نطاق تخصصك" }, { status: 403 });
    }
    const exam = await db.exam.create({
      data: {
        moduleId, moduleName: courseModule.name, title: title.trim(),
        examDate: examDate.trim(), time: time?.trim() || "—",
        room: room?.trim() || "—", coefficient: coefficient ?? 2,
      },
    });
    await notifyContentPublished({
      actorId: user.id,
      actorName: user.fullName,
      specialtyId: courseModule.specialtyId,
      type: "content_exam",
      title: "اختبار جديد",
      body: `«${title.trim()}» في ${courseModule.name} — ${examDate.trim()}${time?.trim() ? ` الساعة ${time.trim()}` : ""}`,
      meta: { examId: exam.id, moduleId: Number(moduleId), examDate: examDate.trim(), urgency: "هام" },
    });
    return NextResponse.json({ exam });
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
    const { id, moduleId, title, examDate, time, room, coefficient } = body;
    if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      // round 5: load the exam and verify its module is inside the caller's specialty
      const { data: exam } = await supabase
        .from("exams")
        .select("id, module_id, module_name, title, exam_date, time, room, coefficient")
        .eq("id", Number(id))
        .maybeSingle();
      if (!exam) return NextResponse.json({ error: "الاختبار غير موجود" }, { status: 404 });
      const { data: mod } = await supabase
        .from("module_courses")
        .select("id, name, specialty_id")
        .eq("id", Number(exam.module_id))
        .maybeSingle();
      if (!mod || (user.role !== "OWNER" && Number(mod.specialty_id) !== user.assignedSpecialtyId)) {
        return NextResponse.json({ error: "هذا الاختبار خارج نطاق تخصصك" }, { status: 403 });
      }
      // optional module move: validate the new module too
      let newModuleName: string | null = null;
      if (moduleId !== undefined && Number(moduleId) !== Number(exam.module_id)) {
        const { data: newMod } = await supabase
          .from("module_courses")
          .select("id, name, specialty_id")
          .eq("id", Number(moduleId))
          .maybeSingle();
        if (!newMod) return NextResponse.json({ error: "المقياس الجديد غير موجود" }, { status: 400 });
        if (user.role !== "OWNER" && Number(newMod.specialty_id) !== user.assignedSpecialtyId) {
          return NextResponse.json({ error: "المقياس الجديد خارج نطاق تخصصك" }, { status: 403 });
        }
        newModuleName = String(newMod.name ?? "");
      }
      const t = title?.trim();
      if (title !== undefined && !t) return NextResponse.json({ error: "العنوان مطلوب" }, { status: 400 });
      const d = examDate?.trim();
      if (examDate !== undefined && !d) return NextResponse.json({ error: "التاريخ مطلوب" }, { status: 400 });
      const patch: Record<string, unknown> = {};
      if (moduleId !== undefined && newModuleName !== null) { patch.module_id = Number(moduleId); patch.module_name = newModuleName; }
      if (t) patch.title = t;
      if (d) patch.exam_date = d;
      if (time !== undefined) patch.time = time?.trim() || "—";
      if (room !== undefined) patch.room = room?.trim() || "—";
      if (coefficient !== undefined) patch.coefficient = coefficient ?? 2;
      if (Object.keys(patch).length === 0) return NextResponse.json({ error: "لا توجد تغييرات" }, { status: 400 });
      const { data, error } = await supabase.from("exams").update(patch).eq("id", Number(id)).select().single();
      if (error || !data) return NextResponse.json({ error: `فشل التحديث: ${error?.message ?? "خطأ"}` }, { status: 500 });
      // round 24: a changed exam date is news in itself — students who
      // already noted the old date must learn it moved.
      const oldDate = String(exam.exam_date ?? "");
      if (d && d !== oldDate) {
        await notifyContentPublished({
          actorId: user.id,
          actorName: user.fullName,
          specialtyId: Number(mod?.specialty_id ?? user.assignedSpecialtyId),
          type: "content_exam",
          title: "تغيّر موعد اختبار",
          body: `«${t ?? String(exam.title ?? "")}» — من ${oldDate} إلى ${d}`,
          meta: { examId: Number(id), examDate: d, urgency: "عاجل" },
        });
      }
      return NextResponse.json({ exam: data });
    }
    const exam = await db.exam.findUnique({ where: { id: Number(id) } });
    if (!exam) return NextResponse.json({ error: "الاختبار غير موجود" }, { status: 404 });
    const mod = await db.moduleCourse.findUnique({ where: { id: exam.moduleId } });
    if (!mod || (user.role !== "OWNER" && mod.specialtyId !== user.assignedSpecialtyId)) {
      return NextResponse.json({ error: "هذا الاختبار خارج نطاق تخصصك" }, { status: 403 });
    }
    let newModuleName: string | null = null;
    if (moduleId !== undefined && Number(moduleId) !== exam.moduleId) {
      const newMod = await db.moduleCourse.findUnique({ where: { id: Number(moduleId) } });
      if (!newMod) return NextResponse.json({ error: "المقياس الجديد غير موجود" }, { status: 400 });
      if (user.role !== "OWNER" && newMod.specialtyId !== user.assignedSpecialtyId) {
        return NextResponse.json({ error: "المقياس الجديد خارج نطاق تخصصك" }, { status: 403 });
      }
      newModuleName = newMod.name;
    }
    const t = title?.trim();
    if (title !== undefined && !t) return NextResponse.json({ error: "العنوان مطلوب" }, { status: 400 });
    const d = examDate?.trim();
    if (examDate !== undefined && !d) return NextResponse.json({ error: "التاريخ مطلوب" }, { status: 400 });
    const updated = await db.exam.update({
      where: { id: Number(id) },
      data: {
        ...(newModuleName !== null ? { moduleId: Number(moduleId), moduleName: newModuleName } : {}),
        ...(t ? { title: t } : {}),
        ...(d ? { examDate: d } : {}),
        ...(time !== undefined ? { time: time?.trim() || "—" } : {}),
        ...(room !== undefined ? { room: room?.trim() || "—" } : {}),
        ...(coefficient !== undefined ? { coefficient: coefficient ?? 2 } : {}),
      },
    });
    if (d && d !== exam.examDate) {
      await notifyContentPublished({
        actorId: user.id,
        actorName: user.fullName,
        specialtyId: mod.specialtyId,
        type: "content_exam",
        title: "تغيّر موعد اختبار",
        body: `«${t ?? exam.title}» — من ${exam.examDate} إلى ${d}`,
        meta: { examId: Number(id), examDate: d, urgency: "عاجل" },
      });
    }
    return NextResponse.json({ exam: updated });
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
      // round 5: ownership check — the exam's module must be inside the caller's
      // specialty (previously ANY supervisor could delete ANY specialty's exam).
      const { data: exam } = await supabase.from("exams").select("module_id").eq("id", parseInt(id)).maybeSingle();
      if (!exam) return NextResponse.json({ error: "الاختبار غير موجود" }, { status: 404 });
      const { data: mod } = await supabase.from("module_courses").select("specialty_id").eq("id", Number(exam.module_id)).maybeSingle();
      if (!mod || (user.role !== "OWNER" && Number(mod.specialty_id) !== user.assignedSpecialtyId)) {
        return NextResponse.json({ error: "هذا الاختبار خارج نطاق تخصصك" }, { status: 403 });
      }
      const { error } = await supabase.from("exams").delete().eq("id", parseInt(id));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const exam = await db.exam.findUnique({ where: { id: parseInt(id) } });
      if (!exam) return NextResponse.json({ error: "الاختبار غير موجود" }, { status: 404 });
      const mod = await db.moduleCourse.findUnique({ where: { id: exam.moduleId }, select: { specialtyId: true } });
      if (!mod || (user.role !== "OWNER" && mod.specialtyId !== user.assignedSpecialtyId)) {
        return NextResponse.json({ error: "هذا الاختبار خارج نطاق تخصصك" }, { status: 403 });
      }
      await db.exam.delete({ where: { id: parseInt(id) } });
    }
    return NextResponse.json({ ok: true, message: "تم حذف الاختبار" });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
