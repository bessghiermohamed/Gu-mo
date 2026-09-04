import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getCurrentUser();
  if (!caller || caller.role !== "OWNER") return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  const targetId = Number((await params).id);
  if (!Number.isInteger(targetId) || targetId < 1) return NextResponse.json({ error: "معرّف مستخدم غير صالح" }, { status: 400 });
  const body = await req.json().catch(() => null);
  const specialtyId = Number(body?.specialtyId);
  const yearId = Number(body?.academicYearId);
  const trackId = body?.trackId ? Number(body.trackId) : null;
  const groupId = body?.groupId ? Number(body.groupId) : null;
  const cohortId = body?.cohortId ? Number(body.cohortId) : null;
  if (![specialtyId, yearId].every((value) => Number.isInteger(value) && value > 0)) {
    return NextResponse.json({ error: "يرجى اختيار التخصص والسنة" }, { status: 400 });
  }

  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const [{ data: specialty }, { data: year }, { data: track }, { data: group }, { data: cohort }] = await Promise.all([
        supabase.from("specialties").select("id, institution_id, name_ar").eq("id", specialtyId).maybeSingle(),
        supabase.from("academic_years").select("id, specialty_id, year_name").eq("id", yearId).maybeSingle(),
        trackId ? supabase.from("academic_tracks").select("id, specialty_id, track_name_ar").eq("id", trackId).maybeSingle() : Promise.resolve({ data: null }),
        groupId ? supabase.from("study_groups").select("id, specialty_id, academic_year_id, group_name").eq("id", groupId).maybeSingle() : Promise.resolve({ data: null }),
        cohortId ? supabase.from("cohort_groups").select("id, specialty_id, academic_year_id, group_id, group_name").eq("id", cohortId).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      if (!specialty || !year || Number(year.specialty_id) !== specialtyId || (track && Number(track.specialty_id) !== specialtyId) || (group && (Number(group.specialty_id) !== specialtyId || Number(group.academic_year_id) !== yearId)) || (cohort && (Number(cohort.specialty_id) !== specialtyId || Number(cohort.academic_year_id) !== yearId || (groupId && Number(cohort.group_id) !== groupId)))) return NextResponse.json({ error: "المسار الأكاديمي غير متناسق" }, { status: 400 });
      const { error } = await supabase.from("app_users").update({ assigned_specialty_id: specialtyId, specialty_name: specialty.name_ar, year_name: year.year_name, group_number: cohort?.group_name ?? group?.group_name ?? "", scope_institution_id: specialty.institution_id, scope_specialty_id: specialtyId, scope_academic_year_id: yearId, scope_track_id: trackId, scope_group_id: groupId, scope_cohort_group_id: cohortId }).eq("id", targetId);
      if (error) return NextResponse.json({ error: "تعذر تحديث المسار" }, { status: 500 });
    } else {
      const specialty = await db.specialty.findUnique({ where: { id: specialtyId } });
      const year = await db.academicYear.findUnique({ where: { id: yearId } });
      const track = trackId ? await db.academicTrack.findUnique({ where: { id: trackId } }) : null;
      const group = groupId ? await db.studyGroup.findUnique({ where: { id: groupId } }) : null;
      const cohort = cohortId ? await db.cohortGroup.findUnique({ where: { id: cohortId } }) : null;
      if (!specialty || !year || year.specialtyId !== specialtyId || (track && track.specialtyId !== specialtyId) || (group && (group.specialtyId !== specialtyId || group.academicYearId !== yearId)) || (cohort && (cohort.specialtyId !== specialtyId || cohort.academicYearId !== yearId || (groupId && cohort.groupId !== groupId)))) return NextResponse.json({ error: "المسار الأكاديمي غير متناسق" }, { status: 400 });
      await db.appUser.update({ where: { id: targetId }, data: { assignedSpecialtyId: specialtyId, specialtyName: specialty.nameAr, yearName: year.yearName, groupNumber: cohort?.groupName ?? group?.groupName ?? "", scopeInstitutionId: specialty.institutionId, scopeSpecialtyId: specialtyId, scopeAcademicYearId: yearId, scopeTrackId: trackId, scopeGroupId: groupId, scopeCohortGroupId: cohortId } });
    }
    return NextResponse.json({ message: "تم تغيير المسار الأكاديمي بنجاح" });
  } catch (error) {
    console.error("[v0] academic path update failed", error);
    return NextResponse.json({ error: "تعذر تحديث المسار الأكاديمي" }, { status: 500 });
  }
}
