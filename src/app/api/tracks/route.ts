/**
 * Academic Tracks API — fix أ.2
 * GET  ?specialtyId=  → list tracks of a specialty
 * POST → create a track (supervisors only).
 *        The UI offers 3 quick presets (ابتدائي/متوسط/ثانوي) per the research
 *        that tracks are the target teaching level and repeat across specialties.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canManageRoles } from "@/lib/auth/permissions";
import { fetchAcademicTracks } from "@/lib/data-layer";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const specialtyId = url.searchParams.get("specialtyId");
  if (!specialtyId) return NextResponse.json({ tracks: [] });
  try {
    const tracks = await fetchAcademicTracks(parseInt(specialtyId));
    return NextResponse.json({ tracks });
  } catch (e) {
    return NextResponse.json({ tracks: [] });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canManageRoles(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { specialtyId, trackNameAr, code } = body;
    if (!specialtyId || !trackNameAr?.trim() || !code?.trim()) {
      return NextResponse.json({ error: "التخصص، اسم الملمح، والكود مطلوبة" }, { status: 400 });
    }
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: existing } = await supabase
        .from("academic_tracks")
        .select("id")
        .eq("specialty_id", specialtyId)
        .eq("code", code.trim())
        .maybeSingle();
      if (existing) {
        return NextResponse.json({ error: `يوجد ملمح بنفس الكود "${code.trim()}"` }, { status: 409 });
      }
      const { data, error } = await supabase.from("academic_tracks").insert({
        specialty_id: specialtyId,
        track_name_ar: trackNameAr.trim(),
        code: code.trim(),
      }).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ track: { id: data.id, specialtyId: data.specialty_id, trackNameAr: data.track_name_ar, code: data.code } });
    }
    const existing = await db.academicTrack.findFirst({
      where: { specialtyId, code: code.trim() },
    });
    if (existing) {
      return NextResponse.json({ error: `يوجد ملمح بنفس الكود "${code.trim()}"` }, { status: 409 });
    }
    const track = await db.academicTrack.create({
      data: { specialtyId, trackNameAr: trackNameAr.trim(), code: code.trim() },
    });
    return NextResponse.json({ track });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
