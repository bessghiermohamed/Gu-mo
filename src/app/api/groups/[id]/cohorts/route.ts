import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/service";
import { fetchStudyGroupById, fetchCohortsByGroup } from "@/lib/data-layer";

/**
 * fix أ.3/أ.4 (round 3): previously this endpoint returned ALL cohorts of ANY
 * group with zero auth — students of other specialties could enumerate every
 * regiment by id. Now:
 *   - login required;
 *   - STUDENT: the group must belong to their own scope (specialty + year +
 *     track) and the returned cohorts are re-filtered by their year/track;
 *   - REPRESENTATIVE: group must be inside their specialty;
 *   - SPECIALTY_ADMIN: group must be inside their specialty;
 *   - OWNER: free access.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const groupId = parseInt(id);
    if (Number.isNaN(groupId)) return NextResponse.json({ cohorts: [] });

    const group = await fetchStudyGroupById(groupId);
    if (!group) return NextResponse.json({ cohorts: [] });

    if (user.role === "STUDENT") {
      if (user.scopeAcademicYearId == null) {
        return NextResponse.json({ cohorts: [], needsOnboarding: true });
      }
      const sameSpecialty = group.specialtyId === user.assignedSpecialtyId;
      const sameYear = group.academicYearId === user.scopeAcademicYearId;
      const trackOk =
        user.scopeTrackId == null ||
        group.trackId == null ||
        group.trackId === user.scopeTrackId;
      if (!sameSpecialty || !sameYear || !trackOk) {
        return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
      }
      const cohorts = await fetchCohortsByGroup(
        groupId,
        user.scopeAcademicYearId ?? undefined,
        user.scopeTrackId ?? undefined
      );
      return NextResponse.json({ cohorts });
    }

    if (user.role === "REPRESENTATIVE" || user.role === "SPECIALTY_ADMIN") {
      if (group.specialtyId !== user.assignedSpecialtyId) {
        return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
      }
    }

    const cohorts = await fetchCohortsByGroup(groupId);
    return NextResponse.json({ cohorts });
  } catch (e) {
    return NextResponse.json({ cohorts: [] });
  }
}
