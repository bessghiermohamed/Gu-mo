import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { fetchAnnouncements } from "@/lib/data-layer";
import { db } from "@/lib/db";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ count: 0 });
    const announcements = await fetchAnnouncements(user.assignedSpecialtyId);
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: readStates } = await supabase
        .from("notification_read_states")
        .select("announcement_id")
        .eq("user_id", user.id);
      const readIds = new Set((readStates ?? []).map((r: Record<string, unknown>) => Number(r.announcement_id)));
      const unreadCount = announcements.filter((a) => !readIds.has(Number(a.id))).length;
      return NextResponse.json({ count: unreadCount });
    }
    // fix (R12): the local branch ignored read states COMPLETELY (every
    // announcement was always unread). It now applies the same rule as the
    // Supabase branch.
    const readRows = await db.notificationReadState.findMany({
      where: { userId: user.id } as never,
      select: { announcementId: true },
    });
    const readIds = new Set(readRows.map((r) => r.announcementId));
    const unreadCount = announcements.filter((a) => !readIds.has(Number(a.id))).length;
    return NextResponse.json({ count: unreadCount });
  } catch (e) {
    return NextResponse.json({ count: 0 });
  }
}
