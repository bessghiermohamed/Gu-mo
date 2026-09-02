/**
 * App Notifications API — round 10, review §3/§4.
 *
 * GET → { notifications: [...], unreadCount } — own notifications only,
 *       newest first, capped at 50. Powers the header bell badge + panel.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ notifications: [], unreadCount: 0 });
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("app_notifications")
        .select("id, type, title, body, meta, read_at, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) return NextResponse.json({ notifications: [], unreadCount: 0 });
      const notifications = (data ?? []).map((n: Record<string, unknown>) => ({
        id: Number(n.id),
        type: String(n.type ?? "generic"),
        title: String(n.title ?? ""),
        body: String(n.body ?? ""),
        meta: safeJson(String(n.meta ?? "{}")),
        readAt: n.read_at ?? null,
        createdAt: n.created_at ?? null,
      }));
      const unreadCount = notifications.filter((n: { readAt: unknown }) => n.readAt == null).length;
      return NextResponse.json({ notifications, unreadCount });
    }
    const rows = await db.appNotification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const notifications = rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      meta: safeJson(n.meta),
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    }));
    const unreadCount = notifications.filter((n) => n.readAt == null).length;
    return NextResponse.json({ notifications, unreadCount });
  } catch (e) {
    return NextResponse.json({ notifications: [], unreadCount: 0 });
  }
}

function safeJson(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}
