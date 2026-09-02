import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

/**
 * My join requests — round 10, review §3/§4.
 *
 * Enriched with createdAt / reviewedAt / message / reviewerNote so the
 * dedicated "طلباتي" panel can show the full lifecycle (pending →
 * approved / rejected / cancelled) with the reviewer's note — instead
 * of only an inline chip on each group card.
 */
export type MyRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ requests: [] });
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("join_requests")
        .select(
          `id, cohort_id, status, message, reviewer_note, created_at, reviewed_at,
           cohort_groups!join_requests_cohort_id_fkey(group_name)`
        )
        .eq("requester_id", user.id)
        .order("created_at", { ascending: false });
      if (error) return NextResponse.json({ requests: [] });
      const requests = (data ?? []).map((r: Record<string, unknown>) => {
        const cohort = r.cohort_groups as Record<string, unknown>;
        return {
          id: Number(r.id),
          cohortId: Number(r.cohort_id),
          status: String(r.status) as MyRequestStatus,
          cohortName: String(cohort?.group_name ?? ""),
          message: String(r.message ?? ""),
          reviewerNote: String(r.reviewer_note ?? ""),
          createdAt: r.created_at ?? null,
          reviewedAt: r.reviewed_at ?? null,
        };
      });
      return NextResponse.json({ requests });
    }
    const items = await db.joinRequest.findMany({
      where: { requesterId: user.id },
      include: { cohort: { select: { groupName: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      requests: items.map((r) => ({
        id: r.id,
        cohortId: r.cohortId,
        status: r.status as MyRequestStatus,
        cohortName: r.cohort?.groupName ?? "",
        message: r.message ?? "",
        reviewerNote: r.reviewerNote ?? "",
        createdAt: r.createdAt?.toISOString() ?? null,
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
      })),
    });
  } catch (e) {
    return NextResponse.json({ requests: [] });
  }
}
