/**
 * Notification Preferences API — round 24 (notification system completion).
 *
 * GET → { available: boolean, mutedTypes: string[] }
 *        Own preferences only. `available: false` means the
 *        notification_prefs table has not been created in this
 *        environment yet (Supabase: run download/supabase_notification_prefs.sql).
 *        The UI shows a hint instead of silently pretending.
 *
 * PUT { mutedTypes: string[] } → { available: true, mutedTypes: string[] }
 *        Validates against the known category list; unknown names are dropped.
 *        Own row only: userId comes from the session, never the body.
 *        When the table is missing → 501 + clear message (nothing is lost:
 *        the emitter treats "no prefs row" as "nothing muted").
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { MUTABLE_CATEGORIES, parseMutedTypes } from "@/lib/notifications";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

const TABLE_MISSING_HINTS = [
  "PGRST205", // schemaCacheMiss / table not found in OpenAPI spec
  "Could not find the table",
  "does not exist",
  "relation",
];

function tableMissing(message: string): boolean {
  return TABLE_MISSING_HINTS.some((h) => message.includes(h));
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("notification_prefs")
        .select("muted_types")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) {
        if (tableMissing(error.message)) {
          return NextResponse.json({ available: false, mutedTypes: [] });
        }
        console.error("[notif-prefs] GET failed:", error.message);
        return NextResponse.json({ available: false, mutedTypes: [] });
      }
      return NextResponse.json({
        available: true,
        mutedTypes: parseMutedTypes(String(data?.muted_types ?? "[]")),
      });
    }
    const row = await db.notificationPref.findUnique({ where: { userId: user.id } });
    return NextResponse.json({
      available: true,
      mutedTypes: parseMutedTypes(row?.mutedTypes ?? "[]"),
    });
  } catch (e) {
    console.error("[notif-prefs] GET failed:", (e as Error).message);
    return NextResponse.json({ available: false, mutedTypes: [] });
  }
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    // validate: keep only known categories (silently drop junk)
    const rawList: unknown[] = Array.isArray((body as Record<string, unknown>)?.mutedTypes)
      ? ((body as Record<string, unknown>).mutedTypes as unknown[])
      : [];
    const mutedTypes = rawList
      .map((x) => String(x))
      .filter((x) => (MUTABLE_CATEGORIES as readonly string[]).includes(x));
    const serialized = JSON.stringify(Array.from(new Set(mutedTypes)));

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("notification_prefs")
        .upsert({ user_id: user.id, muted_types: serialized, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
        .select("muted_types")
        .single();
      if (error) {
        if (tableMissing(error.message)) {
          return NextResponse.json(
            { error: "جدول تفضيلات الإشعارات غير منشأ بعد — نفّذ download/supabase_notification_prefs.sql في محرر SQL ثم أعد المحاولة" },
            { status: 501 }
          );
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({
        available: true,
        mutedTypes: parseMutedTypes(String(data?.muted_types ?? "[]")),
      });
    }
    const row = await db.notificationPref.upsert({
      where: { userId: user.id },
      create: { userId: user.id, mutedTypes: serialized },
      update: { mutedTypes: serialized },
    });
    return NextResponse.json({
      available: true,
      mutedTypes: parseMutedTypes(row.mutedTypes),
    });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
