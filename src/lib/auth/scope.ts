/**
 * Scope resolution library — spec §6/§7/§8 (round 9)
 *
 * The academic hierarchy is a strict chain:
 *   Institution → Specialty → (Track) → Year → Group → SubGroup(cohort)
 *
 * Every supervisor's authority is a prefix of that chain, derived from their
 * role + scope fields:
 *   OWNER            → GLOBAL (everything)
 *   SPECIALTY_ADMIN  → their assigned specialty
 *   REPRESENTATIVE   → whichever scope field is most specific
 *                      (cohort > group > year > specialty > institution)
 *
 * All student-visibility, join-request routing, direct-assignment and
 * subordinate-supervisor decisions MUST go through this module — never
 * re-derived inside a route or a component.
 *
 * Subordination (spec §10–§12): a supervisor's subordinates are the
 * supervisory users whose scope is nested INSIDE theirs and whom they
 * outrank. This is scope-derived (no extra column, works on both
 * Prisma and Supabase without DDL).
 */
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/auth/types";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export type ScopeLevel =
  | "GLOBAL"
  | "INSTITUTION"
  | "SPECIALTY"
  | "YEAR"
  | "GROUP"
  | "SUBGROUP";

const ROLE_RANK: Record<UserRole, number> = {
  STUDENT: 0,
  REPRESENTATIVE: 1,
  SPECIALTY_ADMIN: 2,
  OWNER: 3,
};

/** A supervisor's effective scope, expressed as a chain prefix. */
export interface ScopeChain {
  institutionId: number | null;
  specialtyId: number | null;
  yearId: number | null;
  groupId: number | null;
  cohortId: number | null;
}

export interface ScopeContext {
  institutions: Map<number, string>;
  specialties: Map<number, { institutionId: number; nameAr: string }>;
  years: Map<number, string>;
  groups: Map<number, { specialtyId: number; yearId: number; trackId: number | null; nameAr: string }>;
  cohorts: Map<
    number,
    { specialtyId: number; yearId: number; groupId: number | null; trackId: number | null; nameAr: string }
  >;
}

export interface ScopedUserLike {
  id: number;
  role: UserRole;
  assignedSpecialtyId: number;
  scopeInstitutionId?: number | null;
  scopeSpecialtyId?: number | null;
  scopeAcademicYearId?: number | null;
  scopeGroupId?: number | null;
  scopeCohortGroupId?: number | null;
}

