/**
 * Assignments API
 * - GET: list assignments for the user's specialty (joined with module)
 * - POST: create a new assignment (supervisors only, canCreateModules)
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
