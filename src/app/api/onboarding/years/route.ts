import { NextRequest, NextResponse } from "next/server";
import { fetchAcademicYears } from "@/lib/data-layer";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const specialtyId = url.searchParams.get("specialtyId");
  if (!specialtyId) {
    return NextResponse.json({ years: [] });
  }
  try {
    const years = await fetchAcademicYears(parseInt(specialtyId));
    return NextResponse.json({ years });
  } catch (e) {
    console.error("GET /api/onboarding/years error:", e);
    return NextResponse.json({ years: [] });
  }
}
