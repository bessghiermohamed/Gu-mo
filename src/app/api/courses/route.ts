/**
 * Courses API — fix أ.3 (scope leak)
 *
 * BEFORE: fetched ALL courses of the specialty, ignoring the student's year.
 *         Students from different years saw each other's courses.
 * AFTER:  filters by specialty AND academic year (when the student has one).
 *         Also returns `semester` so the screen can filter semesters for real
 *         (before, the screen guessed the semester from the course code!).
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canCreateModules } from "@/lib/auth/permissions";

/**
 * Round 6 — CRUD completion for courses (المقاييس).
 *
 * LOGICAL FLAW: the admin panel had an "add course" button but NO edit and
 * NO delete. A typo in the course name / code / professor was permanent —
 * the wrong course stayed in every student's list forever.
 *
 *   PATCH  { id, name?, code?, professorName?, coefficient?, semester?,
 *           academicYearId?, category?, description? } → edit a course
 *   DELETE ?id=7 → delete a course, BLOCKED while exams/assignments/
 *           grades/lectures still reference it (DB would cascade-wipe
 *           students' grades — the guard forces the admin to clear the
 *           dependents first, same pattern as the years delete guard).
 *
 * Authorization: canCreateModules (OWNER / SPECIALTY_ADMIN) + scope check —
 * non-OWNER callers may only touch courses of their OWN specialty.
 */

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ courses: [] });
    // Year scope: students get it from onboarding. Supervisors without a year
    // scope (e.g. OWNER who never onboarded) see the whole specialty.
    const yearId = user.scopeAcademicYearId ?? null;

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      let query = supabase
        .from("module_courses")
        .select("*")
        .eq("specialty_id", user.assignedSpecialtyId);
      if (yearId) query = query.eq("academic_year_id", yearId);
      const { data, error } = await query.order("id", { ascending: true });
      if (error) return NextResponse.json({ courses: [] });
      const courses = (data ?? []).map((c: Record<string, unknown>) => ({
        id: Number(c.id), name: String(c.name ?? ""), code: String(c.code ?? ""),
        coefficient: Number(c.coefficient ?? 2), professorName: String(c.professor_name ?? ""),
        category: String(c.category ?? "أساسي"), description: String(c.description ?? ""),
        semester: Number(c.semester ?? 1), academicYearId: Number(c.academic_year_id ?? 0),
      }));
      return NextResponse.json({ courses });
    }
    const items = await db.moduleCourse.findMany({
      where: {
        specialtyId: user.assignedSpecialtyId,
        ...(yearId ? { academicYearId: yearId } : {}),
      },
      orderBy: { id: "asc" },
    });
    return NextResponse.json({
      courses: items.map((c) => ({
        id: c.id, name: c.name, code: c.code, coefficient: c.coefficient,
        professorName: c.professorName, category: c.category, description: c.description,
        semester: c.semester, academicYearId: c.academicYearId,
      })),
    });
  } catch (e) {
    return NextResponse.json({ courses: [] });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canCreateModules(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { name, code, professorName, coefficient, credits, category, description, specialtyId, academicYearId, semester } = body;
    if (!name?.trim() || !code?.trim()) {
      return NextResponse.json({ error: "الاسم والكود مطلوبان" }, { status: 400 });
    }
    // fix: no more hardcoded year 1 — default to the creator's year scope
    const finalYearId = academicYearId ?? user.scopeAcademicYearId ?? 1;
    const finalSemester = semester === 2 ? 2 : 1;
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.from("module_courses").insert({
        specialty_id: specialtyId ?? user.assignedSpecialtyId,
        academic_year_id: finalYearId, semester: finalSemester,
        name: name.trim(), code: code.trim(), coefficient: coefficient ?? 2,
        credits: credits ?? 4, professor_name: professorName?.trim() ?? "",
        category: category ?? "أساسي", description: description?.trim() ?? "",
      }).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ course: data });
    }
    const course = await db.moduleCourse.create({
      data: {
        specialtyId: specialtyId ?? user.assignedSpecialtyId,
        academicYearId: finalYearId, semester: finalSemester,
        name: name.trim(), code: code.trim(), coefficient: coefficient ?? 2,
        credits: credits ?? 4, professorName: professorName?.trim() ?? "",
        category: category ?? "أساسي", description: description?.trim() ?? "",
      },
    });
    return NextResponse.json({ course });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canCreateModules(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { id, name, code, professorName, coefficient, semester, academicYearId, category, description } = body;
    if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
    const trimName = name?.trim();
    const trimCode = code?.trim();
    if (name !== undefined && !trimName) {
      return NextResponse.json({ error: "اسم المقياس لا يمكن أن يكون فارغاً" }, { status: 400 });
    }
    if (code !== undefined && !trimCode) {
      return NextResponse.json({ error: "الكود لا يمكن أن يكون فارغاً" }, { status: 400 });
    }
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: course } = await supabase
        .from("module_courses").select("id, specialty_id, code").eq("id", Number(id)).maybeSingle();
      if (!course) return NextResponse.json({ error: "المقياس غير موجود" }, { status: 404 });
      // scope check — non-OWNER may only edit their own specialty's courses
      if (user.role !== "OWNER" && Number(course.specialty_id) !== user.assignedSpecialtyId) {
        return NextResponse.json({ error: "هذا المقياس خارج نطاق تخصصك" }, { status: 403 });
      }
      // duplicate code guard (same specialty, excluding this row)
      if (trimCode && trimCode !== course.code) {
        const { data: dup } = await supabase
          .from("module_courses").select("id")
          .eq("specialty_id", course.specialty_id).eq("code", trimCode).neq("id", Number(id))
          .maybeSingle();
        if (dup) return NextResponse.json({ error: `الكود "${trimCode}" مستعمل مسبقاً في مقياس آخر` }, { status: 409 });
      }
      const patch: Record<string, unknown> = {};
      if (trimName) patch.name = trimName;
      if (trimCode) patch.code = trimCode;
      if (professorName !== undefined) patch.professor_name = professorName?.trim() ?? "";
      if (coefficient !== undefined && !Number.isNaN(Number(coefficient))) patch.coefficient = Number(coefficient);
      if (semester === 1 || semester === 2) patch.semester = semester;
      if (academicYearId !== undefined && Number(academicYearId) > 0) patch.academic_year_id = Number(academicYearId);
      if (category !== undefined && String(category).trim()) patch.category = String(category).trim();
      if (description !== undefined) patch.description = String(description).trim();
      const { data, error } = await supabase
        .from("module_courses").update(patch).eq("id", Number(id)).select().single();
      if (error || !data) {
        return NextResponse.json({ error: `فشل التحديث: ${error?.message ?? "خطأ"}` }, { status: 500 });
      }
      return NextResponse.json({ course: data });
    }
    const course = await db.moduleCourse.findUnique({ where: { id: Number(id) }, select: { specialtyId: true, code: true } });
    if (!course) return NextResponse.json({ error: "المقياس غير موجود" }, { status: 404 });
    if (user.role !== "OWNER" && course.specialtyId !== user.assignedSpecialtyId) {
      return NextResponse.json({ error: "هذا المقياس خارج نطاق تخصصك" }, { status: 403 });
    }
    if (trimCode && trimCode !== course.code) {
      const dup = await db.moduleCourse.findFirst({
        where: { specialtyId: course.specialtyId, code: trimCode, id: { not: Number(id) } },
      });
      if (dup) return NextResponse.json({ error: `الكود "${trimCode}" مستعمل مسبقاً في مقياس آخر` }, { status: 409 });
    }
    const updated = await db.moduleCourse.update({
      where: { id: Number(id) },
      data: {
        ...(trimName ? { name: trimName } : {}),
        ...(trimCode ? { code: trimCode } : {}),
        ...(professorName !== undefined ? { professorName: professorName?.trim() ?? "" } : {}),
        ...(coefficient !== undefined && !Number.isNaN(Number(coefficient)) ? { coefficient: Number(coefficient) } : {}),
        ...(semester === 1 || semester === 2 ? { semester } : {}),
        ...(academicYearId !== undefined && Number(academicYearId) > 0 ? { academicYearId: Number(academicYearId) } : {}),
        ...(category !== undefined && String(category).trim() ? { category: String(category).trim() } : {}),
        ...(description !== undefined ? { description: String(description).trim() } : {}),
      },
    });
    return NextResponse.json({ course: updated });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canCreateModules(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
  const courseId = parseInt(id);
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: course } = await supabase
        .from("module_courses").select("id, specialty_id, name").eq("id", courseId).maybeSingle();
      if (!course) return NextResponse.json({ error: "المقياس غير موجود" }, { status: 404 });
      if (user.role !== "OWNER" && Number(course.specialty_id) !== user.assignedSpecialtyId) {
        return NextResponse.json({ error: "هذا المقياس خارج نطاق تخصصك" }, { status: 403 });
      }
      // protect: block while dependents still reference the course
      // (DB cascades would silently wipe exams/assignments/students' grades)
      const [exams, assignments, grades, lectures] = await Promise.all([
        supabase.from("exams").select("id", { count: "exact", head: true }).eq("module_id", courseId),
        supabase.from("assignments").select("id", { count: "exact", head: true }).eq("module_id", courseId),
        supabase.from("student_grades").select("id", { count: "exact", head: true }).eq("module_id", courseId),
        supabase.from("lectures").select("id", { count: "exact", head: true }).eq("module_id", courseId),
      ]);
      const ex = exams.count ?? 0, asg = assignments.count ?? 0, gr = grades.count ?? 0, le = lectures.count ?? 0;
      if (ex + asg + gr + le > 0) {
        return NextResponse.json({
          error: `لا يمكن حذف المقياس "${course.name}": مرتبط بـ ${ex} اختبار و ${asg} واجب و ${gr} نقطة و ${le} محاضرة. احذفها أولاً.`,
        }, { status: 400 });
      }
      const { error } = await supabase.from("module_courses").delete().eq("id", courseId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const course = await db.moduleCourse.findUnique({ where: { id: courseId }, select: { specialtyId: true, name: true } });
      if (!course) return NextResponse.json({ error: "المقياس غير موجود" }, { status: 404 });
      if (user.role !== "OWNER" && course.specialtyId !== user.assignedSpecialtyId) {
        return NextResponse.json({ error: "هذا المقياس خارج نطاق تخصصك" }, { status: 403 });
      }
      const ex = await db.exam.count({ where: { moduleId: courseId } });
      const asg = await db.assignment.count({ where: { moduleId: courseId } });
      const gr = await db.studentGrade.count({ where: { moduleId: courseId } });
      const le = await db.lecture.count({ where: { moduleId: courseId } });
      if (ex + asg + gr + le > 0) {
        return NextResponse.json({
          error: `لا يمكن حذف المقياس "${course.name}": مرتبط بـ ${ex} اختبار و ${asg} واجب و ${gr} نقطة و ${le} محاضرة. احذفها أولاً.`,
        }, { status: 400 });
      }
      await db.moduleCourse.delete({ where: { id: courseId } });
    }
    return NextResponse.json({ ok: true, message: "تم حذف المقياس" });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
