import { NextRequest, NextResponse } from "next/server";
import { fetchCohorts } from "@/lib/data-layer";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const specialtyId = url.searchParams.get("specialtyId");
  const academicYearId = url.searchParams.get("academicYearId");
  if (!specialtyId) {
    return NextResponse.json({ cohorts: [] });
  }
  try {
    const cohorts = await fetchCohorts(
      parseInt(specialtyId),
      academicYearId ? parseInt(academicYearId) : undefined
    );
    return NextResponse.json({ cohorts });
  } catch (e) {
    console.error("GET /api/onboarding/cohorts error:", e);
    return NextResponse.json({ cohorts: [] });
  }
}
