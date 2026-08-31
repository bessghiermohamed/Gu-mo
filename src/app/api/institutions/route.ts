import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canManageRoles } from "@/lib/auth/permissions";
import { fetchInstitutions } from "@/lib/data-layer";

/**
 * Institutions API — round 6 CRUD completion.
 *
 * Institutions could be ADDED but never renamed or removed. Renaming matters
 * (the name appears in every cascade dropdown); deleting is a high-stakes
 * operation because specialties.institution_id is ON DELETE CASCADE —
 * deleting one institution would cascade-wipe ALL its specialties, years,
 * groups, courses, exams, assignments and grades. So:
 *
 *   PATCH  { id, nameAr?, type?, city? } → OWNER only
 *   DELETE ?id=7 → OWNER only, BLOCKED while the institution still has
 *           specialties (must be emptied first).
 */

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

function isOwner(user: Awaited<ReturnType<typeof getCurrentUser>>): boolean {
  return !!user && user.role === "OWNER";
}

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

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!isOwner(user)) {
    return NextResponse.json({ error: "غير مصرّح: تعديل المؤسسات متاح للمالك فقط" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { id, nameAr, type, city } = body;
    if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
    const trimName = nameAr?.trim();
    if (nameAr !== undefined && !trimName) {
      return NextResponse.json({ error: "اسم المؤسسة لا يمكن أن يكون فارغاً" }, { status: 400 });
    }
    const instId = Number(id);
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: inst } = await supabase.from("institutions").select("id, name_ar").eq("id", instId).maybeSingle();
      if (!inst) return NextResponse.json({ error: "المؤسسة غير موجودة" }, { status: 404 });
      if (trimName && trimName !== inst.name_ar) {
        const { data: dup } = await supabase.from("institutions").select("id").eq("name_ar", trimName).neq("id", instId).maybeSingle();
        if (dup) return NextResponse.json({ error: `المؤسسة "${trimName}" موجودة مسبقاً` }, { status: 409 });
      }
      const patch: Record<string, unknown> = {};
      if (trimName) patch.name_ar = trimName;
      if (type !== undefined && String(type).trim()) patch.type = String(type).trim();
      if (city !== undefined && String(city).trim()) patch.city = String(city).trim();
      const { data, error } = await supabase.from("institutions").update(patch).eq("id", instId).select().single();
      if (error || !data) return NextResponse.json({ error: `فشل التحديث: ${error?.message ?? "خطأ"}` }, { status: 500 });
      return NextResponse.json({ institution: data });
    }
    const inst = await db.institution.findUnique({ where: { id: instId }, select: { nameAr: true } });
    if (!inst) return NextResponse.json({ error: "المؤسسة غير موجودة" }, { status: 404 });
    if (trimName && trimName !== inst.nameAr) {
      const dup = await db.institution.findFirst({ where: { nameAr: trimName, id: { not: instId } } });
      if (dup) return NextResponse.json({ error: `المؤسسة "${trimName}" موجودة مسبقاً` }, { status: 409 });
    }
    const updated = await db.institution.update({
      where: { id: instId },
      data: {
        ...(trimName ? { nameAr: trimName } : {}),
        ...(type !== undefined && String(type).trim() ? { type: String(type).trim() } : {}),
        ...(city !== undefined && String(city).trim() ? { city: String(city).trim() } : {}),
      },
    });
    return NextResponse.json({ institution: updated });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!isOwner(user)) {
    return NextResponse.json({ error: "غير مصرّح: حذف المؤسسات متاح للمالك فقط" }, { status: 403 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
  const instId = parseInt(id);
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: inst } = await supabase.from("institutions").select("id, name_ar").eq("id", instId).maybeSingle();
      if (!inst) return NextResponse.json({ error: "المؤسسة غير موجودة" }, { status: 404 });
      // guard: deleting an institution cascades to ALL its specialties — block while non-empty
      const { count } = await supabase.from("specialties").select("id", { count: "exact", head: true }).eq("institution_id", instId);
      const n = count ?? 0;
      if (n > 0) {
        return NextResponse.json({
          error: `لا يمكن حذف "${inst.name_ar}": تحتوي على ${n} تخصص. حذفها سيحذف كل السنوات والمجموعات والمقاييس والنقاط المرتبطة بها. احذف التخصصات أولاً.`,
        }, { status: 400 });
      }
      // clear dangling user scopes (no FK on this column)
      await supabase.from("app_users").update({ scope_institution_id: null }).eq("scope_institution_id", instId);
      const { error } = await supabase.from("institutions").delete().eq("id", instId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const inst = await db.institution.findUnique({ where: { id: instId }, select: { nameAr: true } });
      if (!inst) return NextResponse.json({ error: "المؤسسة غير موجودة" }, { status: 404 });
      const n = await db.specialty.count({ where: { institutionId: instId } });
      if (n > 0) {
        return NextResponse.json({
          error: `لا يمكن حذف "${inst.nameAr}": تحتوي على ${n} تخصص. احذف التخصصات أولاً.`,
        }, { status: 400 });
      }
      await db.appUser.updateMany({ where: { scopeInstitutionId: instId }, data: { scopeInstitutionId: null } });
      await db.institution.delete({ where: { id: instId } });
    }
    return NextResponse.json({ ok: true, message: "تم حذف المؤسسة" });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
