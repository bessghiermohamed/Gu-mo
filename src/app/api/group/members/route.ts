import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";

const isVercel = process.env.VERCEL === "1";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ members: [] });
    const url = new URL(req.url);
    const cohortId = url.searchParams.get("cohortId");
    if (!cohortId) return NextResponse.json({ members: [] });
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("app_users")
        .select("id, full_name, role, group_number, scope_cohort_group_id")
        .eq("scope_cohort_group_id", parseInt(cohortId))
        .order("full_name", { ascending: true });
      if (error) return NextResponse.json({ members: [] });
      const members = (data ?? []).map((m: Record<string, unknown>) => ({
        id: Number(m.id), fullName: String(m.full_name ?? ""),
        role: String(m.role ?? "STUDENT"), groupNumber: String(m.group_number ?? ""),
      }));
      return NextResponse.json({ members });
    }
    const items = await db.appUser.findMany({
      where: { scopeCohortGroupId: parseInt(cohortId) },
      orderBy: { fullName: "asc" },
    });
    return NextResponse.json({
      members: items.map((m) => ({ id: m.id, fullName: m.fullName, role: m.role, groupNumber: m.groupNumber })),
    });
  } catch (e) {
    return NextResponse.json({ members: [] });
  }
}
