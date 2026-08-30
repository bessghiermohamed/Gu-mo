import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { fetchAnnouncements } from "@/lib/data-layer";

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
      const readIds = new Set((readStates ?? []).map((r: Record<string, unknown>) => r.announcement_id));
      const unreadCount = Math.max(0, announcements.length - readIds.size);
      return NextResponse.json({ count: unreadCount });
    }
    return NextResponse.json({ count: announcements.length });
  } catch (e) {
    return NextResponse.json({ count: 0 });
  }
}
