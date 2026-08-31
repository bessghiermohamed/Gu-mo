/**
 * Announcements API — fix ج (no way to create announcements)
 * GET  → announcements visible to the caller's specialty
 * POST → create an announcement (supervisors: REPRESENTATIVE with scope / SPECIALTY_ADMIN / OWNER)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canUploadContent } from "@/lib/auth/permissions";
import { fetchAnnouncements } from "@/lib/data-layer";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ announcements: [] });
  try {
    const announcements = await fetchAnnouncements(user.assignedSpecialtyId);
    return NextResponse.json({ announcements });
  } catch (e) {
    return NextResponse.json({ announcements: [] });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canUploadContent(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { title, content, urgency, specialtyId } = body;
    if (!title?.trim() || !content?.trim()) {
      return NextResponse.json({ error: "العنوان والمحتوى مطلوبان" }, { status: 400 });
    }
    const validUrgency = ["عاجل", "هام", "عام"].includes(urgency) ? urgency : "عام";
    const today = new Date().toISOString().split("T")[0];
    const finalSpecialtyId = specialtyId ?? user.assignedSpecialtyId;

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.from("announcements").insert({
        title: title.trim(),
        content: content.trim(),
        author: user.fullName,
        date: today,
        urgency: validUrgency,
        specialty_id: finalSpecialtyId,
      }).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ announcement: data });
    }
    const announcement = await db.announcement.create({
      data: {
        title: title.trim(),
        content: content.trim(),
        author: user.fullName,
        date: today,
        urgency: validUrgency,
        specialtyId: finalSpecialtyId,
      },
    });
    return NextResponse.json({ announcement });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
