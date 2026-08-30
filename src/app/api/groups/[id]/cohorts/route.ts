import { NextRequest, NextResponse } from "next/server";
import { fetchCohortsByGroup } from "@/lib/data-layer";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cohorts = await fetchCohortsByGroup(parseInt(id));
    return NextResponse.json({ cohorts });
  } catch (e) {
    return NextResponse.json({ cohorts: [] });
  }
}
