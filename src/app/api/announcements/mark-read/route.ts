/**
 * Mark announcements as read — fix (R12): the unread badge counted
 * announcements missing from `notification_read_states`, but NOTHING ever
 * wrote that table — the badge could only grow, teaching students to ignore
 * it (and with it, the whole bell icon).
 *
 * POST { ids: [1, 2, ...] }  → mark those announcement ids read for the caller
 * POST { all: true }         → mark every currently visible announcement read
 *
 * Own rows only: user_id is taken from the session, never from the body.
 * Insert-only (missing rows are looked up first) so re-visits never fail on
 * duplicate keys regardless of which unique constraint exists in prod.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { fetchAnnouncements } from "@/lib/data-layer";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const ids: number[] = Array.isArray(body.ids)
      ? body.ids.map((x: unknown) => Number(x)).filter((n: number) => Number.isFinite(n))
      : [];
    const markAll = body.all === true;

    let targetIds = ids;
    if (markAll) {
      const announcements = await fetchAnnouncements(user.assignedSpecialtyId);
      targetIds = announcements.map((a) => a.id);
    }
    if (targetIds.length === 0) return NextResponse.json({ ok: true, inserted: 0 });

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data: existing } = await supabase
        .from("notification_read_states")
        .select("announcement_id")
        .eq("user_id", user.id);
      const have = new Set((existing ?? []).map((r: Record<string, unknown>) => Number(r.announcement_id)));
      const fresh = targetIds
        .filter((id) => !have.has(id))
        .map((announcement_id) => ({ user_id: user.id, announcement_id }));
      if (fresh.length === 0) return NextResponse.json({ ok: true, inserted: 0 });
      const { error } = await supabase.from("notification_read_states").insert(fresh);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, inserted: fresh.length });
    }

    const existing = await db.notificationReadState.findMany({
      where: { userId: user.id, announcementId: { in: targetIds } } as never,
      select: { announcementId: true },
    });
    const have = new Set(existing.map((r) => r.announcementId));
    const fresh = targetIds.filter((id) => !have.has(id));
    if (fresh.length === 0) return NextResponse.json({ ok: true, inserted: 0 });
    await db.notificationReadState.createMany({
      data: fresh.map((announcementId) => ({ userId: user.id, announcementId })) as never,
      skipDuplicates: true,
    });
    return NextResponse.json({ ok: true, inserted: fresh.length });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
