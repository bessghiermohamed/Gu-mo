/**
 * Universal data layer.
 * Returns data in CAMEL CASE format (matching what client components expect),
 * regardless of the underlying storage (Prisma SQLite locally / Supabase on Vercel).
 */
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export interface Institution {
  id: number;
  nameAr: string;
  type: string;
  city: string;
}

export interface Specialty {
  id: number;
  institutionId: number;
  nameAr: string;
  code: string;
  iconName: string;
  description: string;
  institution: string;
  faculty: string;
}

export interface AcademicYear {
  id: number;
  specialtyId: number;
  yearName: string;
  semester: number;
}

export interface Cohort {
  id: number;
  specialtyId: number;
  academicYearId: number;
  trackId: number | null;
  groupId: number | null;
  groupName: string;
  subGroup: string;
}

export interface AcademicTrack {
  id: number;
  specialtyId: number;
  trackNameAr: string;
  code: string;
}

export interface StudyGroup {
  id: number;
  specialtyId: number;
  academicYearId: number;
  trackId: number | null;
  groupName: string;
  description: string;
}

export interface Announcement {
  id: number;
  title: string;
  content: string;
  author: string;
  date: string;
  urgency: string;
  specialtyId: number | null;
  isRead: boolean;
  visibilityScope: string;
  targetGroups: string;
}

export interface JoinRequest {
  id: number;
  requesterId: number;
  requesterName: string;
  cohortId: number;
  cohortName: string;
  groupId: number | null;
  status: "pending" | "approved" | "rejected";
  message: string;
  reviewerNote: string;
  createdAt: string;
  reviewedAt: string | null;
}

// =====================================================
// Mappers (snake_case → camelCase)
// =====================================================
function mapInstitution(row: Record<string, unknown>): Institution {
  return {
    id: Number(row.id),
    nameAr: String(row.name_ar ?? ""),
    type: String(row.type ?? ""),
    city: String(row.city ?? ""),
  };
}

function mapSpecialty(row: Record<string, unknown>): Specialty {
  return {
    id: Number(row.id),
    institutionId: Number(row.institution_id ?? 0),
    nameAr: String(row.name_ar ?? ""),
    code: String(row.code ?? ""),
    iconName: String(row.icon_name ?? "book"),
    description: String(row.description ?? ""),
    institution: String(row.institution ?? ""),
    faculty: String(row.faculty ?? ""),
  };
}

function mapAcademicYear(row: Record<string, unknown>): AcademicYear {
  return {
    id: Number(row.id),
    specialtyId: Number(row.specialty_id ?? 0),
    yearName: String(row.year_name ?? ""),
    semester: Number(row.semester ?? 1),
  };
}

function mapCohort(row: Record<string, unknown>): Cohort {
  return {
    id: Number(row.id),
    specialtyId: Number(row.specialty_id ?? 0),
    academicYearId: Number(row.academic_year_id ?? 0),
    trackId: row.track_id ? Number(row.track_id) : null,
    groupId: row.group_id ? Number(row.group_id) : null,
    groupName: String(row.group_name ?? ""),
    subGroup: String(row.sub_group ?? ""),
  };
}

function mapAcademicTrack(row: Record<string, unknown>): AcademicTrack {
  return {
    id: Number(row.id),
    specialtyId: Number(row.specialty_id ?? 0),
    trackNameAr: String(row.track_name_ar ?? ""),
    code: String(row.code ?? ""),
  };
}

function mapStudyGroup(row: Record<string, unknown>): StudyGroup {
  return {
    id: Number(row.id),
    specialtyId: Number(row.specialty_id ?? 0),
    academicYearId: Number(row.academic_year_id ?? 0),
    trackId: row.track_id ? Number(row.track_id) : null,
    groupName: String(row.group_name ?? ""),
    description: String(row.description ?? ""),
  };
}

function mapAnnouncement(row: Record<string, unknown>): Announcement {
  return {
    id: Number(row.id),
    title: String(row.title ?? ""),
    content: String(row.content ?? ""),
    author: String(row.author ?? ""),
    date: String(row.date ?? ""),
    urgency: String(row.urgency ?? "عام"),
    specialtyId: row.specialty_id ? Number(row.specialty_id) : null,
    isRead: Boolean(row.is_read ?? false),
    visibilityScope: String(row.visibility_scope ?? "تخصص كامل"),
    targetGroups: String(row.target_groups ?? "الكل"),
  };
}

