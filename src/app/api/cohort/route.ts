import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canCreateCohorts } from "@/lib/auth/permissions";
import { fetchCohorts } from "@/lib/data-layer";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function GET(req: NextRequest) {
  // fix أ.3/أ.4 (round 3): server-side scope enforcement (was fully open).
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  const url = new URL(req.url);
  let specialtyId = url.searchParams.get("specialtyId");
  const academicYearId = url.searchParams.get("academicYearId");
  const trackId = url.searchParams.get("trackId");
  const groupId = url.searchParams.get("groupId");

  if (user.role === "STUDENT") {
    // Students never browse other specialties' regiments.
    specialtyId = String(user.assignedSpecialtyId);
    const filtered = await fetchCohorts(
      user.assignedSpecialtyId,
      user.scopeAcademicYearId ?? undefined,
      user.scopeTrackId ?? undefined
    );
    return NextResponse.json({ cohorts: filtered });
  }
  if (user.role === "REPRESENTATIVE" || user.role === "SPECIALTY_ADMIN") {
    specialtyId = String(user.assignedSpecialtyId);
  }
  if (!specialtyId) return NextResponse.json({ cohorts: [] });
  try {
    const cohorts = await fetchCohorts(
      parseInt(specialtyId),
      academicYearId ? parseInt(academicYearId) : undefined,
      trackId ? parseInt(trackId) : undefined
    );
    const filtered = groupId
      ? cohorts.filter((c) => c.groupId === parseInt(groupId))
      : cohorts;
    return NextResponse.json({ cohorts: filtered });
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
    const { specialtyId, academicYearId, groupName, subGroup, trackId, groupId } = body;
    if (!specialtyId || !groupName?.trim()) {
      return NextResponse.json({ error: "specialtyId و groupName مطلوبة" }, { status: 400 });
    }
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      // fix ب: when a group is given, verify it exists (no orphan cohorts)
      if (groupId) {
        const { data: group } = await supabase.from("study_groups").select("id, specialty_id, academic_year_id").eq("id", groupId).maybeSingle();
        if (!group) return NextResponse.json({ error: "المجموعة غير موجودة" }, { status: 400 });
        if (Number(group.specialty_id) !== Number(specialtyId)) {
          return NextResponse.json({ error: "المجموعة لا تنتمي لهذا التخصص" }, { status: 400 });
        }
      }
      let dupQuery = supabase.from("cohort_groups").select("id").eq("specialty_id", specialtyId).eq("group_name", groupName.trim());
      if (academicYearId) dupQuery = dupQuery.eq("academic_year_id", academicYearId);
      const { data: existing } = await dupQuery.maybeSingle();
      if (existing) return NextResponse.json({ error: `يوجد فوج بنفس الاسم "${groupName.trim()}"` }, { status: 409 });
      const { data: newCohort, error } = await supabase.from("cohort_groups").insert({
        specialty_id: specialtyId, academic_year_id: academicYearId ?? 1,
        track_id: trackId ?? null, group_id: groupId ?? null,
        group_name: groupName.trim(), sub_group: subGroup?.trim() ?? "",
      }).select().single();
      if (error || !newCohort) return NextResponse.json({ error: `فشل الإنشاء: ${error?.message}` }, { status: 500 });
      return NextResponse.json({ cohort: { id: newCohort.id, specialtyId: newCohort.specialty_id, academicYearId: newCohort.academic_year_id, trackId: newCohort.track_id ?? null, groupId: newCohort.group_id ?? null, groupName: newCohort.group_name, subGroup: newCohort.sub_group ?? "" } });
    }
    const { db } = await import("@/lib/db");
    if (groupId) {
      const group = await db.studyGroup.findUnique({ where: { id: groupId } });
      if (!group) return NextResponse.json({ error: "المجموعة غير موجودة" }, { status: 400 });
      if (group.specialtyId !== Number(specialtyId)) {
        return NextResponse.json({ error: "المجموعة لا تنتمي لهذا التخصص" }, { status: 400 });
      }
    }
    const newCohort = await db.cohortGroup.create({
      data: { specialtyId, academicYearId: academicYearId ?? 1, trackId: trackId ?? null, groupId: groupId ?? null, groupName: groupName.trim(), subGroup: subGroup?.trim() ?? "" },
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
      // round 3: clean dangling profile references so deleted regiments
      // never reappear inside students' profile screens
      await supabase.from("student_profiles").update({ selected_cohort_id: null, group_number: "" }).eq("selected_cohort_id", parseInt(id));
      const { error } = await supabase.from("cohort_groups").delete().eq("id", parseInt(id));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { db } = await import("@/lib/db");
      // round 3: same protection as the Supabase branch — the local branch used
      // to delete straight away, silently detaching (SetNull) every student.
      const attached = await db.appUser.count({ where: { scopeCohortGroupId: parseInt(id) } });
      if (attached > 0) return NextResponse.json({ error: `لا يمكن حذف الفوج: ${attached} مستخدم مُلحق به.` }, { status: 400 });
      await db.studentProfile.updateMany({ where: { selectedCohortId: parseInt(id) } as never, data: { selectedCohortId: null, groupNumber: "" } });
      await db.cohortGroup.delete({ where: { id: parseInt(id) } });
    }
    return NextResponse.json({ ok: true, message: "تم حذف الفوج" });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
