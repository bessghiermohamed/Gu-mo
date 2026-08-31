/**
 * Announcements API — fix ج (no way to create announcements)
 * GET   → announcements visible to the caller's specialty
 * POST  → create an announcement (supervisors: REPRESENTATIVE with scope / SPECIALTY_ADMIN / OWNER)
 * PATCH → edit an announcement (round 5 — previously a mistake was permanent)
 * DELETE → remove an announcement (round 5 — previously impossible)
 *
 * Edit/delete eligibility (round 5):
 *   OWNER           → any announcement
 *   SPECIALTY_ADMIN → any announcement of their own specialty
 *   REPRESENTATIVE  → only announcements they authored, within their specialty
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canUploadContent } from "@/lib/auth/permissions";
import { fetchAnnouncements } from "@/lib/data-layer";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

interface AnnouncementRow {
  id: number;
  specialty_id: number | null;
  author: string | null;
}

async function loadAnnouncement(id: number): Promise<AnnouncementRow | null> {
  if (isVercel) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("announcements")
      .select("id, specialty_id, author")
      .eq("id", id)
      .maybeSingle();
    return data ? { id: Number(data.id), specialty_id: data.specialty_id == null ? null : Number(data.specialty_id), author: String(data.author ?? "") } : null;
  }
  const a = await db.announcement.findUnique({ where: { id } });
  return a ? { id: a.id, specialty_id: a.specialtyId == null ? null : Number(a.specialtyId), author: a.author } : null;
}

/** round 5: eligibility check shared by PATCH and DELETE */
function canEditAnnouncement(
  user: { role: string; assignedSpecialtyId: number; fullName: string },
  row: AnnouncementRow
): boolean {
  if (user.role === "OWNER") return true;
  if (row.specialty_id !== user.assignedSpecialtyId) return false;
  if (user.role === "SPECIALTY_ADMIN") return true;
  if (user.role === "REPRESENTATIVE") return row.author === user.fullName;
  return false;
}

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

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canUploadContent(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { id, title, content, urgency } = body;
    if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
    const t = title?.trim();
    const c = content?.trim();
    if (title !== undefined && !t) return NextResponse.json({ error: "العنوان لا يمكن أن يكون فارغاً" }, { status: 400 });
    if (content !== undefined && !c) return NextResponse.json({ error: "المحتوى لا يمكن أن يكون فارغاً" }, { status: 400 });
    const validUrgency = ["عاجل", "هام", "عام"].includes(urgency) ? urgency : null;

    const row = await loadAnnouncement(Number(id));
    if (!row) return NextResponse.json({ error: "الإعلان غير موجود" }, { status: 404 });
    if (!canEditAnnouncement(user, row)) {
      return NextResponse.json({ error: "لا يمكنك تعديل هذا الإعلان" }, { status: 403 });
    }

    const patch: Record<string, unknown> = {};
    if (t) patch.title = t;
    if (c) patch.content = c;
    if (validUrgency) patch.urgency = validUrgency;
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "لا توجد تغييرات" }, { status: 400 });
    }

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("announcements")
        .update(patch)
        .eq("id", Number(id))
        .select()
        .single();
      if (error || !data) {
        return NextResponse.json({ error: `فشل التحديث: ${error?.message ?? "خطأ"}` }, { status: 500 });
      }
      return NextResponse.json({ announcement: data });
    }
    const updated = await db.announcement.update({
      where: { id: Number(id) },
      data: {
        ...(t ? { title: t } : {}),
        ...(c ? { content: c } : {}),
        ...(validUrgency ? { urgency: validUrgency } : {}),
      },
    });
    return NextResponse.json({ announcement: updated });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canUploadContent(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
  try {
    const row = await loadAnnouncement(Number(id));
    if (!row) return NextResponse.json({ error: "الإعلان غير موجود" }, { status: 404 });
    if (!canEditAnnouncement(user, row)) {
      return NextResponse.json({ error: "لا يمكنك حذف هذا الإعلان" }, { status: 403 });
    }
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      // round 5: clean read-state rows so the unread badge math stays correct
      await supabase.from("notification_read_states").delete().eq("announcement_id", Number(id));
      const { error } = await supabase.from("announcements").delete().eq("id", Number(id));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      await db.notificationReadState.deleteMany({ where: { announcementId: Number(id) } });
      await db.announcement.delete({ where: { id: Number(id) } });
    }
    return NextResponse.json({ ok: true, message: "تم حذف الإعلان" });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
