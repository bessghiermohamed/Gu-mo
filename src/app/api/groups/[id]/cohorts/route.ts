/**
 * Cohorts inside a Study Group
 * - GET: list cohorts linked to a group (?id=groupId in the URL param)
 *   Uses the [id] dynamic segment from the route path.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { fetchCohortsByGroup } from "@/lib/data-layer";

const isVercel = process.env.VERCEL === "1";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "غير مسجّل الدخول" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const groupId = parseInt(id);
    if (Number.isNaN(groupId)) {
      return NextResponse.json({ error: "معرّف المجموعة غير صالح" }, { status: 400 });
    }

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("cohort_groups")
        .select("*")
        .eq("group_id", groupId)
        .order("id", { ascending: true });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ cohorts: data ?? [] });
    }

    // Use shared data-layer (handles local Prisma with groupId lookup).
    const cohorts = await fetchCohortsByGroup(groupId);
    return NextResponse.json({ cohorts });
  } catch (e) {
    return NextResponse.json(
      { error: `خطأ داخلي: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
