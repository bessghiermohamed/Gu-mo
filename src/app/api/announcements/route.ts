import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/service";
import { fetchAnnouncements } from "@/lib/data-layer";

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
