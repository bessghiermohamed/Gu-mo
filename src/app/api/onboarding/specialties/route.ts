import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const institutionId = url.searchParams.get("institutionId");
  if (!institutionId) {
    return NextResponse.json({ specialties: [] });
  }
  const specialties = await db.specialty.findMany({
    where: { institutionId: parseInt(institutionId) },
    orderBy: { nameAr: "asc" },
  });
  return NextResponse.json({ specialties });
}
