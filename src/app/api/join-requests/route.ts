/**
 * Join Requests API
 * - GET: list pending join requests visible to the current reviewer
 *        (supervisors with canReviewJoinRequests)
 * - POST: a STUDENT creates a new join request for a cohort
 *
 * NOTE: Prisma may not have a JoinRequest model locally; we use the
 * `(db as never).joinRequest` cast pattern as src/lib/data-layer.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { canReviewJoinRequests } from "@/lib/auth/permissions";

const isVercel = process.env.VERCEL === "1";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "غير مسجّل الدخول" }, { status: 401 });
  }
  if (!canReviewJoinRequests(user)) {
    return NextResponse.json(
      { error: "غير مصرّح: مراجعة الطلبات تتطلب صلاحية إشراف" },
      { status: 403 }
    );
  }

  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      let query = supabase
        .from("join_requests")
        .select(
          `id, requester_id, cohort_id, group_id, status, message, reviewer_note, created_at, reviewed_at,
           app_users!join_requests_requester_id_fkey(full_name),
           cohort_groups!join_requests_cohort_id_fkey(group_name)`
        )
        .eq("status", "pending");
      // Representative scope: limit to their cohort
      if (user.role === "REPRESENTATIVE" && user.scopeCohortGroupId) {
        query = query.eq("cohort_id", user.scopeCohortGroupId);
      }
      const { data, error } = await query.order("created_at", {
        ascending: false,
      });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const requests = (data ?? []).map((r: Record<string, unknown>) => {
        const requester = r.app_users as Record<string, unknown> | null;
        const cohort = r.cohort_groups as Record<string, unknown> | null;
        return {
          id: Number(r.id),
          requesterId: Number(r.requester_id ?? 0),
          requesterName: String(requester?.full_name ?? ""),
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

    const where: Record<string, unknown> = { status: "pending" };
    if (user.role === "REPRESENTATIVE" && user.scopeCohortGroupId) {
      where.cohortId = user.scopeCohortGroupId;
    } else {
      where.cohort = { specialtyId: user.assignedSpecialtyId };
    }
    const items =
      (await (db as never).joinRequest?.findMany?.({
        where: where as never,
        include: {
          requester: { select: { fullName: true } },
          cohort: { select: { groupName: true } },
        },
        orderBy: { createdAt: "desc" },
      })) ?? [];
    const requests = items.map((r: Record<string, unknown>) => ({
      id: Number(r.id),
      requesterId: Number(r.requesterId ?? 0),
      requesterName: String(
        (r.requester as Record<string, unknown> | undefined)?.fullName ?? ""
      ),
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

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "غير مسجّل الدخول" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { cohortId, groupId, message } = body ?? {};

    if (!cohortId) {
      return NextResponse.json(
        { error: "cohortId مطلوب" },
        { status: 400 }
      );
    }

    const cohortIdNum = Number(cohortId);
    const groupIdNum = groupId ? Number(groupId) : null;

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      // Look up cohort name for snapshot
      const { data: cohort } = await supabase
        .from("cohort_groups")
        .select("group_name")
        .eq("id", cohortIdNum)
        .maybeSingle();
      const { data, error } = await supabase
        .from("join_requests")
        .insert({
          requester_id: user.id,
          cohort_id: cohortIdNum,
          group_id: groupIdNum,
          status: "pending",
          message: String(message ?? ""),
          reviewer_note: "",
          cohort_name: cohort?.group_name ?? "",
          requester_name: user.fullName,
        })
        .select()
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ request: data });
    }

    const created = await (db as never).joinRequest.create({
      data: {
        requesterId: user.id,
        requesterName: user.fullName,
        cohortId: cohortIdNum,
        groupId: groupIdNum,
        status: "pending",
        message: String(message ?? ""),
        reviewerNote: "",
        cohortName: "",
      },
    });
    return NextResponse.json({ request: created });
  } catch (e) {
    return NextResponse.json(
      { error: `خطأ داخلي: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
