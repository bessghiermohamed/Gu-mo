import { NextRequest, NextResponse } from "next/server";
import { fetchAcademicTracks } from "@/lib/data-layer";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const specialtyId = url.searchParams.get("specialtyId");
  if (!specialtyId) return NextResponse.json({ tracks: [] });
  try {
    const tracks = await fetchAcademicTracks(parseInt(specialtyId));
    return NextResponse.json({ tracks });
  } catch (e) {
    return NextResponse.json({ tracks: [] });
  }
}