function mapJoinRequest(row: Record<string, unknown>): JoinRequest {
  return {
    id: Number(row.id),
    requesterId: Number(row.requester_id ?? 0),
    requesterName: String(row.requester_name ?? ""),
    cohortId: Number(row.cohort_id ?? 0),
    cohortName: String(row.cohort_name ?? ""),
    groupId: row.group_id ? Number(row.group_id) : null,
    status: String(row.status ?? "pending") as JoinRequest["status"],
    message: String(row.message ?? ""),
    reviewerNote: String(row.reviewer_note ?? ""),
    createdAt: String(row.created_at ?? ""),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
  };
}

// =====================================================
// Institutions
// =====================================================
export async function fetchInstitutions(): Promise<Institution[]> {
  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("institutions")
      .select("*")
      .order("name_ar", { ascending: true });
    if (error) return [];
    return (data ?? []).map(mapInstitution);
  }
  const items = await db.institution.findMany({ orderBy: { nameAr: "asc" } });
  return items.map((i) => ({ id: i.id, nameAr: i.nameAr, type: i.type, city: i.city }));
}

// =====================================================
// Specialties
// =====================================================
export async function fetchSpecialties(institutionId?: number): Promise<Specialty[]> {
  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    let query = supabase.from("specialties").select("*");
    if (institutionId) {
      query = query.eq("institution_id", institutionId);
    }
    const { data, error } = await query.order("name_ar", { ascending: true });
    if (error) return [];
    return (data ?? []).map(mapSpecialty);
  }
  const where = institutionId ? { institutionId } : {};
  const items = await db.specialty.findMany({ where, orderBy: { nameAr: "asc" } });
  return items.map((s) => ({
    id: s.id, institutionId: s.institutionId, nameAr: s.nameAr, code: s.code,
    iconName: s.iconName, description: s.description, institution: s.institution, faculty: s.faculty,
  }));
}

// =====================================================
// Academic Years
// =====================================================
export async function fetchAcademicYears(specialtyId: number): Promise<AcademicYear[]> {
  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("academic_years")
      .select("*")
      .eq("specialty_id", specialtyId)
      .order("id", { ascending: true });
    if (error) return [];
    return (data ?? []).map(mapAcademicYear);
  }
  const items = await db.academicYear.findMany({ where: { specialtyId }, orderBy: { id: "asc" } });
  return items.map((y) => ({
    id: y.id, specialtyId: y.specialtyId, yearName: y.yearName, semester: y.semester,
  }));
}

// =====================================================
// Cohorts
// =====================================================
export async function fetchCohorts(
  specialtyId: number,
  academicYearId?: number,
  trackId?: number
): Promise<Cohort[]> {
  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    let query = supabase.from("cohort_groups").select("*").eq("specialty_id", specialtyId);
    if (academicYearId) query = query.eq("academic_year_id", academicYearId);
    if (trackId) query = query.eq("track_id", trackId);
    const { data, error } = await query.order("id", { ascending: true });
    if (error) return [];
    return (data ?? []).map(mapCohort);
  }
  const where: Record<string, unknown> = { specialtyId };
  if (academicYearId) where.academicYearId = academicYearId;
  if (trackId) where.trackId = trackId;
  const items = await db.cohortGroup.findMany({ where: where as never, orderBy: { id: "asc" } });
  return items.map((c) => ({
    id: c.id, specialtyId: c.specialtyId, academicYearId: c.academicYearId,
    trackId: c.trackId ?? null, groupId: c.groupId ?? null,
    groupName: c.groupName, subGroup: c.subGroup,
  }));
}

// =====================================================
// Academic Tracks
// =====================================================
export async function fetchAcademicTracks(specialtyId: number): Promise<AcademicTrack[]> {
  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("academic_tracks")
      .select("*")
      .eq("specialty_id", specialtyId)
      .order("id", { ascending: true });
    if (error) return [];
    return (data ?? []).map(mapAcademicTrack);
  }
  const items = await db.academicTrack.findMany({ where: { specialtyId }, orderBy: { id: "asc" } });
  return items.map((t) => ({
    id: t.id, specialtyId: t.specialtyId,
    trackNameAr: t.trackNameAr, code: t.code,
  }));
}

