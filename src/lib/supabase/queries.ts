/**
 * Supabase client wrapper for server-side use.
 * Used as the primary data layer on Vercel (Prisma SQLite doesn't work serverless).
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getSupabase() {
  return await createSupabaseServerClient();
}

// =====================================================
// Replacements for Prisma queries (using Supabase REST API)
// =====================================================

export async function fetchInstitutions() {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("institutions")
    .select("*")
    .order("name_ar", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchSpecialties(institutionId: number) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("specialties")
    .select("*")
    .eq("institution_id", institutionId)
    .order("name_ar", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchAcademicYears(specialtyId: number) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("academic_years")
    .select("*")
    .eq("specialty_id", specialtyId)
    .order("id", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchCohorts(specialtyId: number, academicYearId?: number) {
  const supabase = await getSupabase();
  let query = supabase
    .from("cohort_groups")
    .select("*")
    .eq("specialty_id", specialtyId);
  if (academicYearId) {
    query = query.eq("academic_year_id", academicYearId);
  }
  const { data, error } = await query.order("id", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchAnnouncements(specialtyId: number) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .or(`specialty_id.is.null,specialty_id.eq.${specialtyId}`)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}
