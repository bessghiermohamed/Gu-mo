import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const specialtyId = url.searchParams.get("specialtyId");
  const academicYearId = url.searchParams.get("academicYearId");
  if (!specialtyId || !academicYearId) {
    return NextResponse.json({ cohorts: [] });
  }
  const cohorts = await db.cohortGroup.findMany({
    where: {
      specialtyId: parseInt(specialtyId),
      academicYearId: parseInt(academicYearId),
    },
    orderBy: { id: "asc" },
  });
  return NextResponse.json({ cohorts });
}
