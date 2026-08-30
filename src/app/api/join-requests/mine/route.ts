/**
 * My Join Requests API
 * - GET: list the current user's own join requests (any status)
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";

const isVercel = process.env.VERCEL === "1";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "غير مسجّل الدخول" }, { status: 401 });
  }

  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("join_requests")
        .select(
          `id, requester_id, cohort_id, group_id, status, message, reviewer_note, created_at, reviewed_at,
           cohort_groups!join_requests_cohort_id_fkey(group_name)`
        )
        .eq("requester_id", user.id)
        .order("created_at", { ascending: false });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const requests = (data ?? []).map((r: Record<string, unknown>) => {
        const cohort = r.cohort_groups as Record<string, unknown> | null;
        return {
          id: Number(r.id),
          requesterId: Number(r.requester_id ?? 0),
          cohortId: Number(r.cohort_id ?? 0),
          cohortName: String(cohort?.group_name ?? ""),
          groupId: r.group_id ? Number(r.group_id) : null,
          status: String(r.status ?? "pending"),
          message: String(r.message ?? ""),
          reviewerNote: String(r.reviewer_note ?? ""),
          createdAt: String(r.created_at ?? ""),
          reviewedAt: r.reviewed_at ? String(r.reviewed_at) : null,
        };
      });
      return NextResponse.json({ requests });
    }

    const items =
      (await (db as never).joinRequest?.findMany?.({
        where: { requesterId: user.id } as never,
        include: { cohort: { select: { groupName: true } } },
        orderBy: { createdAt: "desc" },
      })) ?? [];
    const requests = items.map((r: Record<string, unknown>) => ({
      id: Number(r.id),
      requesterId: Number(r.requesterId ?? 0),
      cohortId: Number(r.cohortId ?? 0),
      cohortName: String(
        (r.cohort as Record<string, unknown> | undefined)?.groupName ?? ""
      ),
      groupId: r.groupId ? Number(r.groupId) : null,
      status: String(r.status ?? "pending"),
      message: String(r.message ?? ""),
      reviewerNote: String(r.reviewerNote ?? ""),
      createdAt:
        r.createdAt instanceof Date
          ? (r.createdAt as Date).toISOString()
          : String(r.createdAt ?? ""),
      reviewedAt:
        r.reviewedAt instanceof Date
          ? (r.reviewedAt as Date).toISOString()
          : r.reviewedAt
          ? String(r.reviewedAt)
          : null,
    }));
    return NextResponse.json({ requests });
  } catch (e) {
    return NextResponse.json(
      { error: `خطأ داخلي: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
