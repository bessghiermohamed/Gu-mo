import { NextResponse } from "next/server";
import { fetchInstitutions } from "@/lib/data-layer";

export async function GET() {
  try {
    const institutions = await fetchInstitutions();
    return NextResponse.json({ institutions });
  } catch (e) {
    return NextResponse.json({ institutions: [] });
  }
}
