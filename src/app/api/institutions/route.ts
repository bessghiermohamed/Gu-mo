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
  // round 36: ?force=1 — OWNER's escape hatch. Wipes the whole subtree
  // (specialties → years → tracks → groups → cohorts → courses and their
  // content) and DETACHES attached accounts (never deletes them): they are
  // re-pointed to a surviving specialty and simply re-pick their path.
  const force = url.searchParams.get("force") === "1";
  const instId = parseInt(id);
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: inst } = await supabase.from("institutions").select("id, name_ar").eq("id", instId).maybeSingle();
      if (!inst) return NextResponse.json({ error: "المؤسسة غير موجودة" }, { status: 404 });
      // guard: deleting an institution cascades to ALL its specialties — block while non-empty (unless force)
      const { count } = await supabase.from("specialties").select("id", { count: "exact", head: true }).eq("institution_id", instId);
      const n = count ?? 0;
      if (n > 0 && !force) {
        return NextResponse.json({
          error: `لا يمكن حذف "${inst.name_ar}": تحتوي على ${n} تخصص. حذفها سيحذف كل السنوات والمجموعات والمقاييس والنقاط المرتبطة بها. احذف التخصصات أولاً.`,
          counts: { specialties: n },
        }, { status: 400 });
      }
      if (n > 0 && force) {
        // collect the subtree ids we must detach users from
        const { data: specRows } = await supabase.from("specialties").select("id").eq("institution_id", instId);
        const specIds = (specRows ?? []).map((r) => Number(r.id));
        const { data: yearRows } = specIds.length
          ? await supabase.from("academic_years").select("id").in("specialty_id", specIds)
          : { data: [] };
        const yearIds = (yearRows ?? []).map((r) => Number(r.id));
        // a user must always keep a valid specialty: re-point to one OUTSIDE this institution
        const { data: survivor } = await supabase
          .from("specialties").select("id").neq("institution_id", instId).order("id", { ascending: true }).limit(1).maybeSingle();
        if (!survivor) {
          return NextResponse.json({
            error: `لا يمكن الحذف النهائي: "${inst.name_ar}" تضم آخر تخصصات المنصة. أنشئ مؤسسة وتخصصاً بديلين أولاً حتى لا يبقى المستخدمون بلا مسار.`,
          }, { status: 400 });
        }
        // 1) re-point accounts assigned to this institution's specialties + clear every scope
        if (specIds.length) {
          await supabase.from("app_users").update({
            assigned_specialty_id: Number(survivor.id),
            scope_specialty_id: null, scope_academic_year_id: null, scope_institution_id: null,
            scope_track_id: null, scope_group_id: null, scope_cohort_group_id: null,
          }).in("assigned_specialty_id", specIds);
        }
        // 2) detach any remaining account scoped into the subtree (supervisors etc.)
        const { data: cohortRows } = specIds.length
          ? await supabase.from("cohort_groups").select("id").in("specialty_id", specIds)
          : { data: [] };
        const cohortIds = (cohortRows ?? []).map((r) => Number(r.id));
        const { data: groupRows } = specIds.length
          ? await supabase.from("study_groups").select("id").in("specialty_id", specIds)
          : { data: [] };
        const groupIds = (groupRows ?? []).map((r) => Number(r.id));
        if (cohortIds.length) await supabase.from("app_users").update({ scope_cohort_group_id: null }).in("scope_cohort_group_id", cohortIds);
        if (groupIds.length) await supabase.from("app_users").update({ scope_group_id: null }).in("scope_group_id", groupIds);
        if (specIds.length) await supabase.from("app_users").update({ scope_specialty_id: null, scope_academic_year_id: null }).in("scope_specialty_id", specIds);
        if (yearIds.length) await supabase.from("app_users").update({ scope_academic_year_id: null }).in("scope_academic_year_id", yearIds);
      }
      // clear dangling user scopes (no FK on this column)
      await supabase.from("app_users").update({ scope_institution_id: null }).eq("scope_institution_id", instId);
      const { error } = await supabase.from("institutions").delete().eq("id", instId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const inst = await db.institution.findUnique({ where: { id: instId }, select: { nameAr: true } });
      if (!inst) return NextResponse.json({ error: "المؤسسة غير موجودة" }, { status: 404 });
      const n = await db.specialty.count({ where: { institutionId: instId } });
      if (n > 0 && !force) {
        return NextResponse.json({
          error: `لا يمكن حذف "${inst.nameAr}": تحتوي على ${n} تخصص. احذف التخصصات أولاً.`,
          counts: { specialties: n },
        }, { status: 400 });
      }
      if (n > 0 && force) {
        // subtree ids
        const affectedSpecs = await db.specialty.findMany({ where: { institutionId: instId }, select: { id: true } });
        const specIds = affectedSpecs.map((s) => s.id);
        const affectedYears = await db.academicYear.findMany({ where: { specialtyId: { in: specIds } }, select: { id: true } });
        const yearIds = affectedYears.map((y) => y.id);
        // app_users.assigned_specialty_id is a RESTRICT FK — re-point BEFORE the cascade delete
        const survivor = await db.specialty.findFirst({ where: { institutionId: { not: instId } }, orderBy: { id: "asc" } });
        if (!survivor) {
          return NextResponse.json({
            error: `لا يمكن الحذف النهائي: "${inst.nameAr}" تضم آخر تخصصات المنصة. أنشئ مؤسسة وتخصصاً بديلين أولاً حتى لا يبقى المستخدمون بلا مسار.`,
          }, { status: 400 });
        }
        // 1) detach cohort/group members FIRST (scopeCohortGroupId is a RESTRICT FK)
        await db.appUser.updateMany({
          where: { cohortGroup: { specialty: { institutionId: instId } } },
          data: { scopeCohortGroupId: null },
        });
        await db.appUser.updateMany({
          where: { scopeGroup: { specialty: { institutionId: instId } } },
          data: { scopeGroupId: null },
        });
        // 2) re-point accounts assigned to this institution's specialties + clear every scope
        await db.appUser.updateMany({
          where: { assignedSpecialtyId: { in: specIds } },
          data: {
            assignedSpecialtyId: survivor.id,
            scopeSpecialtyId: null, scopeAcademicYearId: null, scopeInstitutionId: null,
            scopeTrackId: null, scopeGroupId: null, scopeCohortGroupId: null,
          },
        });
        // 3) clear remaining plain (FK-less) scope columns pointing into the subtree
        await db.appUser.updateMany({ where: { scopeSpecialtyId: { in: specIds } }, data: { scopeSpecialtyId: null, scopeAcademicYearId: null } });
        if (yearIds.length) await db.appUser.updateMany({ where: { scopeAcademicYearId: { in: yearIds } }, data: { scopeAcademicYearId: null } });
      }
      await db.appUser.updateMany({ where: { scopeInstitutionId: instId }, data: { scopeInstitutionId: null } });
      await db.institution.delete({ where: { id: instId } });
    }
    return NextResponse.json({
      ok: true,
      forced: force,
      message: force ? "تم حذف المؤسسة مع كل محتواها — الحسابات المرتبطة لم تُحذف، وسيعيد أعضاؤها اختيار مسارهم" : "تم حذف المؤسسة",
    });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
