import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canManageRoles } from "@/lib/auth/permissions";
import { fetchSpecialties } from "@/lib/data-layer";

const isVercel = process.env.VERCEL === "1";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const institutionId = url.searchParams.get("institutionId");
  try {
    const specialties = await fetchSpecialties(institutionId ? parseInt(institutionId) : undefined);
    return NextResponse.json({ specialties });
  } catch (e) {
    return NextResponse.json({ specialties: [] });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canManageRoles(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { nameAr, code, institutionId, faculty, description } = body;
    if (!nameAr?.trim() || !code?.trim() || !institutionId) {
      return NextResponse.json({ error: "الاسم، الكود، والمؤسسة مطلوبة" }, { status: 400 });
    }
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.from("specialties").insert({
        institution_id: institutionId,
        name_ar: nameAr.trim(),
        code: code.trim(),
        faculty: faculty?.trim() || "",
        description: description?.trim() || "",
      }).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ specialty: data });
    }
    const specialty = await db.specialty.create({
      data: { institutionId, nameAr: nameAr.trim(), code: code.trim(), faculty: faculty?.trim() || "", description: description?.trim() || "" },
    });
    return NextResponse.json({ specialty });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
