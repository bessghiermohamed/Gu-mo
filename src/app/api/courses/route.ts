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
