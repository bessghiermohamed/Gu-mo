/**
 * Central Authorization Layer for Talib (fix A.1)
 *
 * RULE: Every privileged action must call one of these helpers.
 *       No UI component should compute role permissions itself.
 *
 * The 4-role hierarchy:
 *   STUDENT  → can read content scoped to their cohort
 *   REPRESENTATIVE → can manage content scoped to their cohort
 *   SPECIALTY_ADMIN → can manage content scoped to their specialty
 *   OWNER → can manage everything, including dev settings (fix A.6)
 *
 * Promoting a user requires:
 *   - caller must outrank the target
 *   - target's new scope must be within caller's scope
 *   - if caller is REPRESENTATIVE, target must be STUDENT only
 */

export type UserRole = "STUDENT" | "REPRESENTATIVE" | "SPECIALTY_ADMIN" | "OWNER";

export interface AuthUser {
  id: number;
  role: UserRole;
  assignedSpecialtyId: number;
  scopeCohortGroupId?: number | null;
  scopeAcademicYearId?: number | null;
  scopeSpecialtyId?: number | null;
  scopeInstitutionId?: number | null;
}

const ROLE_RANK: Record<UserRole, number> = {
  STUDENT: 0,
  REPRESENTATIVE: 1,
  SPECIALTY_ADMIN: 2,
  OWNER: 3,
};

/**
 * Returns true if the caller has a supervisory scope (can manage roles).
 * fix A.1: students with no scope CANNOT see promote buttons.
 */
export function canManageRoles(caller: AuthUser | null): boolean {
  if (!caller) return false;
  if (caller.role === "OWNER") return true;
  if (caller.role === "SPECIALTY_ADMIN") return true;
  if (caller.role === "REPRESENTATIVE") {
    // Must have at least one scope field set
    return (
      caller.scopeCohortGroupId != null ||
      caller.scopeAcademicYearId != null ||
      caller.scopeSpecialtyId != null
    );
  }
  return false;
}

/**
 * Returns true if the caller can promote the target to the new role.
 */
export function canPromoteTo(
  caller: AuthUser | null,
  target: AuthUser | null,
  newRole: UserRole
): boolean {
  if (!caller || !target) return false;
  if (caller.role === "STUDENT") return false;

  // Caller must outrank target's current role
  if (ROLE_RANK[caller.role] <= ROLE_RANK[target.role]) return false;

  // Caller must outrank the new role
  if (ROLE_RANK[caller.role] <= ROLE_RANK[newRole]) return false;

  // Representatives can only promote STUDENTs
  if (caller.role === "REPRESENTATIVE" && newRole !== "STUDENT") return false;

  // Scope checks
  if (caller.role === "SPECIALTY_ADMIN") {
    if (target.assignedSpecialtyId !== caller.assignedSpecialtyId) return false;
  }

  if (caller.role === "REPRESENTATIVE") {
    if (target.scopeCohortGroupId !== caller.scopeCohortGroupId) return false;
  }

  return true;
}

/**
 * Returns true if the caller can manage content within a given scope.
 */
export function canManageContentInScope(
  caller: AuthUser | null,
  scope: {
    specialtyId?: number;
    academicYearId?: number;
    cohortId?: number;
  }
): boolean {
  if (!caller) return false;
  if (caller.role === "OWNER") return true;

  if (caller.role === "SPECIALTY_ADMIN") {
    return (
      scope.specialtyId === caller.assignedSpecialtyId
    );
  }

  if (caller.role === "REPRESENTATIVE") {
    return (
      scope.cohortId === caller.scopeCohortGroupId ||
      scope.cohortId == null
    );
  }

  return false;
}

/**
 * Returns true if the caller can access developer settings (fix A.6).
 */
export function canAccessDevSettings(caller: AuthUser | null): boolean {
  return caller?.role === "OWNER";
}

/**
 * Returns true if the caller can create new cohorts (fix A.2).
 */
export function canCreateCohorts(caller: AuthUser | null): boolean {
  if (!caller) return false;
  return (
    caller.role === "OWNER" ||
    caller.role === "SPECIALTY_ADMIN" ||
    caller.role === "REPRESENTATIVE"
  );
}

/**
 * Returns true if the caller can create new modules/courses (fix B.7).
 */
export function canCreateModules(caller: AuthUser | null): boolean {
  if (!caller) return false;
  return (
    caller.role === "OWNER" ||
    caller.role === "SPECIALTY_ADMIN"
  );
}

/**
 * Returns true if the caller can upload content of any type (fix A.3).
 */
export function canUploadContent(caller: AuthUser | null): boolean {
  return canManageRoles(caller);
}

/**
 * Returns true if the caller can manage the schedule (manual entries or upload image).
 */
export function canManageSchedule(caller: AuthUser | null): boolean {
  return canManageRoles(caller);
}

/**
 * Helper: get the role rank for sorting.
 */
export function getRoleRank(role: UserRole): number {
  return ROLE_RANK[role];
}
