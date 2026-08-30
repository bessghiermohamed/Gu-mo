import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canCreateCohorts } from "@/lib/auth/permissions";
import { fetchCohorts } from "@/lib/data-layer";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const specialtyId = url.searchParams.get("specialtyId");
  const academicYearId = url.searchParams.get("academicYearId");
  if (!specialtyId) return NextResponse.json({ cohorts: [] });
  try {
    const cohorts = await fetchCohorts(
      parseInt(specialtyId),
      academicYearId ? parseInt(academicYearId) : undefined
    );
    return NextResponse.json({ cohorts });
  } catch (e) {
    return NextResponse.json({ cohorts: [] });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canCreateCohorts(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { specialtyId, academicYearId, groupName, subGroup } = body;
    if (!specialtyId || !groupName?.trim()) {
      return NextResponse.json({ error: "specialtyId و groupName مطلوبة" }, { status: 400 });
    }
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      let dupQuery = supabase.from("cohort_groups").select("id").eq("specialty_id", specialtyId).eq("group_name", groupName.trim());
      if (academicYearId) dupQuery = dupQuery.eq("academic_year_id", academicYearId);
      const { data: existing } = await dupQuery.maybeSingle();
      if (existing) return NextResponse.json({ error: `يوجد فوج بنفس الاسم "${groupName.trim()}"` }, { status: 409 });
      const { data: newCohort, error } = await supabase.from("cohort_groups").insert({
        specialty_id: specialtyId, academic_year_id: academicYearId ?? 1,
        group_name: groupName.trim(), sub_group: subGroup?.trim() ?? "",
      }).select().single();
      if (error || !newCohort) return NextResponse.json({ error: `فشل الإنشاء: ${error?.message}` }, { status: 500 });
      return NextResponse.json({ cohort: { id: newCohort.id, specialtyId: newCohort.specialty_id, academicYearId: newCohort.academic_year_id, groupName: newCohort.group_name, subGroup: newCohort.sub_group ?? "" } });
    }
    const { db } = await import("@/lib/db");
    const newCohort = await db.cohortGroup.create({
      data: { specialtyId, academicYearId: academicYearId ?? 1, groupName: groupName.trim(), subGroup: subGroup?.trim() ?? "" },
    });
    return NextResponse.json({ cohort: newCohort });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canCreateCohorts(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: usersInCohort } = await supabase.from("app_users").select("id").eq("scope_cohort_group_id", parseInt(id));
      if (usersInCohort && usersInCohort.length > 0) return NextResponse.json({ error: `لا يمكن حذف الفوج: ${usersInCohort.length} مستخدم مُلحق به.` }, { status: 400 });
      const { error } = await supabase.from("cohort_groups").delete().eq("id", parseInt(id));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { db } = await import("@/lib/db");
      await db.cohortGroup.delete({ where: { id: parseInt(id) } });
    }
    return NextResponse.json({ ok: true, message: "تم حذف الفوج" });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
