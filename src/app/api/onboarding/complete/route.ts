/**
 * Complete onboarding - save user profile & link to cohort
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/service";

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

    // Fetch related records for denormalized fields
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

    // Update the AppUser
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

    // Upsert StudentProfile (for theme + scheduleImage fields)
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