// =====================================================
// Context loading (reference data — small, cached per request)
// =====================================================
export async function loadScopeContext(): Promise<ScopeContext> {
  const ctx: ScopeContext = {
    institutions: new Map(),
    specialties: new Map(),
    years: new Map(),
    groups: new Map(),
    cohorts: new Map(),
  };
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const [insts, specs, yrs, grps, chs] = await Promise.all([
        supabase.from("institutions").select("id, name_ar"),
        supabase.from("specialties").select("id, institution_id, name_ar"),
        supabase.from("academic_years").select("id, year_name"),
        supabase.from("study_groups").select("id, specialty_id, academic_year_id, track_id, group_name"),
        supabase.from("cohort_groups").select("id, specialty_id, academic_year_id, group_id, track_id, group_name"),
      ]);
      (insts.data ?? []).forEach((r: Record<string, unknown>) =>
        ctx.institutions.set(Number(r.id), String(r.name_ar ?? "")));
      (specs.data ?? []).forEach((r: Record<string, unknown>) =>
        ctx.specialties.set(Number(r.id), {
          institutionId: Number(r.institution_id ?? 0),
          nameAr: String(r.name_ar ?? ""),
        }));
      (yrs.data ?? []).forEach((r: Record<string, unknown>) =>
        ctx.years.set(Number(r.id), String(r.year_name ?? "")));
      (grps.data ?? []).forEach((r: Record<string, unknown>) =>
        ctx.groups.set(Number(r.id), {
          specialtyId: Number(r.specialty_id ?? 0),
          yearId: Number(r.academic_year_id ?? 0),
          trackId: r.track_id != null ? Number(r.track_id) : null,
          nameAr: String(r.group_name ?? ""),
        }));
      (chs.data ?? []).forEach((r: Record<string, unknown>) =>
        ctx.cohorts.set(Number(r.id), {
          specialtyId: Number(r.specialty_id ?? 0),
          yearId: Number(r.academic_year_id ?? 0),
          groupId: r.group_id != null ? Number(r.group_id) : null,
          trackId: r.track_id != null ? Number(r.track_id) : null,
          nameAr: String(r.group_name ?? ""),
        }));
    } else {
      const [insts, specs, yrs, grps, chs] = await Promise.all([
        db.institution.findMany({ select: { id: true, nameAr: true } }),
        db.specialty.findMany({ select: { id: true, institutionId: true, nameAr: true } }),
        db.academicYear.findMany({ select: { id: true, yearName: true } }),
        db.studyGroup.findMany({ select: { id: true, specialtyId: true, academicYearId: true, trackId: true, groupName: true } }),
        db.cohortGroup.findMany({ select: { id: true, specialtyId: true, academicYearId: true, groupId: true, trackId: true, groupName: true } }),
      ]);
      insts.forEach((i) => ctx.institutions.set(i.id, i.nameAr));
      specs.forEach((s) => ctx.specialties.set(s.id, { institutionId: s.institutionId, nameAr: s.nameAr }));
      yrs.forEach((y) => ctx.years.set(y.id, y.yearName));
      grps.forEach((g) => ctx.groups.set(g.id, { specialtyId: g.specialtyId, yearId: g.academicYearId, trackId: g.trackId ?? null, nameAr: g.groupName }));
      chs.forEach((c) => ctx.cohorts.set(c.id, { specialtyId: c.specialtyId, yearId: c.academicYearId, groupId: c.groupId ?? null, trackId: c.trackId ?? null, nameAr: c.groupName }));
    }
  } catch {
    // degraded context → callers fall back to conservative behavior
  }
  return ctx;
}

// =====================================================
// Chain + level resolution
// =====================================================

/**
 * Derive the effective scope chain of a user. Missing upper levels are
 * filled from lower ones (a cohort implies its group, year, specialty,
 * institution) so containment tests always compare complete prefixes.
 */
export function scopeChainOf(user: ScopedUserLike, ctx: ScopeContext): ScopeChain {
  const cohortId = user.scopeCohortGroupId ?? null;
  const cohort = cohortId != null ? ctx.cohorts.get(cohortId) : undefined;
  const groupId = user.scopeGroupId ?? cohort?.groupId ?? null;
  const group = groupId != null ? ctx.groups.get(groupId) : undefined;
  const yearId = user.scopeAcademicYearId ?? group?.yearId ?? null;

  // Institution-level supervisor (spec §7.2): institution set, everything
  // below it deliberately empty.
  const institutionOnly =
    user.role === "REPRESENTATIVE" &&
    user.scopeInstitutionId != null &&
    user.scopeSpecialtyId == null &&
    user.scopeAcademicYearId == null &&
    user.scopeGroupId == null &&
    user.scopeCohortGroupId == null;

  const specialtyId = institutionOnly
    ? null
    : user.scopeSpecialtyId ?? user.assignedSpecialtyId;
  const institutionId =
    user.scopeInstitutionId ??
    (specialtyId != null ? ctx.specialties.get(specialtyId)?.institutionId ?? null : null);

  return { institutionId, specialtyId, yearId, groupId, cohortId };
}

/** Most specific scope level of a user (spec §7). */
export function resolveScopeLevel(user: ScopedUserLike, ctx: ScopeContext): ScopeLevel {
  if (user.role === "OWNER") return "GLOBAL";
  const chain = scopeChainOf(user, ctx);
  if (chain.cohortId != null) return "SUBGROUP";
  if (chain.groupId != null) return "GROUP";
  if (chain.yearId != null) return "YEAR";
  if (chain.specialtyId != null) return "SPECIALTY";
  if (chain.institutionId != null) return "INSTITUTION";
  return "SPECIALTY"; // unreachable in practice (assignedSpecialtyId always set)
}

