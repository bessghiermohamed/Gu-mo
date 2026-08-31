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
 *   GET    ?specialtyId=1            → list years of a specialty (login required)
 *   POST   { specialtyId, yearName } → add a year (supervisory roles)
 *   DELETE ?id=7                     → delete a year (blocked while groups/
 *                                      cohorts/modules still reference it)
 *
 * Permission: same as group creation (OWNER / SPECIALTY_ADMIN / REPRESENTATIVE).
 */
const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  const url = new URL(req.url);
  const specialtyId = url.searchParams.get("specialtyId");
  if (!specialtyId) return NextResponse.json({ years: [] });
  try {
    const years = await fetchAcademicYears(parseInt(specialtyId));
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
    const { specialtyId, yearName, semester } = body;
    if (!specialtyId || !yearName?.trim()) {
      return NextResponse.json({ error: "specialtyId و yearName مطلوبة" }, { status: 400 });
    }
    const name = yearName.trim();
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      // duplicate guard: same specialty + same year name
      const { data: existing } = await supabase
        .from("academic_years")
        .select("id")
        .eq("specialty_id", specialtyId)
        .eq("year_name", name)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({ error: `السنة "${name}" موجودة مسبقاً لهذا التخصص` }, { status: 409 });
      }
      const { data, error } = await supabase
        .from("academic_years")
        .insert({
          specialty_id: specialtyId,
          year_name: name,
          semester: semester === 2 ? 2 : 1,
        })
        .select()
        .single();
      if (error || !data) {
        return NextResponse.json({ error: `فشل الإنشاء: ${error?.message ?? "خطأ"}` }, { status: 500 });
      }
      return NextResponse.json({
        year: { id: data.id, specialtyId: data.specialty_id, yearName: data.year_name, semester: data.semester },
      });
    }
    const dup = await db.academicYear.findFirst({
      where: { specialtyId: Number(specialtyId), yearName: name },
    });
    if (dup) {
      return NextResponse.json({ error: `السنة "${name}" موجودة مسبقاً لهذا التخصص` }, { status: 409 });
    }
    const year = await db.academicYear.create({
      data: {
        specialtyId: Number(specialtyId),
        yearName: name,
        semester: semester === 2 ? 2 : 1,
      },
    });
    return NextResponse.json({
      year: { id: year.id, specialtyId: year.specialtyId, yearName: year.yearName, semester: year.semester },
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
  const yearId = parseInt(id);
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      // protect: block while dependents still reference the year
      const [groups, cohorts, modules] = await Promise.all([
        supabase.from("study_groups").select("id", { count: "exact", head: true }).eq("academic_year_id", yearId),
        supabase.from("cohort_groups").select("id", { count: "exact", head: true }).eq("academic_year_id", yearId),
        supabase.from("module_courses").select("id", { count: "exact", head: true }).eq("academic_year_id", yearId),
      ]);
      const g = groups.count ?? 0, c = cohorts.count ?? 0, m = modules.count ?? 0;
      if (g + c + m > 0) {
        return NextResponse.json({
          error: `لا يمكن حذف السنة: تحتوي ${g} مجموعة و ${c} فوج و ${m} مقياس. احذفها أو انقلها أولاً.`,
        }, { status: 400 });
      }
      // clear dangling user scopes (no FK on this column)
      await supabase.from("app_users").update({ scope_academic_year_id: null }).eq("scope_academic_year_id", yearId);
      const { error } = await supabase.from("academic_years").delete().eq("id", yearId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const g = await db.studyGroup.count({ where: { academicYearId: yearId } });
      const c = await db.cohortGroup.count({ where: { academicYearId: yearId } });
      const m = await db.moduleCourse.count({ where: { academicYearId: yearId } });
      if (g + c + m > 0) {
        return NextResponse.json({
          error: `لا يمكن حذف السنة: تحتوي ${g} مجموعة و ${c} فوج و ${m} مقياس. احذفها أو انقلها أولاً.`,
        }, { status: 400 });
      }
      await db.appUser.updateMany({ where: { scopeAcademicYearId: yearId }, data: { scopeAcademicYearId: null } });
      await db.academicYear.delete({ where: { id: yearId } });
    }
    return NextResponse.json({ ok: true, message: "تم حذف السنة" });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
