/**
 * Assignments API
 * - GET: list assignments for the user's specialty (joined with module)
 * - POST: create a new assignment (supervisors only, canCreateModules)
 * - PATCH/DELETE (round 6): assignments could be added but never corrected
 *   or removed — a wrong due date or title was permanent. Scope check goes
 *   through the assignment's module → specialty (non-OWNER callers may only
 *   touch assignments of their own specialty).
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canCreateModules } from "@/lib/auth/permissions";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "غير مسجّل الدخول" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const moduleId = url.searchParams.get("moduleId");
    const specialtyId = user.assignedSpecialtyId;

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      let query = supabase
        .from("assignments")
        .select(
          "id, module_id, title, due_date, description, max_score, visibility_scope, target_group, created_at, module_courses!assignments_module_id_fkey(specialty_id)"
        )
        .eq("module_courses.specialty_id", specialtyId);
      if (moduleId) {
        query = query.eq("module_id", parseInt(moduleId));
      }
      const { data, error } = await query.order("id", { ascending: false });
      if (error) {
        // Fall back to simple list without join filter
        const fallback = await supabase
          .from("assignments")
          .select("*")
          .order("id", { ascending: false });
        return NextResponse.json({ assignments: fallback.data ?? [] });
      }
      return NextResponse.json({ assignments: data ?? [] });
    }

    const where: Record<string, unknown> = {
      module: { specialtyId },
    };
    if (moduleId) where.moduleId = parseInt(moduleId);
    const assignments = await db.assignment.findMany({
      where: where as never,
      orderBy: { id: "desc" },
      include: { module: { select: { name: true, code: true } } },
    });
    return NextResponse.json({ assignments });
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
  if (!canCreateModules(user)) {
    return NextResponse.json(
      { error: "غير مصرّح: إنشاء الواجبات يتطلب صلاحية مدير تخصص" },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const {
      moduleId,
      title,
      dueDate,
      description,
      maxScore,
      visibilityScope,
      targetGroup,
    } = body ?? {};

    if (!moduleId || !title || !dueDate) {
      return NextResponse.json(
        { error: "الحقول المطلوبة: moduleId, title, dueDate" },
        { status: 400 }
      );
    }

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("assignments")
        .insert({
          module_id: Number(moduleId),
          title: String(title).trim(),
          due_date: String(dueDate),
          description: String(description ?? ""),
          max_score: Number(maxScore ?? 20.0),
          visibility_scope: String(visibilityScope ?? "تخصص كامل"),
          target_group: String(targetGroup ?? "الكل"),
        })
        .select()
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ assignment: data });
    }

    const assignment = await db.assignment.create({
      data: {
        moduleId: Number(moduleId),
        title: String(title).trim(),
        dueDate: String(dueDate),
        description: String(description ?? ""),
        maxScore: Number(maxScore ?? 20.0),
        visibilityScope: String(visibilityScope ?? "تخصص كامل"),
        targetGroup: String(targetGroup ?? "الكل"),
      },
    });
    return NextResponse.json({ assignment });
  } catch (e) {
    return NextResponse.json(
      { error: `خطأ داخلي: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "غير مسجّل الدخول" }, { status: 401 });
  }
  if (!canCreateModules(user)) {
    return NextResponse.json(
      { error: "غير مصرّح: تعديل الواجبات يتطلب صلاحية مدير تخصص" },
      { status: 403 }
    );
  }
  try {
    const body = await req.json();
    const { id, title, dueDate, description, maxScore } = body ?? {};
    if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
    const trimTitle = title?.trim();
    if (title !== undefined && !trimTitle) {
      return NextResponse.json({ error: "عنوان الواجب لا يمكن أن يكون فارغاً" }, { status: 400 });
    }
    if (dueDate !== undefined && !String(dueDate).trim()) {
      return NextResponse.json({ error: "تاريخ التسليم غير صالح" }, { status: 400 });
    }
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: asg } = await supabase
        .from("assignments")
        .select("id, title, module_id, module_courses!assignments_module_id_fkey(specialty_id)")
        .eq("id", Number(id))
        .maybeSingle();
      if (!asg) return NextResponse.json({ error: "الواجب غير موجود" }, { status: 404 });
      const moduleSpecialty = Number(
        Array.isArray((asg as Record<string, unknown>).module_courses)
          ? ((asg as Record<string, unknown>).module_courses as Array<Record<string, unknown>>)[0]?.specialty_id
          : ((asg as Record<string, unknown>).module_courses as Record<string, unknown> | null)?.specialty_id
      );
      if (user.role !== "OWNER" && moduleSpecialty !== user.assignedSpecialtyId) {
        return NextResponse.json({ error: "هذا الواجب خارج نطاق تخصصك" }, { status: 403 });
      }
      const patch: Record<string, unknown> = {};
      if (trimTitle) patch.title = trimTitle;
      if (dueDate !== undefined) patch.due_date = String(dueDate).trim();
      if (description !== undefined) patch.description = String(description).trim();
      if (maxScore !== undefined && !Number.isNaN(Number(maxScore))) patch.max_score = Number(maxScore);
      const { data, error } = await supabase
        .from("assignments").update(patch).eq("id", Number(id)).select().single();
      if (error || !data) {
        return NextResponse.json({ error: `فشل التحديث: ${error?.message ?? "خطأ"}` }, { status: 500 });
      }
      return NextResponse.json({ assignment: data });
    }
    const asg = await db.assignment.findUnique({
      where: { id: Number(id) },
      select: { moduleId: true, module: { select: { specialtyId: true } } },
    });
    if (!asg) return NextResponse.json({ error: "الواجب غير موجود" }, { status: 404 });
    if (user.role !== "OWNER" && asg.module.specialtyId !== user.assignedSpecialtyId) {
      return NextResponse.json({ error: "هذا الواجب خارج نطاق تخصصك" }, { status: 403 });
    }
    const updated = await db.assignment.update({
      where: { id: Number(id) },
      data: {
        ...(trimTitle ? { title: trimTitle } : {}),
        ...(dueDate !== undefined ? { dueDate: String(dueDate).trim() } : {}),
        ...(description !== undefined ? { description: String(description).trim() } : {}),
        ...(maxScore !== undefined && !Number.isNaN(Number(maxScore)) ? { maxScore: Number(maxScore) } : {}),
      },
    });
    return NextResponse.json({ assignment: updated });
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
  if (!canCreateModules(user)) {
    return NextResponse.json(
      { error: "غير مصرّح: حذف الواجبات يتطلب صلاحية مدير تخصص" },
      { status: 403 }
    );
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
  const asgId = parseInt(id);
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: asg } = await supabase
        .from("assignments")
        .select("id, module_id, module_courses!assignments_module_id_fkey(specialty_id)")
        .eq("id", asgId)
        .maybeSingle();
      if (!asg) return NextResponse.json({ error: "الواجب غير موجود" }, { status: 404 });
      const moduleSpecialty = Number(
        Array.isArray((asg as Record<string, unknown>).module_courses)
          ? ((asg as Record<string, unknown>).module_courses as Array<Record<string, unknown>>)[0]?.specialty_id
          : ((asg as Record<string, unknown>).module_courses as Record<string, unknown> | null)?.specialty_id
      );
      if (user.role !== "OWNER" && moduleSpecialty !== user.assignedSpecialtyId) {
        return NextResponse.json({ error: "هذا الواجب خارج نطاق تخصصك" }, { status: 403 });
      }
      const { error } = await supabase.from("assignments").delete().eq("id", asgId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const asg = await db.assignment.findUnique({
        where: { id: asgId },
        select: { module: { select: { specialtyId: true } } },
      });
      if (!asg) return NextResponse.json({ error: "الواجب غير موجود" }, { status: 404 });
      if (user.role !== "OWNER" && asg.module.specialtyId !== user.assignedSpecialtyId) {
        return NextResponse.json({ error: "هذا الواجب خارج نطاق تخصصك" }, { status: 403 });
      }
      await db.assignment.delete({ where: { id: asgId } });
    }
    return NextResponse.json({ ok: true, message: "تم حذف الواجب" });
  } catch (e) {
    return NextResponse.json(
      { error: `خطأ داخلي: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
