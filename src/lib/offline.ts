/**
 * round 61 — offline-first session & data cache (owner: «offline is what I
 * consider important»; his report: with the network off, the login screen
 * showed «You're offline» and logging in became impossible).
 *
 * Three device-local stores power the offline experience:
 *
 *  1. talib-cached-user — the last server-confirmed SessionUser. When
 *     /api/auth/me can't be reached and the browser reports offline, the
 *     auth provider restores THIS instead of dropping the student to the
 *     login screen (a reload offline used to log them out visually).
 *
 *  2. talib-last-login — the email+name of the last SUCCESSFUL signin on
 *     this device. Sign-in uses no password (name+email only), so an exact
 *     match against this record while offline is the same verification bar
 *     as the online flow itself → grants an offline session.
 *
 *  3. talib-ocache:<url> — the last successful GET payload of the main
 *     read screens (courses / schedule / exams / announcements). When a
 *     fetch throws offline, screens serve this copy and badge it as saved
 *     data instead of showing a connection error.
 *
 * Everything degrades silently: private mode / disabled storage just means
 * no offline bridge.
 */
import type { SessionUser } from "@/lib/auth/types";

const CACHED_USER_KEY = "talib-cached-user";
const LAST_LOGIN_KEY = "talib-last-login";
const OCACHE_PREFIX = "talib-ocache:";
const OCACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days — old data is better than no data

export interface LastLogin {
  email: string; // normalized (trim + lowercase) at write time
  fullName: string; // trimmed at write time
}

// ── 1. cached session user ────────────────────────────────────────────

export function readCachedUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHED_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionUser;
    // minimal shape check — a corrupted row must never become a session
    if (typeof parsed?.id !== "number" || typeof parsed?.email !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedUser(user: SessionUser): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
  } catch {
    /* storage disabled / quota — offline restore simply won't work */
  }
}

export function clearCachedUser(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(CACHED_USER_KEY);
  } catch {
    /* ignore */
  }
}

// ── 2. last successful login (offline sign-in bridge) ─────────────────

export function readLastLogin(): LastLogin | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAST_LOGIN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastLogin;
    if (typeof parsed?.email !== "string" || typeof parsed?.fullName !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeLastLogin(fullName: string, email: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      LAST_LOGIN_KEY,
      JSON.stringify({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
      })
    );
  } catch {
    /* storage disabled — offline login simply won't be offered */
  }
}

export function clearLastLogin(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LAST_LOGIN_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Mirror of the server's signInUser match: email trimmed+lowercased, name
 * trimmed, exact equality. Keep in sync with src/lib/auth/service.ts.
 */
export function matchesLastLogin(fullName: string, email: string): boolean {
  const last = readLastLogin();
  if (!last) return false;
  return (
    email.trim().toLowerCase() === last.email && fullName.trim() === last.fullName
  );
}

// ── 2b. sign-out markers (round 61) ────────────────────────────────────
// localStorage: an EXPLICIT sign-out must never be resurrected by the
// offline session restore — the flag blocks restore until the next
// successful sign-in (online or offline grant).
const SIGNED_OUT_KEY = "talib-signed-out";
// sessionStorage: the sign-out POST could not reach the server (offline) —
// the still-valid cookie must be killed on the first online sync.
const PENDING_SIGNOUT_KEY = "talib-pending-signout";

export function isSignedOutFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SIGNED_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSignedOutFlag(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SIGNED_OUT_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearSignedOutFlag(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SIGNED_OUT_KEY);
  } catch {
    /* ignore */
  }
}

export function setPendingSignout(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PENDING_SIGNOUT_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** true exactly once after an offline sign-out (consumes the marker). */
export function consumePendingSignout(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(PENDING_SIGNOUT_KEY) === "1") {
      sessionStorage.removeItem(PENDING_SIGNOUT_KEY);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** non-consuming check (drives the back-online follow-through). */
export function hasPendingSignout(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(PENDING_SIGNOUT_KEY) === "1";
  } catch {
    return false;
  }
}

// ── 3. offline GET cache for the main read screens ────────────────────

interface OCacheEntry {
  savedAt: number;
  payload: unknown;
}

export interface OfflineGetResult<T> {
  data: T;
  /** "network" = fresh from the server; "cache" = saved copy served offline */
  source: "network" | "cache";
  savedAt: number | null;
}

function ocacheRead(url: string): OCacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(OCACHE_PREFIX + url);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OCacheEntry;
    if (typeof parsed?.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > OCACHE_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function ocacheWrite(url: string, payload: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(OCACHE_PREFIX + url, JSON.stringify({ savedAt: Date.now(), payload }));
  } catch {
    /* quota — skip caching, online still works */
  }
}

/**
 * GET + cache for read screens. Behaviour:
 *  • network OK → cache the payload, return { source: "network" }.
 *  • fetch THROWS (offline — and note navigator.onLine can still be true
 *    behind dead captive portals / flaky VPNs, so a network-level failure
 *    is the real signal) AND a fresh-enough cache exists →
 *    return { source: "cache", savedAt } (the screen badges it).
 *  • anything else (non-OK HTTP, no cache) → null; the caller keeps its
 *    existing error/empty handling.
 */
export async function offlineCachedGet<T>(
  url: string,
  pick: (raw: unknown) => T
): Promise<OfflineGetResult<T> | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null; // server answered (e.g. 401) — not our call to fake data
    const raw = await res.json();
    const data = pick(raw);
    ocacheWrite(url, raw);
    return { data, source: "network", savedAt: null };
  } catch {
    // network-level failure: the device cache is the last-known truth
    const entry = ocacheRead(url);
    if (entry) return { data: pick(entry.payload), source: "cache", savedAt: entry.savedAt };
    return null;
  }
}

/** Format a cache timestamp for the «بيانات محفوظة» chip (ar-DZ locale). */
export function formatSavedAt(ts: number): string {
  try {
    return new Intl.DateTimeFormat("ar-DZ", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ts));
  } catch {
    return "";
  }
}
