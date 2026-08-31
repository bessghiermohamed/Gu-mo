/**
 * Academic Tracks API — fix أ.2
 * GET  ?specialtyId=  → list tracks of a specialty
 * POST → create a track (supervisors only).
 *        The UI offers 3 quick presets (ابتدائي/متوسط/ثانوي) per the research
 *        that tracks are the target teaching level and repeat across specialties.
 * PATCH/DELETE (round 6) → tracks could be ADDED but never corrected/removed.
 *        DB deletion is safe by design: cohort_groups.track_id / user scopes
 *        are ON DELETE SET NULL, so the guard only verifies scope ownership.
 * Authorization: canCreateGroups + non-OWNER scope check (own specialty only).
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canCreateGroups } from "@/lib/auth/permissions";
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
  if (!user || !canCreateGroups(user)) {
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

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canCreateGroups(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { id, trackNameAr, code } = body;
    if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
    const trimName = trackNameAr?.trim();
    const trimCode = code?.trim();
    if (trackNameAr !== undefined && !trimName) {
      return NextResponse.json({ error: "اسم الملمح لا يمكن أن يكون فارغاً" }, { status: 400 });
    }
    if (code !== undefined && !trimCode) {
      return NextResponse.json({ error: "الكود لا يمكن أن يكون فارغاً" }, { status: 400 });
    }
    const trackId = Number(id);
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: track } = await supabase
        .from("academic_tracks").select("id, specialty_id, code").eq("id", trackId).maybeSingle();
      if (!track) return NextResponse.json({ error: "الملمح غير موجود" }, { status: 404 });
      if (user.role !== "OWNER" && Number(track.specialty_id) !== user.assignedSpecialtyId) {
        return NextResponse.json({ error: "هذا الملمح خارج نطاق تخصصك" }, { status: 403 });
      }
      if (trimCode && trimCode !== track.code) {
        const { data: dup } = await supabase
          .from("academic_tracks").select("id")
          .eq("specialty_id", track.specialty_id).eq("code", trimCode).neq("id", trackId)
          .maybeSingle();
        if (dup) return NextResponse.json({ error: `يوجد ملمح بنفس الكود "${trimCode}"` }, { status: 409 });
      }
      const patch: Record<string, unknown> = {};
      if (trimName) patch.track_name_ar = trimName;
      if (trimCode) patch.code = trimCode;
      const { data, error } = await supabase.from("academic_tracks").update(patch).eq("id", trackId).select().single();
      if (error || !data) return NextResponse.json({ error: `فشل التحديث: ${error?.message ?? "خطأ"}` }, { status: 500 });
      return NextResponse.json({ track: { id: data.id, specialtyId: data.specialty_id, trackNameAr: data.track_name_ar, code: data.code } });
    }
    const track = await db.academicTrack.findUnique({ where: { id: trackId }, select: { specialtyId: true, code: true } });
    if (!track) return NextResponse.json({ error: "الملمح غير موجود" }, { status: 404 });
    if (user.role !== "OWNER" && track.specialtyId !== user.assignedSpecialtyId) {
      return NextResponse.json({ error: "هذا الملمح خارج نطاق تخصصك" }, { status: 403 });
    }
    if (trimCode && trimCode !== track.code) {
      const dup = await db.academicTrack.findFirst({
        where: { specialtyId: track.specialtyId, code: trimCode, id: { not: trackId } },
      });
      if (dup) return NextResponse.json({ error: `يوجد ملمح بنفس الكود "${trimCode}"` }, { status: 409 });
    }
    const updated = await db.academicTrack.update({
      where: { id: trackId },
      data: {
        ...(trimName ? { trackNameAr: trimName } : {}),
        ...(trimCode ? { code: trimCode } : {}),
      },
    });
    return NextResponse.json({ track: updated });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canCreateGroups(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
  const trackId = parseInt(id);
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: track } = await supabase
        .from("academic_tracks").select("id, specialty_id, track_name_ar").eq("id", trackId).maybeSingle();
      if (!track) return NextResponse.json({ error: "الملمح غير موجود" }, { status: 404 });
      if (user.role !== "OWNER" && Number(track.specialty_id) !== user.assignedSpecialtyId) {
        return NextResponse.json({ error: "هذا الملمح خارج نطاق تخصصك" }, { status: 403 });
      }
      // DB-level: dependents use ON DELETE SET NULL — no cascade, no orphans.
      // User scopes + cohort track links are cleared defensively anyway.
      await supabase.from("app_users").update({ scope_track_id: null }).eq("scope_track_id", trackId);
      const { error } = await supabase.from("academic_tracks").delete().eq("id", trackId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const track = await db.academicTrack.findUnique({ where: { id: trackId }, select: { specialtyId: true, trackNameAr: true } });
      if (!track) return NextResponse.json({ error: "الملمح غير موجود" }, { status: 404 });
      if (user.role !== "OWNER" && track.specialtyId !== user.assignedSpecialtyId) {
        return NextResponse.json({ error: "هذا الملمح خارج نطاق تخصصك" }, { status: 403 });
      }
      await db.appUser.updateMany({ where: { scopeTrackId: trackId }, data: { scopeTrackId: null } });
      await db.academicTrack.delete({ where: { id: trackId } });
    }
    return NextResponse.json({ ok: true, message: "تم حذف الملمح — الأفواج المرتبطة به ستفقد ارتباطها" });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
