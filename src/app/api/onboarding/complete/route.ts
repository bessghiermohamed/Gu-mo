/**
 * Complete onboarding - save user profile & link to cohort
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";

const isVercel = process.env.VERCEL === "1";

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
      trackId,
      academicYearId,
      cohortId,
    } = body;

    if (!fullName?.trim() || !email?.trim()) {
      return NextResponse.json(
        { error: "الاسم والبريد مطلوبان" },
        { status: 400 }
      );
    }

    if (isVercel) {
      const supabase = await createSupabaseServerClient();

      // Fetch related records
      const [
        { data: institution },
        { data: specialty },
        { data: year },
        { data: cohort },
        { data: track },
      ] = await Promise.all([
        institutionId
          ? supabase.from("institutions").select("*").eq("id", institutionId).maybeSingle()
          : Promise.resolve({ data: null }),
        specialtyId
          ? supabase.from("specialties").select("*").eq("id", specialtyId).maybeSingle()
          : Promise.resolve({ data: null }),
        academicYearId
          ? supabase.from("academic_years").select("*").eq("id", academicYearId).maybeSingle()
          : Promise.resolve({ data: null }),
        cohortId
          ? supabase.from("cohort_groups").select("*").eq("id", cohortId).maybeSingle()
          : Promise.resolve({ data: null }),
        trackId
          ? supabase.from("academic_tracks").select("*").eq("id", trackId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      // Update app_user — NO cohort assigned at registration (matches new Android behavior)
      const { error: userError } = await supabase
        .from("app_users")
        .update({
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          assigned_specialty_id: specialtyId ?? user.assignedSpecialtyId,
          scope_specialty_id: specialtyId ?? null,
          scope_academic_year_id: academicYearId ?? null,
          scope_track_id: trackId ?? null,
          scope_cohort_group_id: null, // Student gets assigned later by representative
          specialty_name: specialty?.name_ar ?? "",
          year_name: year?.year_name ?? "",
          group_number: "", // Empty — "بلا فوج" until assigned
        })
        .eq("id", user.id);

      if (userError) {
        return NextResponse.json(
          { error: `فشل تحديث المستخدم: ${userError.message}` },
          { status: 500 }
        );
      }

      // Upsert student_profile
      const { error: profileError } = await supabase
        .from("student_profiles")
        .upsert({
          id: 1,
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
          selected_cohort_id: null,
          academic_year_name: year?.year_name ?? "",
          group_number: "", // بلا فوج
          is_configured: true,
        });

      if (profileError) {
        console.error("Profile upsert error:", profileError);
      }

      return NextResponse.json({ ok: true });
    }

    // Local (Prisma)
    const institution = institutionId
      ? await db.institution.findUnique({ where: { id: institutionId } })
      : null;
    const specialty = specialtyId
      ? await db.specialty.findUnique({ where: { id: specialtyId } })
      : null;
    const year = academicYearId
      ? await db.academicYear.findUnique({ where: { id: academicYearId } })
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
        scopeSpecialtyId: specialtyId ?? null,
        scopeAcademicYearId: academicYearId ?? null,
        scopeTrackId: trackId ?? null,
        scopeCohortGroupId: null,
        specialtyName: specialty?.nameAr ?? "",
        yearName: year?.yearName ?? "",
        groupNumber: "",
      },
    });

    await db.studentProfile.upsert({
      where: { id: 1 },
      create: {
        id: 1,
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
        selectedCohortId: null,
        academicYearName: year?.yearName ?? "",
        groupNumber: "",
        isConfigured: true,
      },
      update: {
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
        selectedCohortId: null,
        academicYearName: year?.yearName ?? "",
        groupNumber: "",
        isConfigured: true,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: `خطأ داخلي: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
