/**
 * Universal data layer.
 *
 * On local development: uses Prisma + SQLite.
 * On Vercel production: uses Supabase REST API directly.
 *
 * This abstraction allows the same codebase to work in both environments
 * without requiring the user to manually set up Supabase SQL schema.
 */

import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const isVercel = process.env.VERCEL === "1";

// =====================================================
// Institutions
// =====================================================
export async function fetchInstitutions() {
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
    return data ?? [];
  }
  return db.institution.findMany({ orderBy: { nameAr: "asc" } });
}

// =====================================================
// Specialties
// =====================================================
export async function fetchSpecialties(institutionId: number) {
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
    return data ?? [];
  }
  return db.specialty.findMany({
    where: { institutionId },
    orderBy: { nameAr: "asc" },
  });
}

// =====================================================
// Academic Years
// =====================================================
export async function fetchAcademicYears(specialtyId: number) {
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
    return data ?? [];
  }
  return db.academicYear.findMany({
    where: { specialtyId },
    orderBy: { id: "asc" },
  });
}

// =====================================================
// Cohorts
// =====================================================
export async function fetchCohorts(
  specialtyId: number,
  academicYearId?: number
) {
  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("cohort_groups")
      .select("*")
      .eq("specialty_id", specialtyId);
    if (academicYearId) {
      query = query.eq("academic_year_id", academicYearId);
    }
    const { data, error } = await query.order("id", { ascending: true });
    if (error) {
      console.error("[supabase] fetchCohorts error:", error);
      return [];
    }
    return data ?? [];
  }
  const where: { specialtyId: number; academicYearId?: number } = { specialtyId };
  if (academicYearId) where.academicYearId = academicYearId;
  return db.cohortGroup.findMany({ where, orderBy: { id: "asc" } });
}

// =====================================================
// Announcements
// =====================================================
export async function fetchAnnouncements(specialtyId: number) {
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
    return data ?? [];
  }
  return db.announcement.findMany({
    where: {
      OR: [{ specialtyId: null }, { specialtyId }],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
