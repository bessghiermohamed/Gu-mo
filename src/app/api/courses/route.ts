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
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("module_courses")
        .select("*")
        .eq("specialty_id", user.assignedSpecialtyId)
        .order("id", { ascending: true });
      if (error) return NextResponse.json({ courses: [] });
      const courses = (data ?? []).map((c: Record<string, unknown>) => ({
        id: Number(c.id), name: String(c.name ?? ""), code: String(c.code ?? ""),
        coefficient: Number(c.coefficient ?? 2), professorName: String(c.professor_name ?? ""),
        category: String(c.category ?? "أساسي"), description: String(c.description ?? ""),
      }));
      return NextResponse.json({ courses });
    }
    const items = await db.moduleCourse.findMany({
      where: { specialtyId: user.assignedSpecialtyId },
      orderBy: { id: "asc" },
    });
    return NextResponse.json({
      courses: items.map((c) => ({
        id: c.id, name: c.name, code: c.code, coefficient: c.coefficient,
        professorName: c.professorName, category: c.category, description: c.description,
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
    const { name, code, professorName, coefficient, credits, category, description, specialtyId, academicYearId } = body;
    if (!name?.trim() || !code?.trim()) {
      return NextResponse.json({ error: "الاسم والكود مطلوبان" }, { status: 400 });
    }
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.from("module_courses").insert({
        specialty_id: specialtyId ?? user.assignedSpecialtyId,
        academic_year_id: academicYearId ?? 1, semester: 1,
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
        academicYearId: academicYearId ?? 1, semester: 1,
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
