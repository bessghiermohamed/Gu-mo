import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const specialtyId = url.searchParams.get("specialtyId");
  if (!specialtyId) {
    return NextResponse.json({ years: [] });
  }
  const years = await db.academicYear.findMany({
    where: { specialtyId: parseInt(specialtyId) },
    orderBy: { id: "asc" },
  });
  return NextResponse.json({ years });
}
