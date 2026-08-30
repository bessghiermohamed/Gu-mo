/**
 * Get unread announcements count for current user (fix B.8)
 * Replaces the hardcoded "notificationCount = 2" with a real DB query.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/service";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ count: 0 });
    }

    const totalAnnouncements = await db.announcement.count({
      where: {
        OR: [
          { specialtyId: null },
          { specialtyId: user.assignedSpecialtyId },
        ],
      },
    });

    const readStates = await db.notificationReadState.findMany({
      where: { userId: user.id },
      select: { announcementId: true },
    });
    const readIds = new Set(readStates.map((r) => r.announcementId));
    const unreadCount = Math.max(0, totalAnnouncements - readIds.size);

    return NextResponse.json({ count: unreadCount });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
