import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ requests: [] });
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("join_requests")
        .select(`id, cohort_id, status, cohort_groups!join_requests_cohort_id_fkey(group_name)`)
        .eq("requester_id", user.id)
        .order("created_at", { ascending: false });
      if (error) return NextResponse.json({ requests: [] });
      const requests = (data ?? []).map((r: Record<string, unknown>) => {
        const cohort = r.cohort_groups as Record<string, unknown>;
        return {
          id: Number(r.id), cohortId: Number(r.cohort_id),
          status: String(r.status) as "pending" | "approved" | "rejected",
          cohortName: String(cohort?.group_name ?? ""),
        };
      });
      return NextResponse.json({ requests });
    }
    const items = await (db as never).joinRequest.findMany({
      where: { requesterId: user.id } as never,
      include: { cohort: { select: { groupName: true } } } as never,
      orderBy: { createdAt: "desc" } as never,
    });
    return NextResponse.json({
      requests: items.map((r: never) => ({
        id: r.id, cohortId: r.cohortId, status: r.status, cohortName: r.cohort?.groupName ?? "",
      })),
    });
  } catch (e) {
    return NextResponse.json({ requests: [] });
  }
}
