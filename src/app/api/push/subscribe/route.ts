/**
 * Push subscription API — round 56 («إشعارات خارج المتصفح»).
 *
 *   GET              → { publicKey } | { available: false }  (client boot)
 *   POST   { sub }   → save/refresh this browser's subscription (upsert by
 *                      endpoint: a browser refreshes its keys sometimes)
 *   DELETE { sub }   → remove the subscription (user turned it off / cleared)
 *
 * Storage: push_subscriptions (Prisma locally / Supabase in production —
 * download/supabase_push_subscriptions.sql). Failures are graceful: the
 * app never breaks because push storage is unavailable.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/service";
import { getVapidPublicKey } from "@/lib/push";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

interface SubBody {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

function validate(sub: SubBody): { endpoint: string; p256dh: string; auth: string } | null {
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return null;
  return { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth };
}

export async function GET() {
  return NextResponse.json({ publicKey: getVapidPublicKey() });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  try {
    const body = (await req.json()) as SubBody;
    const sub = validate(body);
    if (!sub) return NextResponse.json({ error: "اشتراك غير صالح" }, { status: 400 });
    const userAgent = req.headers.get("user-agent") ?? "";

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      // upsert on endpoint (unique) — a refreshed subscription replaces its row
      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: user.id,
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
          user_agent: userAgent.slice(0, 300),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" }
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    await db.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: {
        userId: user.id,
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        userAgent: userAgent.slice(0, 300),
      },
      update: { userId: user.id, p256dh: sub.p256dh, auth: sub.auth },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  try {
    const body = (await req.json().catch(() => ({}))) as SubBody;
    if (!body?.endpoint) return NextResponse.json({ error: "endpoint مطلوب" }, { status: 400 });

    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", user.id)
        .eq("endpoint", body.endpoint);
    } else {
      await db.pushSubscription.deleteMany({
        where: { userId: user.id, endpoint: body.endpoint },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: `خطأ: ${(e as Error).message}` }, { status: 500 });
  }
}
