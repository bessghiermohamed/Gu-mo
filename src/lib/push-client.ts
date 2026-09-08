"use client";

/**
 * Web Push client — round 56 («إشعارات خارج المتصفح — تلقائياً أو بإذن في
 * الجلسة الرابعة»).
 *
 * Owner's request, verbatim intent: notifications must reach the student
 * even outside the browser tab «like every other app», either:
 *   (a) enabled automatically — whenever the browser permission is already
 *       GRANTED, the service worker + subscription register silently at
 *       login; or
 *   (b) via a permission ask in the FOURTH session — we deliberately do
 *       NOT ambush a brand-new account (sessions 1-3 are busy with
 *       onboarding + the mandatory tour); from the 4th visit the app shows
 *       a designed pre-prompt (never the raw browser dialog first).
 *
 * Everything here is defensive: no service worker / no Notification API /
 * storage disabled → every path degrades to "not available", never throws.
 */

import { toast } from "sonner";

const SESSION_COUNT_KEY = "talib-session-count";
const PUSH_DISMISSED_KEY = "talib-push-dismissed";
/** The pre-prompt appears at (or after) this session number — the owner's
 *  «في الجلسة الرابعة». First three sessions stay clean. */
const PROMPT_AT_SESSION = 4;

const SW_URL = "/sw.js";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

/** Register (or reuse) the service worker. Returns null when unsupported. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    return await navigator.serviceWorker.register(SW_URL);
  } catch {
    return null;
  }
}

/** Ask the browser for notification permission (must be called from a
 *  user gesture — the pre-prompt's button). Returns the new state. */
export async function requestPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof Notification === "undefined") return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

/** Subscribe the (already permission-granted) browser to our pushes and
 *  persist the subscription server-side. Returns success. */
export async function subscribeToPush(): Promise<boolean> {
  if (!pushSupported()) return false;
  if (notificationPermission() !== "granted") return false;
  try {
    const reg = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);
    const keyRes = await fetch("/api/push/subscribe", { cache: "no-store" });
    const keyData = await keyRes.json();
    const publicKey: string | undefined = keyData?.publicKey;
    if (!publicKey) return false; // server push not configured — in-app only

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** urlBase64 → Uint8Array (VAPID key format required by pushManager). */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

// ---------------------------------------------------------------------------
// Session counting + the 4th-session pre-prompt decision
// ---------------------------------------------------------------------------

/** Count THIS app visit as a session (once per ShellInner mount = once per
 *  login/page-load). Returns the new total. Storage-safe. */
export function bumpSessionCount(): number {
  try {
    const next = Number(localStorage.getItem(SESSION_COUNT_KEY) ?? "0") + 1;
    localStorage.setItem(SESSION_COUNT_KEY, String(next));
    return next;
  } catch {
    return 1; // storage disabled — treat every visit as session #1 (no prompt)
  }
}

export function getSessionCount(): number {
  try {
    return Number(localStorage.getItem(SESSION_COUNT_KEY) ?? "0");
  } catch {
    return 0;
  }
}

/** The pre-prompt's «ليس الآن» — remembered forever; the manual toggle in
 *  الإعدادات stays the way back in. */
export function markPushDismissed(): void {
  try {
    localStorage.setItem(PUSH_DISMISSED_KEY, "1");
  } catch {
    // ignore
  }
}

export function pushDismissed(): boolean {
  try {
    return localStorage.getItem(PUSH_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Should the 4th-session pre-prompt appear NOW?
 *  true only when: push is supported, permission still "default" (never
 *  asked / not denied), the user hasn't dismissed it before, and the
 *  session counter has reached PROMPT_AT_SESSION. */
export function shouldPromptForPush(): boolean {
  if (!pushSupported()) return false;
  if (notificationPermission() !== "default") return false;
  if (pushDismissed()) return false;
  return getSessionCount() >= PROMPT_AT_SESSION;
}

// ---------------------------------------------------------------------------
// Login-time integration (called by the app shell)
// ---------------------------------------------------------------------------

export interface PushBootResult {
  /** whether the pre-prompt should be shown after this login */
  prompt: boolean;
}

/** Called once the user is authenticated and onboarding is done.
 *  (a) AUTO-ENABLE: permission already granted → subscribe silently.
 *  (b) count the session and decide whether the 4th-session pre-prompt
 *      is due. */
export async function pushBoot(opts: { skipSessionCount?: boolean } = {}): Promise<PushBootResult> {
  if (!pushSupported()) return { prompt: false };

  // (a) auto-enable path — granted permission means zero friction
  if (notificationPermission() === "granted") {
    const ok = await subscribeToPush();
    if (ok && !opts.skipSessionCount) {
      // refresh subscription silently — no toast spam on every login
    }
    return { prompt: false };
  }

  // (b) count the session (unless the caller says not to)
  if (!opts.skipSessionCount) bumpSessionCount();
  return { prompt: shouldPromptForPush() };
}

/** Full activation flow used by BOTH the 4th-session pre-prompt and the
 *  settings toggle: ask permission → subscribe → feedback toast. */
export async function activatePushWithPrompt(): Promise<"granted" | "denied" | "failed" | "unsupported"> {
  if (!pushSupported()) return "unsupported";
  const perm = await requestPermission();
  if (perm !== "granted") return perm === "denied" ? "denied" : "denied";
  const ok = await subscribeToPush();
  if (!ok) {
    toast.error("تعذّر تسجيل الإشعارات — حاول مرة أخرى من الإعدادات");
    return "failed";
  }
  toast.success("تم التفعيل — ستصلك الإشعارات حتى خارج المتصفح");
  return "granted";
}
