import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";

const isVercel = process.env.VERCEL === "1";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ profile: null });
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const [inst, spec, track, year, group, cohort] = await Promise.all([
        supabase.from("institutions").select("name_ar").eq("id", user.scopeInstitutionId ?? 1).maybeSingle(),
        supabase.from("specialties").select("name_ar").eq("id", user.assignedSpecialtyId).maybeSingle(),
        supabase.from("academic_tracks").select("track_name_ar").eq("id", user.scopeTrackId ?? 0).maybeSingle(),
        supabase.from("academic_years").select("year_name").eq("id", user.scopeAcademicYearId ?? 0).maybeSingle(),
        supabase.from("study_groups").select("group_name").eq("id", user.scopeGroupId ?? 0).maybeSingle(),
        supabase.from("cohort_groups").select("group_name").eq("id", user.scopeCohortGroupId ?? 0).maybeSingle(),
      ]);
      return NextResponse.json({
        profile: {
          institution: inst.data?.name_ar ?? "",
          specialtyName: spec.data?.name_ar ?? "",
          trackName: track.data?.track_name_ar ?? "",
          yearName: year.data?.year_name ?? "",
          groupName: group.data?.group_name ?? "",
          cohortName: cohort.data?.group_name ?? "",
        },
      });
    }
    const institution = await db.institution.findUnique({ where: { id: user.scopeInstitutionId ?? 1 } });
    const specialty = await db.specialty.findUnique({ where: { id: user.assignedSpecialtyId } });
    return NextResponse.json({
      profile: {
        institution: institution?.nameAr ?? "",
        specialtyName: specialty?.nameAr ?? "",
        trackName: "", yearName: "", groupName: "", cohortName: "",
      },
    });
  } catch (e) {
    return NextResponse.json({ profile: null });
  }
}
