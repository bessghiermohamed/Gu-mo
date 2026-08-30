/**
 * Profile Details API
 * - GET: returns the full academic profile of the current user, including
 *   joins for: institution, specialty, track, year, group, cohort.
 *   Combines AppUser + (StudentProfile locally) + scoped entities.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";

const isVercel = process.env.VERCEL === "1";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "غير مسجّل الدخول" }, { status: 401 });
  }

  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      // Fetch the user row with related entities (joins)
      const { data, error } = await supabase
        .from("app_users")
        .select(
          `
          id, full_name, email, student_id, role, specialty_name, year_name, group_number,
          assigned_specialty_id, scope_specialty_id, scope_academic_year_id,
          scope_cohort_group_id, scope_institution_id, representative_scope,
          specialties!app_users_assigned_specialty_id_fkey(
            id, name_ar, code, institution, faculty, institution_id
          ),
          cohort_groups!app_users_scope_cohort_group_id_fkey(
            id, group_name, sub_group, specialty_id, academic_year_id, track_id, group_id
          )
        `
        )
        .eq("id", user.id)
        .maybeSingle();
      if (error || !data) {
        return NextResponse.json(
          { error: "تعذّر جلب بيانات المستخدم" },
          { status: 500 }
        );
      }

      const specialty = (data.specialties as Record<string, unknown> | null) ?? null;
      const cohort = (data.cohort_groups as Record<string, unknown> | null) ?? null;

      // Fetch year (if scoped)
      let year: Record<string, unknown> | null = null;
      if (data.scope_academic_year_id) {
        const { data: yearRow } = await supabase
          .from("academic_years")
          .select("id, year_name, semester, specialty_id")
          .eq("id", data.scope_academic_year_id)
          .maybeSingle();
        year = yearRow as Record<string, unknown> | null;
      }

      // Fetch track (if cohort has track_id)
      let track: Record<string, unknown> | null = null;
      const cohortTrackId = cohort?.track_id;
      if (cohortTrackId) {
        const { data: trackRow } = await supabase
          .from("academic_tracks")
          .select("id, track_name_ar, code, specialty_id")
          .eq("id", cohortTrackId)
          .maybeSingle();
        track = trackRow as Record<string, unknown> | null;
      }

      // Fetch study group (if cohort has group_id)
      let group: Record<string, unknown> | null = null;
      const cohortGroupId = cohort?.group_id;
      if (cohortGroupId) {
        const { data: groupRow } = await supabase
          .from("study_groups")
          .select("id, group_name, description, specialty_id, academic_year_id, track_id")
          .eq("id", cohortGroupId)
          .maybeSingle();
        group = groupRow as Record<string, unknown> | null;
      }

      // Fetch institution (via specialty)
      let institution: Record<string, unknown> | null = null;
      const institutionId = specialty?.institution_id;
      if (institutionId) {
        const { data: instRow } = await supabase
          .from("institutions")
          .select("id, name_ar, type, city")
          .eq("id", institutionId)
          .maybeSingle();
        institution = instRow as Record<string, unknown> | null;
      }

      return NextResponse.json({
        profile: {
          user: {
            id: Number(data.id),
            fullName: String(data.full_name ?? ""),
            email: String(data.email ?? ""),
            studentId: String(data.student_id ?? ""),
            role: String(data.role ?? "STUDENT"),
            specialtyName: String(data.specialty_name ?? ""),
            yearName: String(data.year_name ?? ""),
            groupNumber: String(data.group_number ?? ""),
            assignedSpecialtyId: Number(data.assigned_specialty_id ?? 1),
            scopeSpecialtyId: data.scope_specialty_id
              ? Number(data.scope_specialty_id)
              : null,
            scopeAcademicYearId: data.scope_academic_year_id
              ? Number(data.scope_academic_year_id)
              : null,
            scopeCohortGroupId: data.scope_cohort_group_id
              ? Number(data.scope_cohort_group_id)
              : null,
            scopeInstitutionId: data.scope_institution_id
              ? Number(data.scope_institution_id)
              : null,
            representativeScope: String(data.representative_scope ?? "فوج واحد"),
          },
          institution: institution
            ? {
                id: Number(institution.id),
                nameAr: String(institution.name_ar ?? ""),
                type: String(institution.type ?? ""),
                city: String(institution.city ?? ""),
              }
            : null,
          specialty: specialty
            ? {
                id: Number(specialty.id),
                nameAr: String(specialty.name_ar ?? ""),
                code: String(specialty.code ?? ""),
                institution: String(specialty.institution ?? ""),
                faculty: String(specialty.faculty ?? ""),
                institutionId: Number(specialty.institution_id ?? 0),
              }
            : null,
          track: track
            ? {
                id: Number(track.id),
                trackNameAr: String(track.track_name_ar ?? ""),
                code: String(track.code ?? ""),
                specialtyId: Number(track.specialty_id ?? 0),
              }
            : null,
          year: year
            ? {
                id: Number(year.id),
                yearName: String(year.year_name ?? ""),
                semester: Number(year.semester ?? 1),
                specialtyId: Number(year.specialty_id ?? 0),
              }
            : null,
          group: group
            ? {
                id: Number(group.id),
                groupName: String(group.group_name ?? ""),
                description: String(group.description ?? ""),
                specialtyId: Number(group.specialty_id ?? 0),
                academicYearId: Number(group.academic_year_id ?? 0),
                trackId: group.track_id ? Number(group.track_id) : null,
              }
            : null,
          cohort: cohort
            ? {
                id: Number(cohort.id),
                groupName: String(cohort.group_name ?? ""),
                subGroup: String(cohort.sub_group ?? ""),
                specialtyId: Number(cohort.specialty_id ?? 0),
                academicYearId: Number(cohort.academic_year_id ?? 0),
                trackId: cohort.track_id ? Number(cohort.track_id) : null,
                groupId: cohort.group_id ? Number(cohort.group_id) : null,
              }
            : null,
        },
      });
    }

    // Prisma local path: pull user + scoped entities in parallel
    const appUser = await db.appUser.findUnique({
      where: { id: user.id },
      include: {
        specialty: true,
        cohortGroup: true,
      },
    });
    if (!appUser) {
      return NextResponse.json(
        { error: "تعذّر جلب بيانات المستخدم" },
        { status: 404 }
      );
    }

    const [year, studentProfile] = await Promise.all([
      appUser.scopeAcademicYearId
        ? db.academicYear.findUnique({
            where: { id: appUser.scopeAcademicYearId },
          })
        : Promise.resolve(null),
      db.studentProfile.findUnique({ where: { id: 1 } }),
    ]);

    let track: Record<string, unknown> | null = null;
    let group: Record<string, unknown> | null = null;
    let institution: Record<string, unknown> | null = null;

    if (appUser.specialty?.institutionId) {
      const inst = await db.institution.findUnique({
        where: { id: appUser.specialty.institutionId },
      });
      institution = inst
        ? {
            id: inst.id,
            nameAr: inst.nameAr,
            type: inst.type,
            city: inst.city,
          }
        : null;
    }

    return NextResponse.json({
      profile: {
        user: {
          id: appUser.id,
          fullName: appUser.fullName,
          email: appUser.email,
          studentId: appUser.studentId,
          role: appUser.role,
          specialtyName: appUser.specialtyName,
          yearName: appUser.yearName,
          groupNumber: appUser.groupNumber,
          assignedSpecialtyId: appUser.assignedSpecialtyId,
          scopeSpecialtyId: appUser.scopeSpecialtyId ?? null,
          scopeAcademicYearId: appUser.scopeAcademicYearId ?? null,
          scopeCohortGroupId: appUser.scopeCohortGroupId ?? null,
          scopeInstitutionId: appUser.scopeInstitutionId ?? null,
          representativeScope: appUser.representativeScope,
        },
        institution,
        specialty: appUser.specialty
          ? {
              id: appUser.specialty.id,
              nameAr: appUser.specialty.nameAr,
              code: appUser.specialty.code,
              institution: appUser.specialty.institution,
              faculty: appUser.specialty.faculty,
              institutionId: appUser.specialty.institutionId,
            }
          : null,
        track,
        year: year
          ? {
              id: year.id,
              yearName: year.yearName,
              semester: year.semester,
              specialtyId: year.specialtyId,
            }
          : null,
        group,
        cohort: appUser.cohortGroup
          ? {
              id: appUser.cohortGroup.id,
              groupName: appUser.cohortGroup.groupName,
              subGroup: appUser.cohortGroup.subGroup,
              specialtyId: appUser.cohortGroup.specialtyId,
              academicYearId: appUser.cohortGroup.academicYearId,
              trackId: null,
              groupId: null,
            }
          : null,
        studentProfile: studentProfile
          ? {
              scheduleImageMode: studentProfile.scheduleImageMode,
              scheduleImagePath: studentProfile.scheduleImagePath,
              profileTrack: studentProfile.profileTrack,
              isConfigured: studentProfile.isConfigured,
              themePalette: studentProfile.themePalette,
            }
          : null,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: `خطأ داخلي: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