/** Human-readable Arabic label of a supervisor's scope (for the tree UI). */
export function scopeLabel(user: ScopedUserLike, ctx: ScopeContext): string {
  const level = resolveScopeLevel(user, ctx);
  const chain = scopeChainOf(user, ctx);
  switch (level) {
    case "GLOBAL":
      return "مالك — وصول شامل";
    case "SUBGROUP":
      return `فوج: ${ctx.cohorts.get(chain.cohortId ?? 0)?.nameAr ?? `#${chain.cohortId}`}${
        chain.groupId != null ? ` (${ctx.groups.get(chain.groupId)?.nameAr ?? ""})` : ""
      }`;
    case "GROUP":
      return `مجموعة: ${ctx.groups.get(chain.groupId ?? 0)?.nameAr ?? `#${chain.groupId}`}${
        chain.yearId != null ? ` — ${ctx.years.get(chain.yearId) ?? ""}` : ""
      }`;
    case "YEAR":
      return `سنة: ${ctx.years.get(chain.yearId ?? 0) ?? `#${chain.yearId}`}${
        chain.specialtyId != null ? ` — ${ctx.specialties.get(chain.specialtyId)?.nameAr ?? ""}` : ""
      }`;
    case "SPECIALTY":
      return user.role === "SPECIALTY_ADMIN"
        ? `تخصص: ${ctx.specialties.get(chain.specialtyId ?? 0)?.nameAr ?? `#${chain.specialtyId}`}`
        : `تخصص: ${ctx.specialties.get(chain.specialtyId ?? 0)?.nameAr ?? `#${chain.specialtyId}`}`;
    case "INSTITUTION":
      return `مؤسسة: ${ctx.institutions.get(chain.institutionId ?? 0) ?? `#${chain.institutionId}`}`;
  }
}

// =====================================================
// Containment / subordination (spec §10–§12)
// =====================================================

/**
 * True if `ancestor`'s scope contains `descendant`'s scope AND ancestor
 * outranks descendant (same-rank users are peers, never subordinates).
 * OWNER contains everyone. Students are never contained.
 */
export function scopeContains(
  ancestor: ScopedUserLike,
  descendant: ScopedUserLike,
  ctx: ScopeContext
): boolean {
  if (ancestor.id === descendant.id) return false;
  if (ROLE_RANK[ancestor.role] <= ROLE_RANK[descendant.role]) return false;
  if (descendant.role === "OWNER") return false;
  if (ancestor.role === "OWNER") return true;

  const a = scopeChainOf(ancestor, ctx);
  const b = scopeChainOf(descendant, ctx);
  if (a.institutionId != null && a.institutionId !== b.institutionId) return false;
  if (a.specialtyId != null && a.specialtyId !== b.specialtyId) return false;
  if (a.yearId != null && a.yearId !== b.yearId) return false;
  if (a.groupId != null && a.groupId !== b.groupId) return false;
  if (a.cohortId != null && a.cohortId !== b.cohortId) return false;
  return true;
}

/** Direct subordinates of `user`: contained, and not contained in any other contained supervisor. */
export function directSubordinatesOf(
  user: ScopedUserLike,
  candidates: ScopedUserLike[],
  ctx: ScopeContext
): ScopedUserLike[] {
  const contained = candidates.filter((c) => scopeContains(user, c, ctx));
  return contained.filter((c) => {
    // c is a DIRECT child of user iff no other contained supervisor sits between
    return !contained.some((m) => m.id !== c.id && m.id !== user.id && scopeContains(m, c, ctx));
  });
}

// =====================================================
// Join-request routing (spec §8) — one record, routed by most
// specific matching scope; higher levels also see it.
// =====================================================

/** True if a request targeting `cohortId` is visible to this supervisor. */
export function requestVisibleTo(
  supervisor: ScopedUserLike,
  cohortId: number,
  ctx: ScopeContext
): boolean {
  if (supervisor.role === "OWNER") return true;
  const level = resolveScopeLevel(supervisor, ctx);
  const chain = scopeChainOf(supervisor, ctx);
  const cohort = ctx.cohorts.get(cohortId);
  if (!cohort) return false;
  switch (level) {
    case "SUBGROUP":
      return cohortId === chain.cohortId;
    case "GROUP":
      return cohort.groupId != null && cohort.groupId === chain.groupId;
    case "YEAR":
      return cohort.yearId === chain.yearId && cohort.specialtyId === chain.specialtyId;
    case "SPECIALTY":
      return cohort.specialtyId === chain.specialtyId;
    case "INSTITUTION": {
      const spec = ctx.specialties.get(cohort.specialtyId);
      return spec != null && spec.institutionId === chain.institutionId;
    }
    default:
      return false;
  }
}

// =====================================================
// Student visibility (spec §7)
// =====================================================

export interface StudentRowLike {
  id: number;
  role: UserRole;
  scopeInstitutionId: number | null;
  assignedSpecialtyId: number;
  scopeAcademicYearId: number | null;
  scopeCohortGroupId: number | null;
}

/**
 * Students visible to a supervisor per spec §7:
 *  OWNER        → everyone
 *  INSTITUTION  → students of that institution
 *  SPECIALTY    → students of that specialty
 *  YEAR         → students of that year (same specialty), assigned or not
 *  GROUP        → members of the group's sub-groups + unassigned students
 *                 of the same (specialty, year) — spec §7.3
 *  SUBGROUP     → ONLY members of that sub-group + students with a pending
 *                 request to it — spec §7.4
 */
export function studentVisibleTo(
  supervisor: ScopedUserLike,
  student: StudentRowLike,
  ctx: ScopeContext,
  pendingRequesterIds: Set<number> = new Set(),
  pendingByCohort: Map<number, number[]> = new Map()
): boolean {
  if (supervisor.role === "OWNER") return true;
  const level = resolveScopeLevel(supervisor, ctx);
  const chain = scopeChainOf(supervisor, ctx);

  switch (level) {
    case "INSTITUTION": {
      const specInst =
        ctx.specialties.get(student.assignedSpecialtyId)?.institutionId ?? null;
      return (
        student.scopeInstitutionId === chain.institutionId ||
        specInst === chain.institutionId
      );
    }
    case "SPECIALTY":
      return student.assignedSpecialtyId === chain.specialtyId;
    case "YEAR":
      return (
        student.scopeAcademicYearId === chain.yearId &&
        student.assignedSpecialtyId === chain.specialtyId
      );
    case "GROUP": {
      // members of the group's sub-groups
      const memberCohorts = studentCohortIdsInGroup(chain.groupId ?? -1, ctx);
      if (student.scopeCohortGroupId != null && memberCohorts.has(student.scopeCohortGroupId)) {
        return true;
      }
      // students with a pending request to one of the group's sub-groups
      if (student.id != null && pendingRequesterIds.has(student.id)) {
        for (const cid of memberCohorts) {
          if ((pendingByCohort.get(cid) ?? []).includes(student.id)) return true;
        }
      }
      // unassigned students of the same (specialty, year) as the group
      if (student.role === "STUDENT" && student.scopeCohortGroupId == null) {
        const group = ctx.groups.get(chain.groupId ?? -1);
        return (
          group != null &&
          student.assignedSpecialtyId === group.specialtyId &&
          student.scopeAcademicYearId === group.yearId
        );
      }
      return false;
    }
    case "SUBGROUP": {
      if (student.scopeCohortGroupId === chain.cohortId) return true; // directly assigned / accepted
      return pendingRequesterIds.has(student.id) &&
        (pendingByCohort.get(chain.cohortId ?? -1) ?? []).includes(student.id);
    }
    default:
      return false;
  }
}

function studentCohortIdsInGroup(groupId: number, ctx: ScopeContext): Set<number> {
  const ids = new Set<number>();
  for (const [id, c] of ctx.cohorts) {
    if (c.groupId === groupId) ids.add(id);
  }
  return ids;
}

// =====================================================
// Direct assignment scope (spec §4 — assign only within own scope)
// =====================================================

/** True if the supervisor may assign/transfer students INTO this cohort. */
export function cohortAssignableBy(
  supervisor: ScopedUserLike,
  cohortId: number,
  ctx: ScopeContext
): boolean {
  if (supervisor.role === "OWNER") return true;
  const level = resolveScopeLevel(supervisor, ctx);
  const chain = scopeChainOf(supervisor, ctx);
  const cohort = ctx.cohorts.get(cohortId);
  if (!cohort) return false;
  switch (level) {
    case "SUBGROUP":
      return cohortId === chain.cohortId;
    case "GROUP":
      return cohort.groupId != null && cohort.groupId === chain.groupId;
    case "YEAR":
      return cohort.yearId === chain.yearId && cohort.specialtyId === chain.specialtyId;
    case "SPECIALTY":
      return cohort.specialtyId === chain.specialtyId;
    case "INSTITUTION": {
      const spec = ctx.specialties.get(cohort.specialtyId);
      return spec != null && spec.institutionId === chain.institutionId;
    }
    default:
      return false;
  }
}

/** All cohort ids the supervisor may assign into (null = all/owner). */
export function assignableCohortIds(
  supervisor: ScopedUserLike,
  ctx: ScopeContext
): number[] {
  if (supervisor.role === "OWNER") return [...ctx.cohorts.keys()];
  return [...ctx.cohorts.keys()].filter((id) =>
    cohortAssignableBy(supervisor, id, ctx)
  );
}

// =====================================================
// Student ↔ cohort academic compatibility (system review §2)
// A student may only JOIN / BE ASSIGNED TO sub-groups that
// match their OWN academic identity:
//   institution + specialty + year (+ track when cohort
//   declares one). Single source of truth used by BOTH
//   join requests (Method A) and direct assignment
//   (Method B) — enforced at the data/API layer, never
//   merely hidden in the UI.
// =====================================================

export interface StudentAcademicLike {
  assignedSpecialtyId: number;
  scopeInstitutionId?: number | null;
  scopeAcademicYearId?: number | null;
  scopeTrackId?: number | null;
}

/**
 * True if `cohortId` matches the student's academic scope.
 * A student without a year (scopeAcademicYearId == null) matches
 * nothing — callers must surface a clear empty state for that case.
 */
export function cohortCompatibleWithStudent(
  student: StudentAcademicLike,
  cohortId: number,
  ctx: ScopeContext
): boolean {
  const cohort = ctx.cohorts.get(cohortId);
  if (!cohort) return false;
  if (cohort.specialtyId !== student.assignedSpecialtyId) return false;
  if (student.scopeAcademicYearId == null) return false;
  if (cohort.yearId !== student.scopeAcademicYearId) return false;
  // track compatibility: a cohort with no declared track is shared
  // by all tracks of the (specialty, year) — strict equality only
  // when the cohort declares a track.
  if (cohort.trackId != null && student.scopeTrackId != null && cohort.trackId !== student.scopeTrackId) {
    return false;
  }
  // institution: the cohort's specialty must belong to the student's
  // institution (when the student has one).
  if (student.scopeInstitutionId != null) {
    const spec = ctx.specialties.get(cohort.specialtyId);
    if (spec && spec.institutionId !== student.scopeInstitutionId) return false;
  }
  return true;
}

// =====================================================
// Pending-request index (needed for §7.4 student visibility)
// =====================================================
export interface PendingRequestIndex {
  /** cohortId → requester user ids with a pending request to it */
  byCohort: Map<number, number[]>;
  /** all users having any pending request */
  requesterIds: Set<number>;
}

export async function loadPendingRequestIndex(): Promise<PendingRequestIndex> {
  const idx: PendingRequestIndex = { byCohort: new Map(), requesterIds: new Set() };
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("join_requests")
        .select("requester_id, cohort_id")
        .eq("status", "pending");
      (data ?? []).forEach((r: Record<string, unknown>) => {
        const requesterId = Number(r.requester_id);
        const cohortId = Number(r.cohort_id);
        idx.requesterIds.add(requesterId);
        const arr = idx.byCohort.get(cohortId) ?? [];
        arr.push(requesterId);
        idx.byCohort.set(cohortId, arr);
      });
    } else {
      const rows = await db.joinRequest.findMany({
        where: { status: "pending" } as never,
        select: { requesterId: true, cohortId: true } as never,
      });
      (rows as unknown as Array<{ requesterId: number; cohortId: number }>).forEach((r) => {
        idx.requesterIds.add(Number(r.requesterId));
        const arr = idx.byCohort.get(Number(r.cohortId)) ?? [];
        arr.push(Number(r.requesterId));
        idx.byCohort.set(Number(r.cohortId), arr);
      });
    }
  } catch {
    // degraded → empty index
  }
  return idx;
}
