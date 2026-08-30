/**
 * Universal data layer.
 *
 * Returns data in CAMEL CASE format (matching what client components expect),
 * regardless of the underlying storage (Prisma SQLite locally / Supabase on Vercel).
 */

import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const isVercel = process.env.VERCEL === "1";

// =====================================================
// Type definitions (camelCase for client compatibility)
// =====================================================
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
  groupName: string;
  subGroup: string;
}

export interface AcademicTrack {
  id: number;
  specialtyId: number;
  trackNameAr: string;
  code: string;
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
    if (error) {
      console.error("[supabase] fetchInstitutions error:", error);
      return [];
    }
    return (data ?? []).map(mapInstitution);
  }
  const items = await db.institution.findMany({ orderBy: { nameAr: "asc" } });
  return items.map((i) => ({
    id: i.id,
    nameAr: i.nameAr,
    type: i.type,
    city: i.city,
  }));
}

// =====================================================
// Specialties
// =====================================================
export async function fetchSpecialties(institutionId: number): Promise<Specialty[]> {
  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("specialties")
      .select("*")
      .eq("institution_id", institutionId)
      .order("name_ar", { ascending: true });
    if (error) {
      console.error("[supabase] fetchSpecialties error:", error);
      return [];
    }
    return (data ?? []).map(mapSpecialty);
  }
  const items = await db.specialty.findMany({
    where: { institutionId },
    orderBy: { nameAr: "asc" },
  });
  return items.map((s) => ({
    id: s.id,
    institutionId: s.institutionId,
    nameAr: s.nameAr,
    code: s.code,
    iconName: s.iconName,
    description: s.description,
    institution: s.institution,
    faculty: s.faculty,
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
    if (error) {
      console.error("[supabase] fetchAcademicYears error:", error);
      return [];
    }
    return (data ?? []).map(mapAcademicYear);
  }
  const items = await db.academicYear.findMany({
    where: { specialtyId },
    orderBy: { id: "asc" },
  });
  return items.map((y) => ({
    id: y.id,
    specialtyId: y.specialtyId,
    yearName: y.yearName,
    semester: y.semester,
  }));
}

// =====================================================
// Cohorts (with optional trackId filter — matches new Android source)
// =====================================================
export async function fetchCohorts(
  specialtyId: number,
  academicYearId?: number,
  trackId?: number
): Promise<Cohort[]> {
  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("cohort_groups")
      .select("*")
      .eq("specialty_id", specialtyId);
    if (academicYearId) {
      query = query.eq("academic_year_id", academicYearId);
    }
    if (trackId) {
      query = query.eq("track_id", trackId);
    }
    const { data, error } = await query.order("id", { ascending: true });
    if (error) {
      console.error("[supabase] fetchCohorts error:", error);
      return [];
    }
    return (data ?? []).map(mapCohort);
  }
  const where: { specialtyId: number; academicYearId?: number; trackId?: number } = { specialtyId };
  if (academicYearId) where.academicYearId = academicYearId;
  if (trackId) where.trackId = trackId;
  const items = await db.cohortGroup.findMany({ where, orderBy: { id: "asc" } });
  return items.map((c) => ({
    id: c.id,
    specialtyId: c.specialtyId,
    academicYearId: c.academicYearId,
    trackId: c.trackId ?? null,
    groupName: c.groupName,
    subGroup: c.subGroup,
  }));
}

// =====================================================
// Academic Tracks (NEW from updated Android source)
// =====================================================
export async function fetchAcademicTracks(specialtyId: number): Promise<AcademicTrack[]> {
  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("academic_tracks")
      .select("*")
      .eq("specialty_id", specialtyId)
      .order("id", { ascending: true });
    if (error) {
      console.error("[supabase] fetchAcademicTracks error:", error);
      return [];
    }
    return (data ?? []).map(mapAcademicTrack);
  }
  const items = await db.academicTrack.findMany({
    where: { specialtyId },
    orderBy: { id: "asc" },
  });
  return items.map((t) => ({
    id: t.id,
    specialtyId: t.specialtyId,
    trackNameAr: t.trackNameAr,
    code: t.code,
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
    if (error) {
      console.error("[supabase] fetchAnnouncements error:", error);
      return [];
    }
    return (data ?? []).map(mapAnnouncement);
  }
  const items = await db.announcement.findMany({
    where: {
      OR: [{ specialtyId: null }, { specialtyId }],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return items.map((a) => ({
    id: a.id,
    title: a.title,
    content: a.content,
    author: a.author,
    date: a.date,
    urgency: a.urgency,
    specialtyId: a.specialtyId,
    isRead: a.isRead,
    visibilityScope: a.visibilityScope,
    targetGroups: a.targetGroups,
  }));
}

// =====================================================
// Supabase → CamelCase mappers
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
