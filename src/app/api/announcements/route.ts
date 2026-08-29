import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/service";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ announcements: [] });
  }

  const announcements = await db.announcement.findMany({
    where: {
      OR: [
        { specialtyId: null },
        { specialtyId: user.assignedSpecialtyId },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ announcements });
}
