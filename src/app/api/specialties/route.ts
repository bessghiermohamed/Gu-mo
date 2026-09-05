import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canManageRoles } from "@/lib/auth/permissions";
import { fetchSpecialties } from "@/lib/data-layer";

/**
 * Specialties API — round 6 CRUD completion.
 *
 * Specialties could be ADDED but never renamed or removed. Deleting is
 * extremely dangerous: specialty delete cascades to years/tracks/courses/
 * exams/assignments/grades, AND app_users.assigned_specialty_id has no FK
 * (users would silently point to a nonexistent specialty). So:
 *
 *   PATCH  { id, nameAr?, code?, faculty? } → OWNER only
 *   DELETE ?id=7 → OWNER only, BLOCKED while users/years/tracks/courses
 *           still reference the specialty.
 */

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

function isOwner(user: Awaited<ReturnType<typeof getCurrentUser>>): boolean {
  return !!user && user.role === "OWNER";
}

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

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!isOwner(user)) {
    return NextResponse.json({ error: "غير مصرّح: تعديل التخصصات متاح للمالك فقط" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { id, nameAr, code, faculty } = body;
    if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
    const trimName = nameAr?.trim();
    const trimCode = code?.trim();
    if (nameAr !== undefined && !trimName) {
      return NextResponse.json({ error: "اسم التخصص لا يمكن أن يكون فارغاً" }, { status: 400 });
    }
    if (code !== undefined && !trimCode) {
      return NextResponse.json({ error: "الكود لا يمكن أن يكون فارغاً" }, { status: 400 });
    }
    const specId = Number(id);
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: spec } = await supabase.from("specialties").select("id, code").eq("id", specId).maybeSingle();
      if (!spec) return NextResponse.json({ error: "التخصص غير موجود" }, { status: 404 });
      if (trimCode && trimCode !== spec.code) {
        const { data: dup } = await supabase.from("specialties").select("id").eq("code", trimCode).neq("id", specId).maybeSingle();
        if (dup) return NextResponse.json({ error: `الكود "${trimCode}" مستعمل مسبقاً` }, { status: 409 });
      }
      const patch: Record<string, unknown> = {};
      if (trimName) patch.name_ar = trimName;
      if (trimCode) patch.code = trimCode;
      if (faculty !== undefined) patch.faculty = String(faculty).trim();
      const { data, error } = await supabase.from("specialties").update(patch).eq("id", specId).select().single();
      if (error || !data) return NextResponse.json({ error: `فشل التحديث: ${error?.message ?? "خطأ"}` }, { status: 500 });
      return NextResponse.json({ specialty: data });
    }
    const spec = await db.specialty.findUnique({ where: { id: specId }, select: { code: true } });
    if (!spec) return NextResponse.json({ error: "التخصص غير موجود" }, { status: 404 });
    if (trimCode && trimCode !== spec.code) {
      const dup = await db.specialty.findFirst({ where: { code: trimCode, id: { not: specId } } });
      if (dup) return NextResponse.json({ error: `الكود "${trimCode}" مستعمل مسبقاً` }, { status: 409 });
    }
    const updated = await db.specialty.update({
      where: { id: specId },
      data: {
        ...(trimName ? { nameAr: trimName } : {}),
        ...(trimCode ? { code: trimCode } : {}),
        ...(faculty !== undefined ? { faculty: String(faculty).trim() } : {}),
      },
    });
    return NextResponse.json({ specialty: updated });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!isOwner(user)) {
    return NextResponse.json({ error: "غير مصرّح: حذف التخصصات متاح للمالك فقط" }, { status: 403 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
  // round 36: ?force=1 — OWNER's escape hatch: wipes the specialty's whole
  // subtree (years, tracks, groups, cohorts, courses…) and DETACHES its
  // accounts (never deletes them) toward a surviving specialty.
  const force = url.searchParams.get("force") === "1";
  const specId = parseInt(id);
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: spec } = await supabase.from("specialties").select("id, name_ar, institution_id").eq("id", specId).maybeSingle();
      if (!spec) return NextResponse.json({ error: "التخصص غير موجود" }, { status: 404 });
      // guard: block while anything still depends on the specialty (unless force).
      // app_users.assigned_specialty_id has NO FK — users would be orphaned.
      const [users, years, tracks, courses] = await Promise.all([
        supabase.from("app_users").select("id", { count: "exact", head: true }).eq("assigned_specialty_id", specId),
        supabase.from("academic_years").select("id", { count: "exact", head: true }).eq("specialty_id", specId),
        supabase.from("academic_tracks").select("id", { count: "exact", head: true }).eq("specialty_id", specId),
        supabase.from("module_courses").select("id", { count: "exact", head: true }).eq("specialty_id", specId),
      ]);
      const u = users.count ?? 0, y = years.count ?? 0, tr = tracks.count ?? 0, c = courses.count ?? 0;
      if (u + y + tr + c > 0 && !force) {
        return NextResponse.json({
          error: `لا يمكن حذف "${spec.name_ar}": ${u} مستخدم و ${y} سنة و ${tr} ملامح و ${c} مقياس مرتبطة به. انقل المستخدمين واحذف المحتوى أولاً.`,
          counts: { users: u, years: y, tracks: tr, courses: c },
        }, { status: 400 });
      }
      if (u + y + tr + c > 0 && force) {
        // a user must always keep a valid specialty: prefer a sibling in the same institution
        const { data: sibling } = await supabase
          .from("specialties").select("id").eq("institution_id", Number(spec.institution_id)).neq("id", specId)
          .order("id", { ascending: true }).limit(1).maybeSingle();
        const { data: survivor } = sibling
          ? { data: sibling }
          : await supabase.from("specialties").select("id").neq("id", specId).order("id", { ascending: true }).limit(1).maybeSingle();
        if (!survivor) {
          return NextResponse.json({
            error: `لا يمكن الحذف النهائي: "${spec.name_ar}" هو آخر تخصص في المنصة. أنشئ تخصصاً بديلاً أولاً حتى لا يبقى المستخدمون بلا مسار.`,
          }, { status: 400 });
        }
        // 1) re-point assigned accounts + clear every scope column
        await supabase.from("app_users").update({
          assigned_specialty_id: Number(survivor.id),
          scope_specialty_id: null, scope_academic_year_id: null,
          scope_track_id: null, scope_group_id: null, scope_cohort_group_id: null,
        }).eq("assigned_specialty_id", specId);
        // 2) detach remaining accounts scoped into this specialty's cohorts/groups
        const { data: cohortRows } = await supabase.from("cohort_groups").select("id").eq("specialty_id", specId);
        const cohortIds = (cohortRows ?? []).map((r) => Number(r.id));
        const { data: groupRows } = await supabase.from("study_groups").select("id").eq("specialty_id", specId);
        const groupIds = (groupRows ?? []).map((r) => Number(r.id));
        if (cohortIds.length) await supabase.from("app_users").update({ scope_cohort_group_id: null }).in("scope_cohort_group_id", cohortIds);
        if (groupIds.length) await supabase.from("app_users").update({ scope_group_id: null }).in("scope_group_id", groupIds);
      }
      await supabase.from("app_users").update({ scope_specialty_id: null }).eq("scope_specialty_id", specId);
      const { error } = await supabase.from("specialties").delete().eq("id", specId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const spec = await db.specialty.findUnique({ where: { id: specId }, select: { nameAr: true, institutionId: true } });
      if (!spec) return NextResponse.json({ error: "التخصص غير موجود" }, { status: 404 });
      const u = await db.appUser.count({ where: { assignedSpecialtyId: specId } });
      const y = await db.academicYear.count({ where: { specialtyId: specId } });
      const tr = await db.academicTrack.count({ where: { specialtyId: specId } });
      const c = await db.moduleCourse.count({ where: { specialtyId: specId } });
      if (u + y + tr + c > 0 && !force) {
        return NextResponse.json({
          error: `لا يمكن حذف "${spec.nameAr}": ${u} مستخدم و ${y} سنة و ${tr} ملامح و ${c} مقياس مرتبطة به. احذفها أولاً.`,
          counts: { users: u, years: y, tracks: tr, courses: c },
        }, { status: 400 });
      }
      if (u + y + tr + c > 0 && force) {
        // app_users.assignedSpecialtyId is a RESTRICT FK — re-point BEFORE the cascade delete
        const survivor =
          (await db.specialty.findFirst({ where: { id: { not: specId }, institutionId: spec.institutionId }, orderBy: { id: "asc" } }))
          ?? (await db.specialty.findFirst({ where: { id: { not: specId } }, orderBy: { id: "asc" } }));
        if (!survivor) {
          return NextResponse.json({
            error: `لا يمكن الحذف النهائي: "${spec.nameAr}" هو آخر تخصص في المنصة. أنشئ تخصصاً بديلاً أولاً حتى لا يبقى المستخدمون بلا مسار.`,
          }, { status: 400 });
        }
        // 1) detach cohort/group members FIRST (scopeCohortGroupId is a RESTRICT FK)
        await db.appUser.updateMany({ where: { cohortGroup: { specialtyId: specId } }, data: { scopeCohortGroupId: null } });
        await db.appUser.updateMany({ where: { scopeGroup: { specialtyId: specId } }, data: { scopeGroupId: null } });
        // 2) re-point assigned accounts + clear every scope column
        await db.appUser.updateMany({
          where: { assignedSpecialtyId: specId },
          data: {
            assignedSpecialtyId: survivor.id,
            scopeSpecialtyId: null, scopeAcademicYearId: null,
            scopeTrackId: null, scopeGroupId: null, scopeCohortGroupId: null,
          },
        });
      }
      await db.appUser.updateMany({ where: { scopeSpecialtyId: specId }, data: { scopeSpecialtyId: null } });
      await db.specialty.delete({ where: { id: specId } });
    }
    return NextResponse.json({
      ok: true,
      forced: force,
      message: force ? "تم حذف التخصص مع كل محتواه — الحسابات المرتبطة لم تُحذف، وسيعيد أعضاؤها اختيار مسارهم" : "تم حذف التخصص",
    });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
