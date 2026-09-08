/**
 * Web Push sender — round 56 («إشعارات خارج المتصفح»).
 *
 * The owner asked for notifications that reach the student even when the
 * browser tab is closed — «مثل باقي التطبيقات». The 30s in-app poll only
 * works while the app is open; real outside-the-tab delivery needs the
 * Web Push protocol: a service worker (public/sw.js) subscribed to this
 * server's VAPID-identified pushes.
 *
 * Keys: NEXT_PUBLIC_VAPID_PUBLIC_KEY (safe to commit / bake into the
 * bundle) + VAPID_PRIVATE_KEY (server-only env — one-time owner action,
 * same pattern as GROQ_API_KEY). When the private key is absent every
 * call here degrades to a silent no-op, so the app works identically
 * before the owner configures the key.
 *
 * Delivery contract: best-effort, never throws. A failed/410 endpoint
 * is pruned so dead subscriptions don't accumulate.
 */
import webpush from "web-push";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const isVercel = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

/** Baked-in fallback public key (generated for this project; public by
 *  design — overridable via NEXT_PUBLIC_VAPID_PUBLIC_KEY to rotate). Its
 *  matching PRIVATE key was handed to the owner to set as VAPID_PRIVATE_KEY
 *  in Vercel (one-time). */
const FALLBACK_VAPID_PUBLIC =
  "BPsnPT3O_SM0bF1WfRk8UfunMjRfNZ6XPYcOgK2ul_oRBcJ06Pc1esATnavrhh29mVGoK-iDf4gPzWg3mvWPIRg";
const VAPID_SUBJECT = "mailto:talib-app@gu-mo.vercel.app";

let configured = false;

function pushEnabled(): boolean {
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!priv) return false;
  if (!configured) {
    webpush.setVapidDetails(
      VAPID_SUBJECT,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || FALLBACK_VAPID_PUBLIC,
      priv
    );
    configured = true;
  }
  return true;
}

export function getVapidPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || FALLBACK_VAPID_PUBLIC;
}

export interface PushPayload {
  title: string;
  body?: string;
  tag?: string;
  url?: string;
}

interface SubRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function loadSubscriptions(userIds: number[]): Promise<SubRow[]> {
  if (userIds.length === 0) return [];
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .in("user_id", userIds);
      if (error) return [];
      return (data ?? []).map((r: Record<string, unknown>) => ({
        id: Number(r.id),
        endpoint: String(r.endpoint),
        p256dh: String(r.p256dh),
        auth: String(r.auth),
      }));
    }
    const rows = await db.pushSubscription.findMany({
      where: { userId: { in: userIds } },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    return rows;
  } catch {
    return [];
  }
}

async function pruneSubscription(id: number): Promise<void> {
  try {
    if (isVercel) {
      const supabase = await createSupabaseServerClient();
      await supabase.from("push_subscriptions").delete().eq("id", id);
    } else {
      await db.pushSubscription.delete({ where: { id } });
    }
  } catch {
    // best-effort prune
  }
}

/** Fan a payload out to every subscription of the given users.
 *  Never throws; prunes gone/expired endpoints (410/404). */
export async function sendPushToUsers(
  userIds: number[],
  payload: PushPayload
): Promise<void> {
  if (userIds.length === 0 || !pushEnabled()) return;
  try {
    const subs = await loadSubscriptions(userIds);
    await Promise.allSettled(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify(payload),
            { TTL: 24 * 60 * 60, urgency: "normal" }
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await pruneSubscription(s.id);
          }
          // other errors (network, 5xx) — transient, skip
        }
      })
    );
  } catch {
    // never break the caller
  }
}
