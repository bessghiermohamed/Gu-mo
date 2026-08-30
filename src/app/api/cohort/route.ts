/**
 * Cohort management API (fix A.2)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canCreateCohorts } from "@/lib/auth/permissions";
import { fetchCohorts } from "@/lib/data-layer";

const isVercel = process.env.VERCEL === "1";

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

  try {
    const cohorts = await fetchCohorts(
      parseInt(specialtyId),
      academicYearId ? parseInt(academicYearId) : undefined
    );
    return NextResponse.json({ cohorts });
  } catch (e) {
    console.error("GET /api/cohort error:", e);
    return NextResponse.json({ cohorts: [] });
  }
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

    if (
      user.role === "SPECIALTY_ADMIN" &&
      specialtyId !== user.assignedSpecialtyId
    ) {
      return NextResponse.json(
        { error: "لا يمكنك إنشاء فوج خارج تخصصك" },
        { status: 403 }
      );
    }

    if (isVercel) {
      const supabase = await createSupabaseServerClient();

      // Check duplicate
      let dupQuery = supabase
        .from("cohort_groups")
        .select("id")
        .eq("specialty_id", specialtyId)
        .eq("group_name", groupName.trim());
      if (academicYearId) {
        dupQuery = dupQuery.eq("academic_year_id", academicYearId);
      }
      const { data: existing } = await dupQuery.maybeSingle();

      if (existing) {
        return NextResponse.json(
          { error: `يوجد فوج بنفس الاسم "${groupName.trim()}" مسبقاً` },
          { status: 409 }
        );
      }

      const { data: newCohort, error } = await supabase
        .from("cohort_groups")
        .insert({
          specialty_id: specialtyId,
          academic_year_id: academicYearId ?? 1,
          group_name: groupName.trim(),
          sub_group: subGroup?.trim() ?? "",
        })
        .select()
        .single();

      if (error || !newCohort) {
        return NextResponse.json(
          { error: `فشل الإنشاء: ${error?.message ?? "خطأ غير معروف"}` },
          { status: 500 }
        );
      }

      // Map snake_case → camelCase for client
      return NextResponse.json({
        cohort: {
          id: newCohort.id,
          specialtyId: newCohort.specialty_id,
          academicYearId: newCohort.academic_year_id,
          groupName: newCohort.group_name,
          subGroup: newCohort.sub_group ?? "",
        },
      });
    }

    // Local
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
        academicYearId: academicYearId ?? 1,
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
