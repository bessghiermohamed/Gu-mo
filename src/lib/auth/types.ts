// Re-export types for client components
export type UserRole = "STUDENT" | "REPRESENTATIVE" | "SPECIALTY_ADMIN" | "OWNER";

export interface SessionUser {
  id: number;
  fullName: string;
  email: string;
  studentId: string;
  role: UserRole;
  assignedSpecialtyId: number;
  scopeCohortGroupId: number | null;
  scopeAcademicYearId: number | null;
  scopeSpecialtyId: number | null;
}
