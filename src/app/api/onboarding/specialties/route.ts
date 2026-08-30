import { NextRequest, NextResponse } from "next/server";
import { fetchSpecialties } from "@/lib/data-layer";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const institutionId = url.searchParams.get("institutionId");
  if (!institutionId) return NextResponse.json({ specialties: [] });
  try {
    const specialties = await fetchSpecialties(parseInt(institutionId));
    return NextResponse.json({ specialties });
  } catch (e) {
    return NextResponse.json({ specialties: [] });
  }
}
