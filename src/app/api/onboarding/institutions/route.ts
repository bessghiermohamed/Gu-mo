import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/service";

export async function GET() {
  const institutions = await db.institution.findMany({
    orderBy: { nameAr: "asc" },
  });
  return NextResponse.json({ institutions });
}
