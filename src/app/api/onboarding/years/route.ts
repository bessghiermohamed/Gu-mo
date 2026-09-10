import { NextRequest, NextResponse } from "next/server";
import { fetchAcademicYears } from "@/lib/data-layer";

/**
 * Years list for the onboarding wizard.
 *
 * r70 (track fix): accepts an optional ?trackId= — when the student has
 * picked their track (ملمح), the year step must show ONLY that track's
 * years + shared NULL-track years, never a merged list where
 * "السنة الثانية" appears once per track indistinguishably.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const specialtyId = url.searchParams.get("specialtyId");
  if (!specialtyId) return NextResponse.json({ years: [] });
  const trackIdRaw = url.searchParams.get("trackId");
  const trackId =
    trackIdRaw && trackIdRaw !== "null" && Number(trackIdRaw) > 0
      ? Number(trackIdRaw)
      : undefined;
  try {
    const years = await fetchAcademicYears(parseInt(specialtyId), trackId);
    return NextResponse.json({ years });
  } catch (e) {
    console.error("GET /api/onboarding/years error:", e);
    return NextResponse.json({ years: [] });
  }
}
