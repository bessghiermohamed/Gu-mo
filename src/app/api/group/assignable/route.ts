import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canManageRoles } from "@/lib/auth/permissions";
import {
  loadScopeContext,
  assignableCohortIds,
  cohortCompatibleWithStudent,
  type StudentAcademicLike,
} from "@/lib/auth/scope";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

/**
 * Cohorts the CALLER may assign/transfer students into (spec §4: "a
 * sub-group within the representative's scope"). Used by the direct-
 * assignment dialog to list destination sub-groups only.
 *
 * System review §2 — when `?studentId=N` is given, the list is
 * additionally filtered to the STUDENT's own academic scope
 * (institution → specialty → track → year), intersected with the
 * caller's authority. A Year-1 English-Literature student will only
 * ever be offered the sub-groups of Year 1 English Literature —
 * other specializations/years are excluded at the API level, not
 * merely hidden in the UI.
 *
 * Response rows carry the parent group + year + specialty labels so the
 * UI can show "الفوج 02 — المجموعة 01 — السنة الثانية" without extra calls.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canManageRoles(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const studentId = Number(new URL(req.url).searchParams.get("studentId")) || null;
    const ctx = await loadScopeContext();
    let ids = assignableCohortIds(user, ctx);

    if (studentId != null) {
      // load the target student's academic identity (both branches)
      let student: (StudentAcademicLike & { role: string }) | null = null;
      if (isVercel) {
        const supabase = await createSupabaseServerClient();
        const { data: row, error } = await supabase
          .from("app_users")
          .select("role, assigned_specialty_id, scope_institution_id, scope_academic_year_id, scope_track_id")
          .eq("id", studentId)
          .maybeSingle();
        if (error || !row) {
          return NextResponse.json({ error: "الطالب غير موجود" }, { status: 404 });
        }
        student = {
          role: String(row.role ?? "STUDENT"),
          assignedSpecialtyId: Number(row.assigned_specialty_id ?? 1),
          scopeInstitutionId: row.scope_institution_id != null ? Number(row.scope_institution_id) : null,
          scopeAcademicYearId: row.scope_academic_year_id != null ? Number(row.scope_academic_year_id) : null,
          scopeTrackId: row.scope_track_id != null ? Number(row.scope_track_id) : null,
        };
      } else {
        const row = await db.appUser.findUnique({ where: { id: studentId } });
        if (!row) {
          return NextResponse.json({ error: "الطالب غير موجود" }, { status: 404 });
        }
        student = {
          role: row.role,
          assignedSpecialtyId: row.assignedSpecialtyId,
          scopeInstitutionId: row.scopeInstitutionId ?? null,
          scopeAcademicYearId: row.scopeAcademicYearId ?? null,
          scopeTrackId: row.scopeTrackId ?? null,
        };
      }
      if (student.role !== "STUDENT") {
        return NextResponse.json(
          { error: "الإلحاق المباشر يخص الطلاب فقط" },
          { status: 400 }
        );
      }
      ids = ids.filter((id) => cohortCompatibleWithStudent(student!, id, ctx));
    }

    const cohorts = ids.map((id) => {
      const c = ctx.cohorts.get(id)!;
      return {
        id,
        nameAr: c.nameAr,
        groupId: c.groupId,
        groupName: c.groupId != null ? ctx.groups.get(c.groupId)?.nameAr ?? "" : "",
        yearId: c.yearId,
        yearName: ctx.years.get(c.yearId) ?? "",
        specialtyId: c.specialtyId,
        specialtyName: ctx.specialties.get(c.specialtyId)?.nameAr ?? "",
        trackId: c.trackId,
      };
    });
    return NextResponse.json({ cohorts });
  } catch {
    return NextResponse.json({ cohorts: [] });
  }
}
