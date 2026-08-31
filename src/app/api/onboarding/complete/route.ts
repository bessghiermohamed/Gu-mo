/**
 * Complete onboarding - save user profile & link to cohort
 * Uses Supabase on Vercel, Prisma locally.
 *
 * fix أ.4: now saves scope_institution_id + scope_track_id so content can be
 *          filtered by the student's full academic scope.
 * fix (profile bug): student_profiles row is now PER USER (id = user id)
 *          instead of the shared singleton row id=1 that every user overwrote.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "غير مسجّل الدخول" }, { status: 401 });
    }

    const body = await req.json();
    const {
      fullName,
      email,
      institutionId,
      specialtyId,
      academicYearId,
      cohortId,
      trackId,
    } = body;

    if (!fullName?.trim() || !email?.trim()) {
      return NextResponse.json(
        { error: "الاسم والبريد مطلوبان" },
        { status: 400 }
      );
    }

    if (isVercel) {
      const supabase = await createSupabaseServerClient();

      // Fetch related records for denormalized fields
      const [
        { data: institution },
        { data: specialty },
        { data: year },
        { data: cohort },
        { data: track },
      ] = await Promise.all([
        institutionId
          ? supabase.from("institutions").select("name_ar").eq("id", institutionId).maybeSingle()
          : Promise.resolve({ data: null }),
        specialtyId
          ? supabase.from("specialties").select("name_ar, faculty").eq("id", specialtyId).maybeSingle()
          : Promise.resolve({ data: null }),
        academicYearId
          ? supabase.from("academic_years").select("year_name").eq("id", academicYearId).maybeSingle()
          : Promise.resolve({ data: null }),
        cohortId
          ? supabase.from("cohort_groups").select("group_name").eq("id", cohortId).maybeSingle()
          : Promise.resolve({ data: null }),
        trackId
          ? supabase.from("academic_tracks").select("track_name_ar, code").eq("id", trackId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      // Update app_users — fix أ.4: persist the FULL academic scope
      const { error: userError } = await supabase
        .from("app_users")
        .update({
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          assigned_specialty_id: specialtyId ?? user.assignedSpecialtyId,
          scope_institution_id: institutionId ?? null,
          scope_specialty_id: specialtyId ?? null,
          scope_academic_year_id: academicYearId ?? null,
          scope_cohort_group_id: cohortId ?? null,
          scope_track_id: trackId ?? null,
          specialty_name: specialty?.name_ar ?? "",
          year_name: year?.year_name ?? "",
          group_number: cohort?.group_name ?? "",
        })
        .eq("id", user.id);

      if (userError) {
        return NextResponse.json(
          { error: `فشل تحديث المستخدم: ${userError.message}` },
          { status: 500 }
        );
      }

      // Upsert student_profiles — PER USER (id = user.id), not the shared row id=1
      const { error: profileError } = await supabase
        .from("student_profiles")
        .upsert({
          id: user.id,
          user_id: String(user.id),
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          institution: institution?.name_ar ?? "",
          university: institution?.name_ar ?? "",
          faculty: specialty?.faculty ?? "",
          specialty_name: specialty?.name_ar ?? "",
          profile_track: track?.track_name_ar ?? "",
          track_id: trackId ?? null,
          selected_specialty_id: specialtyId ?? 1,
          selected_year_id: academicYearId ?? 1,
          selected_cohort_id: cohortId ?? null,
          academic_year_name: year?.year_name ?? "",
          group_number: cohort?.group_name ?? "",
          is_configured: true,
        });

      if (profileError) {
        console.error("Profile upsert error:", profileError);
      }

      return NextResponse.json({ ok: true });
    }

    // Local Prisma fallback
    const institution = institutionId
      ? await db.institution.findUnique({ where: { id: institutionId } })
      : null;
    const specialty = specialtyId
      ? await db.specialty.findUnique({ where: { id: specialtyId } })
      : null;
    const year = academicYearId
      ? await db.academicYear.findUnique({ where: { id: academicYearId } })
      : null;
    const cohort = cohortId
      ? await db.cohortGroup.findUnique({ where: { id: cohortId } })
      : null;
    const track = trackId
      ? await db.academicTrack.findUnique({ where: { id: trackId } })
      : null;

    await db.appUser.update({
      where: { id: user.id },
      data: {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        assignedSpecialtyId: specialtyId ?? user.assignedSpecialtyId,
        scopeInstitutionId: institutionId ?? null,
        scopeSpecialtyId: specialtyId ?? null,
        scopeAcademicYearId: academicYearId ?? null,
        scopeCohortGroupId: cohortId ?? null,
        scopeTrackId: trackId ?? null,
        specialtyName: specialty?.nameAr ?? "",
        yearName: year?.yearName ?? "",
        groupNumber: cohort?.groupName ?? "",
      },
    });

    // PER-USER profile (id = user.id)
    const profileData = {
      userId: String(user.id),
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      institution: institution?.nameAr ?? "",
      university: institution?.nameAr ?? "",
      faculty: specialty?.faculty ?? "",
      specialtyName: specialty?.nameAr ?? "",
      profileTrack: track?.trackNameAr ?? "",
      trackId: trackId ?? null,
      selectedSpecialtyId: specialtyId ?? 1,
      selectedYearId: academicYearId ?? 1,
      selectedCohortId: cohortId ?? null,
      academicYearName: year?.yearName ?? "",
      groupNumber: cohort?.groupName ?? "",
      isConfigured: true,
    };

    await db.studentProfile.upsert({
      where: { id: user.id },
      create: { id: user.id, ...profileData },
      update: profileData,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: `خطأ داخلي: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
