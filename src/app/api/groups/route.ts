import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canCreateGroups } from "@/lib/auth/permissions";
import { fetchStudyGroups } from "@/lib/data-layer";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function GET(req: NextRequest) {
  // fix أ.3/أ.4 (round 3): this endpoint used to trust the client's
  // specialtyId/yearId/trackId with NO auth — any logged-in student could
  // forge the URL and see every other specialty's groups. Now the scope is
  // derived SERVER-SIDE from the session:
  //   STUDENT  → always their own (specialty + year + track); if onboarding
  //              isn't complete they get an empty list + a hint flag.
  //   REPRESENTATIVE → their own specialty (and year if scoped).
  //   SPECIALTY_ADMIN → their own specialty only.
  //   OWNER → free browsing (manages everything).
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }
  const url = new URL(req.url);
  let specialtyId = url.searchParams.get("specialtyId");
  let academicYearId = url.searchParams.get("academicYearId");
  let trackId = url.searchParams.get("trackId");

  if (user.role === "STUDENT") {
    if (user.scopeAcademicYearId == null) {
      return NextResponse.json({ groups: [], needsOnboarding: true });
    }
    specialtyId = String(user.assignedSpecialtyId);
    academicYearId = String(user.scopeAcademicYearId);
    trackId = user.scopeTrackId != null ? String(user.scopeTrackId) : null;
  } else if (user.role === "REPRESENTATIVE" || user.role === "SPECIALTY_ADMIN") {
    specialtyId = String(user.assignedSpecialtyId);
    if (user.role === "REPRESENTATIVE" && user.scopeAcademicYearId != null) {
      academicYearId = String(user.scopeAcademicYearId);
    }
  }

  if (!specialtyId) return NextResponse.json({ groups: [] });
  try {
    const groups = await fetchStudyGroups(
      parseInt(specialtyId),
      academicYearId ? parseInt(academicYearId) : undefined,
      trackId ? parseInt(trackId) : undefined
    );
    return NextResponse.json({ groups });
  } catch (e) {
    return NextResponse.json({ groups: [] });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canCreateGroups(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { specialtyId, academicYearId, trackId, groupName, description } = body;
    if (!specialtyId || !academicYearId || !groupName?.trim()) {
      return NextResponse.json({ error: "specialtyId, academicYearId, groupName مطلوبة" }, { status: 400 });
    }
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.from("study_groups").insert({
        specialty_id: specialtyId, academic_year_id: academicYearId,
        track_id: trackId ?? null, group_name: groupName.trim(),
        description: description?.trim() ?? "",
      }).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ group: data });
    }
    const group = await db.studyGroup.create({
      data: {
        specialtyId, academicYearId, trackId: trackId ?? null,
        groupName: groupName.trim(), description: description?.trim() ?? "",
      },
    } as never);
    return NextResponse.json({ group });
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
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: cohortsInGroup } = await supabase.from("cohort_groups").select("id").eq("group_id", parseInt(id));
      if (cohortsInGroup && cohortsInGroup.length > 0) {
        return NextResponse.json({ error: `لا يمكن حذف المجموعة: ${cohortsInGroup.length} فوج بداخلها.` }, { status: 400 });
      }
      const { error } = await supabase.from("study_groups").delete().eq("id", parseInt(id));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      await db.studyGroup.delete({ where: { id: parseInt(id) } } as never);
    }
    return NextResponse.json({ ok: true, message: "تم حذف المجموعة" });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
