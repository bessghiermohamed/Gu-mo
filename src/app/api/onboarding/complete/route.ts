/**
 * Complete onboarding - save user profile & link to cohort
 * Uses Supabase on Vercel, Prisma locally.
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
      track,
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
      ]);

      // Update app_users
      const { error: userError } = await supabase
        .from("app_users")
        .update({
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          assigned_specialty_id: specialtyId ?? user.assignedSpecialtyId,
          scope_specialty_id: specialtyId ?? null,
          scope_academic_year_id: academicYearId ?? null,
          scope_cohort_group_id: cohortId ?? null,
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

      // Upsert student_profiles
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
          profile_track: track ?? "",
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

    await db.appUser.update({
      where: { id: user.id },
      data: {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        assignedSpecialtyId: specialtyId ?? user.assignedSpecialtyId,
        scopeSpecialtyId: specialtyId ?? null,
        scopeAcademicYearId: academicYearId ?? null,
        scopeCohortGroupId: cohortId ?? null,
        specialtyName: specialty?.nameAr ?? "",
        yearName: year?.yearName ?? "",
        groupNumber: cohort?.groupName ?? "",
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
        profileTrack: track ?? "",
        selectedSpecialtyId: specialtyId ?? 1,
        selectedYearId: academicYearId ?? 1,
        selectedCohortId: cohortId ?? null,
        academicYearName: year?.yearName ?? "",
        groupNumber: cohort?.groupName ?? "",
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
        profileTrack: track ?? "",
        selectedSpecialtyId: specialtyId ?? 1,
        selectedYearId: academicYearId ?? 1,
        selectedCohortId: cohortId ?? null,
        academicYearName: year?.yearName ?? "",
        groupNumber: cohort?.groupName ?? "",
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
