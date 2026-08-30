import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canManageRoles } from "@/lib/auth/permissions";
import { fetchInstitutions } from "@/lib/data-layer";

const isVercel = process.env.VERCEL === "1";

export async function GET() {
  try {
    const institutions = await fetchInstitutions();
    return NextResponse.json({ institutions });
  } catch (e) {
    return NextResponse.json({ institutions: [] });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canManageRoles(user)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { nameAr, type, city } = body;
    if (!nameAr?.trim()) {
      return NextResponse.json({ error: "اسم المؤسسة مطلوب" }, { status: 400 });
    }
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.from("institutions").insert({
        name_ar: nameAr.trim(),
        type: type?.trim() || "مؤسسة تعليمية",
        city: city?.trim() || "الجزائر",
      }).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ institution: data });
    }
    const institution = await db.institution.create({
      data: { nameAr: nameAr.trim(), type: type?.trim() || "مؤسسة تعليمية", city: city?.trim() || "الجزائر" },
    });
    return NextResponse.json({ institution });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
