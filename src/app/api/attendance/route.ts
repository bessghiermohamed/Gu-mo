import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

/**
 * Personal attendance & absence tracking (spec §14–§19).
 *
 * STRICTLY PERSONAL — this is NOT an administrative attendance system:
 *   - every operation is hard-scoped to the CALLER's own records
 *     (owner_id = caller.id); there is NO parameter that can target
 *     another user, so supervisors structurally cannot add/edit/delete/
 *     view anyone else's absences (§18)
 *   - data only changes through the student's own actions (§19)
 *   - unofficial / personal bookkeeping (§14)
 *
 * GET    → { courses: [{ name, count, records: [...] }] } — the caller's
 *          course list (specialty + year scoped) merged with their own
 *          absence records
 * POST   → { moduleName, date } — record a new absence
 * DELETE → ?id= — remove one of the CALLER'S OWN records
 */

function ownerKey(userId: number): string {
  return String(userId);
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  try {
    // the caller's course list — same scoping as /api/courses
    let courseNames: Array<{ id: number; name: string }> = [];
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      let query = supabase.from("module_courses").select("id, name").eq("specialty_id", user.assignedSpecialtyId);
      if (user.scopeAcademicYearId != null) query = query.eq("academic_year_id", user.scopeAcademicYearId);
      const { data, error } = await query.order("id", { ascending: true });
      if (!error) courseNames = (data ?? []).map((c: Record<string, unknown>) => ({ id: Number(c.id), name: String(c.name ?? "") }));
    } else {
      const items = await db.moduleCourse.findMany({
        where: {
          specialtyId: user.assignedSpecialtyId,
          ...(user.scopeAcademicYearId != null ? { academicYearId: user.scopeAcademicYearId } : {}),
        },
        orderBy: { id: "asc" },
      });
      courseNames = items.map((c) => ({ id: c.id, name: c.name }));
    }

    // the caller's OWN records only
    let records: Array<{ id: number; moduleName: string; date: string; createdAt: string }> = [];
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("attendance_records")
        .select("id, module_name, date, created_at")
        .eq("owner_id", ownerKey(user.id))
        .order("created_at", { ascending: false });
      if (!error) {
        records = (data ?? []).map((r: Record<string, unknown>) => ({
          id: Number(r.id), moduleName: String(r.module_name ?? ""),
          date: String(r.date ?? ""), createdAt: String(r.created_at ?? ""),
        }));
      }
    } else {
      const items = await db.attendanceRecord.findMany({
        where: { ownerId: ownerKey(user.id) } as never,
        orderBy: { createdAt: "desc" },
      });
      records = items.map((r) => ({
        id: r.id, moduleName: r.moduleName, date: r.date,
        createdAt: r.createdAt?.toISOString?.() ?? "",
      }));
    }

    // merge: every course with its absence count + records; plus any
    // custom module names the student recorded that aren't in the course list
    const courses = courseNames.map((c) => {
      const recs = records.filter((r) => r.moduleName === c.name);
      return { name: c.name, count: recs.length, records: recs };
    });
    const known = new Set(courseNames.map((c) => c.name));
    for (const r of records) {
      if (!known.has(r.moduleName)) {
        courses.push({ name: r.moduleName, count: 1, records: [r] });
        known.add(r.moduleName);
      }
    }

    return NextResponse.json({ courses, totalAbsences: records.length });
  } catch (e) {
    return NextResponse.json({ courses: [], totalAbsences: 0 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  try {
    const body = await req.json();
    const moduleName = String(body?.moduleName ?? "").trim();
    const date = String(body?.date ?? "").trim();
    if (!moduleName) return NextResponse.json({ error: "اسم المقياس مطلوب" }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "التاريخ مطلوب (صيغة غير صحيحة)" }, { status: 400 });
    }

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("attendance_records")
        .insert({
          owner_id: ownerKey(user.id),
          module_name: moduleName,
          date,
          status: "غائب",
        })
        .select("id, module_name, date, created_at")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({
        record: {
          id: Number(data.id), moduleName: String(data.module_name ?? ""),
          date: String(data.date ?? ""), createdAt: String(data.created_at ?? ""),
        },
      });
    }
    const record = await db.attendanceRecord.create({
      data: {
        ownerId: ownerKey(user.id),
        moduleName,
        date,
        status: "غائب",
      } as never,
    });
    return NextResponse.json({
      record: {
        id: record.id, moduleName: record.moduleName, date: record.date,
        createdAt: record.createdAt?.toISOString?.() ?? "",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      // owner check is part of the WHERE clause — a user can only ever
      // delete their OWN records (spec §18)
      const { error, count } = await supabase
        .from("attendance_records")
        .delete({ count: "exact" })
        .eq("id", parseInt(id))
        .eq("owner_id", ownerKey(user.id));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if ((count ?? 0) === 0) return NextResponse.json({ error: "السجل غير موجود" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }
    const existing = await db.attendanceRecord.findFirst({
      where: { id: parseInt(id), ownerId: ownerKey(user.id) } as never,
    });
    if (!existing) return NextResponse.json({ error: "السجل غير موجود" }, { status: 404 });
    await db.attendanceRecord.delete({ where: { id: parseInt(id) } } as never);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
