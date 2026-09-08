import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

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
      // round 55 — بيانات الفوج للمجموعة الأم/الفرعي (نفس منطق فرع Prisma)
      let cohort: {
        id: number; groupName: string; subGroup: string; parentGroupName: string;
      } | null = null;
      try {
        const { data: cohortRows } = await supabase
          .from("cohort_groups")
          .select("id, group_name, sub_group, study_groups(group_name)")
          .eq("id", parseInt(cohortId))
          .maybeSingle();
        const row = cohortRows as
          | { id: number; group_name: string; sub_group: string; study_groups: { group_name: string } | { group_name: string }[] | null }
          | null;
        if (row) {
          const parent = Array.isArray(row.study_groups) ? row.study_groups[0] : row.study_groups;
          cohort = {
            id: Number(row.id),
            groupName: String(row.group_name ?? ""),
            subGroup: String(row.sub_group ?? ""),
            parentGroupName: String(parent?.group_name ?? ""),
          };
        }
      } catch { /* metadata is best-effort — members list is the core */ }
      return NextResponse.json({ members, cohort });
    }
    const items = await db.appUser.findMany({
      where: { scopeCohortGroupId: parseInt(cohortId) },
      orderBy: { fullName: "asc" },
    });
    // round 55 (طلب المالك: حسابه في «الفوج 7» من «المجموعة 2» وشاشة
    // الفوج لا تُظهر الرقم) — أضفنا بيانات الفوج نفسه: اسمه، مجموعته
    // الأم، وفوجه الفرعي، لتعرضها شاشة الفوج في بطاقة «فوجك الدراسي».
    const cohortRow = await db.cohortGroup.findUnique({
      where: { id: parseInt(cohortId) },
      include: { group: true },
    });
    return NextResponse.json({
      members: items.map((m) => ({ id: m.id, fullName: m.fullName, role: m.role, groupNumber: m.groupNumber })),
      cohort: cohortRow
        ? {
            id: cohortRow.id,
            groupName: cohortRow.groupName,
            subGroup: cohortRow.subGroup ?? "",
            parentGroupName: cohortRow.group?.groupName ?? "",
          }
        : null,
    });
  } catch (e) {
    return NextResponse.json({ members: [] });
  }
}
