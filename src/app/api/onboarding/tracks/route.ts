/**
 * Onboarding: Academic Tracks API
 * - GET: fetch academic tracks filtered by ?specialtyId=X
 *   Returns camelCase payload using shared data-layer mappers.
 */
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchAcademicTracks } from "@/lib/data-layer";

const isVercel = process.env.VERCEL === "1";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const specialtyId = url.searchParams.get("specialtyId");
    if (!specialtyId) {
      return NextResponse.json(
        { error: "specialtyId مطلوب" },
        { status: 400 }
      );
    }
    const specialtyIdNum = parseInt(specialtyId);
    if (Number.isNaN(specialtyIdNum)) {
      return NextResponse.json(
        { error: "specialtyId غير صالح" },
        { status: 400 }
      );
    }

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("academic_tracks")
        .select("*")
        .eq("specialty_id", specialtyIdNum)
        .order("id", { ascending: true });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const tracks = (data ?? []).map((t: Record<string, unknown>) => ({
        id: Number(t.id),
        specialtyId: Number(t.specialty_id ?? 0),
        trackNameAr: String(t.track_name_ar ?? ""),
        code: String(t.code ?? ""),
      }));
      return NextResponse.json({ tracks });
    }

    const tracks = await fetchAcademicTracks(specialtyIdNum);
    return NextResponse.json({ tracks });
  } catch (e) {
    return NextResponse.json(
      { error: `خطأ داخلي: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
