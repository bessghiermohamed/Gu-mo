/**
 * Get unread announcements count for current user (fix B.8)
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { fetchAnnouncements } from "@/lib/data-layer";

const isVercel = process.env.VERCEL === "1";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ count: 0 });
    }

    const announcements = await fetchAnnouncements(user.assignedSpecialtyId);

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: readStates } = await supabase
        .from("notification_read_states")
        .select("announcement_id")
        .eq("user_id", user.id);

      const readIds = new Set((readStates ?? []).map((r) => r.announcement_id));
      const unreadCount = Math.max(0, announcements.length - readIds.size);
      return NextResponse.json({ count: unreadCount });
    }

    // Local
    const readStates = await db.notificationReadState.findMany({
      where: { userId: user.id },
      select: { announcementId: true },
    });
    const readIds = new Set(readStates.map((r) => r.announcementId));
    const unreadCount = Math.max(0, announcements.length - readIds.size);
    return NextResponse.json({ count: unreadCount });
  } catch (e) {
    console.error("GET /api/announcements/unread-count error:", e);
    return NextResponse.json({ count: 0 });
  }
}
