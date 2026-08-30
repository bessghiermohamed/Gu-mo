/**
 * Cohort Members API
 * - GET: list members of a cohort by ?cohortId=X
 *   Returns minimal user fields (id, fullName, email, studentId, role).
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";

const isVercel = process.env.VERCEL === "1";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "غير مسجّل الدخول" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const cohortId = url.searchParams.get("cohortId");
    if (!cohortId) {
      return NextResponse.json(
        { error: "cohortId مطلوب" },
        { status: 400 }
      );
    }
    const cohortIdNum = parseInt(cohortId);

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("app_users")
        .select("id, full_name, email, student_id, role, scope_cohort_group_id")
        .eq("scope_cohort_group_id", cohortIdNum)
        .order("full_name", { ascending: true });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const members = (data ?? []).map((m: Record<string, unknown>) => ({
        id: Number(m.id),
        fullName: String(m.full_name ?? ""),
        email: String(m.email ?? ""),
        studentId: String(m.student_id ?? ""),
        role: String(m.role ?? "STUDENT"),
      }));
      return NextResponse.json({ members });
    }

    const members = await db.appUser.findMany({
      where: { scopeCohortGroupId: cohortIdNum },
      select: {
        id: true,
        fullName: true,
        email: true,
        studentId: true,
        role: true,
      },
      orderBy: { fullName: "asc" },
    });
    return NextResponse.json({ members });
  } catch (e) {
    return NextResponse.json(
      { error: `خطأ داخلي: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