// =====================================================
// Study Groups
// =====================================================
export async function fetchStudyGroups(
  specialtyId: number,
  academicYearId?: number,
  trackId?: number
): Promise<StudyGroup[]> {
  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    let query = supabase.from("study_groups").select("*").eq("specialty_id", specialtyId);
    if (academicYearId) query = query.eq("academic_year_id", academicYearId);
    if (trackId) query = query.eq("track_id", trackId);
    const { data, error } = await query.order("id", { ascending: true });
    if (error) return [];
    return (data ?? []).map(mapStudyGroup);
  }
  const where: Record<string, unknown> = { specialtyId };
  if (academicYearId) where.academicYearId = academicYearId;
  if (trackId) where.trackId = trackId;
  const items = await db.studyGroup.findMany({ where: where as never, orderBy: { id: "asc" } });
  return items.map((g) => ({
    id: g.id, specialtyId: g.specialtyId, academicYearId: g.academicYearId,
    trackId: g.trackId ?? null, groupName: g.groupName, description: g.description,
  }));
}

// =====================================================
// Cohorts by Group
// =====================================================
export async function fetchCohortsByGroup(groupId: number): Promise<Cohort[]> {
  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("cohort_groups")
      .select("*")
      .eq("group_id", groupId)
      .order("id", { ascending: true });
    if (error) return [];
    return (data ?? []).map(mapCohort);
  }
  const items = await db.cohortGroup.findMany({ where: { groupId } as never, orderBy: { id: "asc" } });
  return items.map((c) => ({
    id: c.id, specialtyId: c.specialtyId, academicYearId: c.academicYearId,
    trackId: c.trackId ?? null, groupId: c.groupId ?? null,
    groupName: c.groupName, subGroup: c.subGroup,
  }));
}

// =====================================================
// Announcements
// =====================================================
export async function fetchAnnouncements(specialtyId: number): Promise<Announcement[]> {
  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .or(`specialty_id.is.null,specialty_id.eq.${specialtyId}`)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return [];
    return (data ?? []).map(mapAnnouncement);
  }
  const items = await db.announcement.findMany({
    where: { OR: [{ specialtyId: null }, { specialtyId }] },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return items.map((a) => ({
    id: a.id, title: a.title, content: a.content, author: a.author, date: a.date,
    urgency: a.urgency, specialtyId: a.specialtyId, isRead: a.isRead,
    visibilityScope: a.visibilityScope, targetGroups: a.targetGroups,
  }));
}

// =====================================================
// Join Requests (pending, scoped to reviewer)
// =====================================================
export async function fetchPendingJoinRequests(
  reviewerId: number,
  reviewerRole: string,
  scopeCohortId?: number | null,
  scopeGroupId?: number | null,
  scopeYearId?: number | null,
  specialtyId?: number
): Promise<JoinRequest[]> {
  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("join_requests")
      .select(`
        id, requester_id, cohort_id, group_id, status, message, reviewer_note, created_at, reviewed_at,
        app_users!join_requests_requester_id_fkey(full_name),
        cohort_groups!join_requests_cohort_id_fkey(group_name)
      `)
      .eq("status", "pending");
    if (reviewerRole === "REPRESENTATIVE") {
      if (scopeCohortId) query = query.eq("cohort_id", scopeCohortId);
      else if (scopeGroupId) query = query.eq("group_id", scopeGroupId);
    }
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) return [];
    return (data ?? []).map((r: Record<string, unknown>) => {
      const requester = r.app_users as Record<string, unknown>;
      const cohort = r.cohort_groups as Record<string, unknown>;
      return mapJoinRequest({
        ...r,
        requester_name: requester?.full_name ?? "",
        cohort_name: cohort?.group_name ?? "",
      });
    });
  }
  const where: Record<string, unknown> = { status: "pending" };
  if (specialtyId) where.cohort = { specialtyId };
  const items = await db.joinRequest.findMany({
    where: where as never,
    include: { requester: { select: { fullName: true } }, cohort: { select: { groupName: true } } },
    orderBy: { createdAt: "desc" },
  });
  return items.map((r) => ({
    id: r.id, requesterId: r.requesterId, requesterName: r.requester?.fullName ?? "",
    cohortId: r.cohortId, cohortName: r.cohort?.groupName ?? "",
    groupId: r.groupId ?? null, status: r.status as JoinRequest["status"], message: r.message,
    reviewerNote: r.reviewerNote, createdAt: r.createdAt?.toISOString?.() ?? "",
    reviewedAt: r.reviewedAt?.toISOString?.() ?? null,
  }));
}
