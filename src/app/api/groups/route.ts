/**
 * Study Groups API
 * - GET: list study groups (optional ?specialtyId, ?academicYearId, ?trackId)
 * - POST: create a new study group (supervisors only, canCreateGroups)
 * - DELETE: delete a study group by ?id=X (only if no cohorts are linked to it)
 *
 * NOTE: In Prisma the StudyGroup model may not exist locally; we use the same
 * `(db as never).studyGroup` cast pattern as src/lib/data-layer.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canCreateGroups } from "@/lib/auth/permissions";

const isVercel = process.env.VERCEL === "1";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const specialtyId = url.searchParams.get("specialtyId");
    const academicYearId = url.searchParams.get("academicYearId");
    const trackId = url.searchParams.get("trackId");

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      let query = supabase.from("study_groups").select("*");
      if (specialtyId) {
        query = query.eq("specialty_id", parseInt(specialtyId));
      }
      if (academicYearId) {
        query = query.eq("academic_year_id", parseInt(academicYearId));
      }
      if (trackId) {
        query = query.eq("track_id", parseInt(trackId));
      }
      const { data, error } = await query.order("id", { ascending: true });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ groups: data ?? [] });
    }

    const where: Record<string, unknown> = {};
    if (specialtyId) where.specialtyId = parseInt(specialtyId);
    if (academicYearId) where.academicYearId = parseInt(academicYearId);
    if (trackId) where.trackId = parseInt(trackId);

    const items =
      (await (db as never).studyGroup?.findMany?.({
        where: where as never,
        orderBy: { id: "asc" },
      })) ?? [];
    return NextResponse.json({ groups: items });
  } catch (e) {
    return NextResponse.json(
      { error: `خطأ داخلي: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "غير مسجّل الدخول" }, { status: 401 });
  }
  if (!canCreateGroups(user)) {
    return NextResponse.json(
      { error: "غير مصرّح: إنشاء المجموعات يتطلب صلاحية إشراف" },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const {
      specialtyId,
      academicYearId,
      trackId,
      groupName,
      description,
    } = body ?? {};

    if (!specialtyId || !academicYearId || !groupName) {
      return NextResponse.json(
        { error: "الحقول المطلوبة: specialtyId, academicYearId, groupName" },
        { status: 400 }
      );
    }

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("study_groups")
        .insert({
          specialty_id: Number(specialtyId),
          academic_year_id: Number(academicYearId),
          track_id: trackId ? Number(trackId) : null,
          group_name: String(groupName).trim(),
          description: String(description ?? ""),
        })
        .select()
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ group: data });
    }

    const group = await (db as never).studyGroup.create({
      data: {
        specialtyId: Number(specialtyId),
        academicYearId: Number(academicYearId),
        trackId: trackId ? Number(trackId) : null,
        groupName: String(groupName).trim(),
        description: String(description ?? ""),
      },
    });
    return NextResponse.json({ group });
  } catch (e) {
    return NextResponse.json(
      { error: `خطأ داخلي: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "غير مسجّل الدخول" }, { status: 401 });
  }
  if (!canCreateGroups(user)) {
    return NextResponse.json(
      { error: "غير مصرّح: حذف المجموعات يتطلب صلاحية إشراف" },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
  }

  try {
    const groupId = parseInt(id);

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      // Safety check: no cohorts linked to this group
      const { data: linkedCohorts, error: lookupErr } = await supabase
        .from("cohort_groups")
        .select("id")
        .eq("group_id", groupId);
      if (lookupErr) {
        return NextResponse.json({ error: lookupErr.message }, { status: 500 });
      }
      if (linkedCohorts && linkedCohorts.length > 0) {
        return NextResponse.json(
          {
            error: `لا يمكن حذف المجموعة: ${linkedCohorts.length} فوج مُلحق بها. انقلهم أولاً.`,
          },
          { status: 400 }
        );
      }
      const { error } = await supabase
        .from("study_groups")
        .delete()
        .eq("id", groupId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      const linkedCohortsCount = await db.cohortGroup.count({
        where: { groupId } as never,
      });
      if (linkedCohortsCount > 0) {
        return NextResponse.json(
          {
            error: `لا يمكن حذف المجموعة: ${linkedCohortsCount} فوج مُلحق بها. انقلهم أولاً.`,
          },
          { status: 400 }
        );
      }
      await (db as never).studyGroup.delete({ where: { id: groupId } });
    }

    return NextResponse.json({ ok: true, message: "تم حذف المجموعة" });
  } catch (e) {
    return NextResponse.json(
      { error: `خطأ داخلي: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
