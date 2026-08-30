/**
 * Cohort management API (fix A.2)
 * - GET: list all cohorts for a given specialty + year
 * - POST: create a new cohort (dynamic, no hardcoded "فوج 3")
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/service";
import { canCreateCohorts, canManageRoles } from "@/lib/auth/permissions";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const specialtyId = url.searchParams.get("specialtyId");
  const academicYearId = url.searchParams.get("academicYearId");

  if (!specialtyId) {
    return NextResponse.json(
      { error: "specialtyId مطلوب" },
      { status: 400 }
    );
  }

  // If academicYearId is provided, filter by it. Otherwise, return all cohorts for the specialty.
  const where: { specialtyId: number; academicYearId?: number } = {
    specialtyId: parseInt(specialtyId),
  };
  if (academicYearId) {
    where.academicYearId = parseInt(academicYearId);
  }

  const cohorts = await db.cohortGroup.findMany({
    where,
    orderBy: { id: "asc" },
  });

  return NextResponse.json({ cohorts });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canCreateCohorts(user)) {
    return NextResponse.json(
      { error: "غير مصرّح: أنت بحاجة إلى صلاحية الإشراف لإنشاء فوج جديد" },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { specialtyId, academicYearId, groupName, subGroup } = body;

    if (!specialtyId || !groupName?.trim()) {
      return NextResponse.json(
        { error: "جميع الحقول مطلوبة: specialtyId, groupName" },
        { status: 400 }
      );
    }

    // Verify caller has scope over this specialty
    if (
      user.role === "SPECIALTY_ADMIN" &&
      specialtyId !== user.assignedSpecialtyId
    ) {
      return NextResponse.json(
        { error: "لا يمكنك إنشاء فوج خارج تخصصك" },
        { status: 403 }
      );
    }

    // Check duplicate (same specialty + same year + same name, OR same specialty + same name if no year)
    const existingWhere: { specialtyId: number; academicYearId?: number; groupName: string } = {
      specialtyId,
      groupName: groupName.trim(),
    };
    if (academicYearId) {
      existingWhere.academicYearId = academicYearId;
    }
    const existing = await db.cohortGroup.findFirst({ where: existingWhere });
    if (existing) {
      return NextResponse.json(
        { error: `يوجد فوج بنفس الاسم "${groupName.trim()}" مسبقاً` },
        { status: 409 }
      );
    }

    const newCohort = await db.cohortGroup.create({
      data: {
        specialtyId,
        academicYearId: academicYearId ?? 1, // default to first year if not specified
        groupName: groupName.trim(),
        subGroup: subGroup?.trim() ?? "",
      },
    });

    return NextResponse.json({ cohort: newCohort });
  } catch (e) {
    return NextResponse.json(
      { error: `خطأ داخلي: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
