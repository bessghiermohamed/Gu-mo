import { NextResponse } from "next/server";
import { fetchInstitutions } from "@/lib/data-layer";

export async function GET() {
  try {
    const institutions = await fetchInstitutions();
    return NextResponse.json({ institutions });
  } catch (e) {
    console.error("GET /api/onboarding/institutions error:", e);
    return NextResponse.json(
      { institutions: [], error: "فشل تحميل المؤسسات" },
      { status: 200 }
    );
  }
}
