"use client";

import * as React from "react";
import type { SessionUser, UserRole } from "@/lib/auth/types";
import { useI18n } from "@/components/talib/i18n-provider";
import {
  readCachedUser,
  writeCachedUser,
  readLastLogin,
  writeLastLogin,
  matchesLastLogin,
  isSignedOutFlag,
  setSignedOutFlag,
  clearSignedOutFlag,
  consumePendingSignout,
  hasPendingSignout,
  setPendingSignout,
} from "@/lib/offline";

interface SignInResult {
  error?: string;
  /** round 61 — true when the session was granted from the device cache
   *  (offline sign-in): the caller toasts the offline-mode wording. */
  offlineLogin?: boolean;
}

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  /** round 61 — true while the session is served from the device cache
   *  because the network is unreachable (offline reload / offline login). */
  offline: boolean;
  signIn: (fullName: string, email: string) => Promise<SignInResult>;
  signUp: (fullName: string, email: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  /** round 61 — resolves the freshly-confirmed user (null = signed out). */
  refresh: () => Promise<SessionUser | null>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [user, setUser] = React.useState<SessionUser | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [offline, setOffline] = React.useState(false);

  // latest-state mirrors for event handlers (the 'online' listener must not
  // read stale closures)
  const userRef = React.useRef<SessionUser | null>(null);
  const offlineRef = React.useRef(false);
  React.useEffect(() => {
    userRef.current = user;
  }, [user]);
  React.useEffect(() => {
    offlineRef.current = offline;
  }, [offline]);

  // round 61 — refresh RETURNS the resolved user so callers (the
  // back-online re-auth) can branch on the fresh answer instead of racing
  // the userRef sync effect.
  const refresh = React.useCallback(async (): Promise<SessionUser | null> => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const next = data.user ?? null;
        // round 61 — offline signout follow-through: the signout POST never
        // reached the server, so the still-valid cookie would RESURRECT the
        // session on this first online sync. Kill it exactly once.
        if (next && consumePendingSignout()) {
          await fetch("/api/auth/signout", { method: "POST" }).catch(() => {});
          setUser(null);
          setOffline(false);
          return null;
        }
        if (next) {
          // remember the last server-confirmed user so an offline reload
          // restores the session instead of visually logging the student out
          writeCachedUser(next);
          clearSignedOutFlag();
          setUser(next);
          setOffline(false);
          return next;
        } else {
          // server-side: no session. The device bridge (cached user + last
          // login) deliberately SURVIVES so the student can still sign in
          // offline; an explicit sign-out is tracked by its own flag.
          setUser(null);
          setOffline(false);
          return null;
        }
      } else {
        setUser(null);
        return null;
      }
    } catch {
      // round 61 — NETWORK-LEVEL failure (the request never got a server
      // answer): restore the cached session instead of dropping the student
      // to the login screen. A reload with the network off used to log the
      // user out visually. navigator.onLine is deliberately NOT the gate —
      // it stays true behind dead captive portals / dropped VPNs while
      // every request dies; the fetch failure itself is the real signal.
      // An explicit sign-out (flag) is never resurrected here.
      const cached = readCachedUser();
      if (cached && !isSignedOutFlag()) {
        setUser(cached);
        setOffline(true);
        return cached;
      }
      if (offlineRef.current && userRef.current) {
        // already inside an offline session and still unreachable — keep it
        setOffline(true);
        return userRef.current;
      }
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  // round 61 — when the connection comes back after an offline session,
  // re-sync immediately: the app banner disappears, real data replaces the
  // cached copy, and /api/auth/me re-establishes the true session (the
  // httpOnly cookie was never touched by the offline bridge). If the cookie
  // is dead/expired but the device holds the sign-in bridge and the user
  // never signed out, the remembered credentials re-authenticate silently —
  // name+email is the same (passwordless) bar as the prefilled login form.
  const refreshRef = React.useRef(refresh);
  React.useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);
  React.useEffect(() => {
    async function onOnline() {
      if (!offlineRef.current) {
        // follow-through for a sign-out issued while OFFLINE: the zombie
        // cookie must be killed on the first online sync even if the user
        // just sits on the login screen (refresh consumes the marker).
        if (hasPendingSignout()) await refreshRef.current();
        return;
      }
      const last = readLastLogin();
      // branch on refresh's RETURN value — userRef may not have re-synced
      // yet when setUser(null) just scheduled a render (race)
      const me = await refreshRef.current();
      if (!me && last && !isSignedOutFlag()) {
        await signInSilent(last.fullName, last.email);
      }
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  // round 38: the session used to be read once per login/reload — a student
  // approved into a cohort kept seeing «بلا فوج» AND the «تصفح المجموعات
  // والأفواج» button after the acceptance, because the reviewer's action
  // only updates the DB on the server. Sync the session whenever the tab
  // becomes visible again (throttled) so approvals and role changes land
  // without any manual reload.
  const lastVisibleSyncRef = React.useRef(0);
  React.useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastVisibleSyncRef.current < 15_000) return;
      lastVisibleSyncRef.current = now;
      refresh();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [refresh]);

  const signIn = React.useCallback(
    async (fullName: string, email: string): Promise<SignInResult> => {
      // round 61 — OFFLINE SIGN-IN (owner: «logged out, went offline, could
      // not log back in»). Sign-in uses name+email only — no password — so
      // an exact match against the last successful login on THIS device is
      // the same verification bar as the online flow. Grants the cached
      // session; the cookie re-syncs on the next online refresh (see the
      // 'online' listener's silent re-auth).
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const cached = readCachedUser();
        if (cached && matchesLastLogin(fullName, email)) {
          clearSignedOutFlag(); // logging back in revives offline restore
          // a sign-out issued offline left a zombie-cookie marker — the
          // user's latest intent (logged in) wins, so drop it
          consumePendingSignout();
          setUser(cached);
          setOffline(true);
          setLoading(false);
          return { offlineLogin: true };
        }
        return { error: t("auth.errorOfflineMismatch") };
      }
      // fix H-6 (round 4): network failures used to throw an unhandled
      // rejection → the login form silently did nothing. Now every failure
      // path returns a user-visible message shown by the login toast.
      try {
        const res = await fetch("/api/auth/signin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fullName, email }),
        });
        const data = await res.json();
        if (data.error) return { error: data.error };
        // round 61 — remember the credentials that just worked, so the
        // NEXT offline visit can sign in without the server.
        writeLastLogin(fullName, email);
        clearSignedOutFlag();
        consumePendingSignout(); // the fresh cookie replaces any zombie
        await refresh();
        return {};
      } catch {
        // round 61 — the request died WITHOUT a server answer (offline, or
        // navigator.onLine lies — captive portal/VPN): the device bridge
        // may still grant the offline session when the typed data matches
        // the last successful login exactly. Same passwordless bar as the
        // online form itself.
        const cached = readCachedUser();
        if (cached && matchesLastLogin(fullName, email)) {
          clearSignedOutFlag();
          consumePendingSignout();
          setUser(cached);
          setOffline(true);
          setLoading(false);
          return { offlineLogin: true };
        }
        // round 58 — say "offline" when the browser knows it is offline;
        // keep the server-side wording for dead captive portals etc.
        return {
          error:
            typeof navigator !== "undefined" && !navigator.onLine
              ? t("auth.errorOffline")
              : t("auth.errorNetwork"),
        };
      }
    },
    [refresh, t]
  );

  // silent variant for the back-online re-auth (no toast is emitted from
  // here; the shell's «عاد الاتصال» toast already covers the moment)
  const signInSilent = React.useCallback(
    async (fullName: string, email: string) => {
      await signIn(fullName, email);
    },
    [signIn]
  );

  const signUp = React.useCallback(
    async (fullName: string, email: string) => {
      // round 61 — account creation writes to the server DB; there is no
      // offline path, so fail fast with the exact reason instead of a
      // generic network error.
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return { error: t("auth.errorOfflineSignup") };
      }
      // fix H-6 (round 4): same network-failure guard as signIn.
      try {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fullName, email }),
        });
        const data = await res.json();
        if (data.error) return { error: data.error };
        // round 61 — a fresh account can also be re-entered offline later.
        writeLastLogin(fullName, email);
        await refresh();
        return {};
      } catch {
        // round 58 — same offline-first classification as signIn.
        return {
          error:
            typeof navigator !== "undefined" && !navigator.onLine
              ? t("auth.errorOffline")
              : t("auth.errorNetwork"),
        };
      }
    },
    [refresh, t]
  );

  const signOut = React.useCallback(async () => {
    // round 58 — offline signout: the POST can't reach the server, but the
    // user must still land on the login screen (which will show the offline
    // banner). The server cookie expires on its own / clears on next online
    // request, so a local-only signout is safe.
    // round 61 — sign-out semantics for the offline bridge:
    //  • the cached user + remembered credentials SURVIVE (the device owner
    //    may sign back in offline — the owner's exact scenario); name+email
    //    is the app's only verification bar online anyway, so keeping them
    //    changes nothing security-wise;
    //  • the signed-out FLAG blocks offline session RESTORE (an explicit
    //    logout must not be resurrected by a reload);
    //  • if the POST could not reach the server, a pending marker makes the
    //    next online sync kill the still-valid cookie.
    let reached = false;
    try {
      await fetch("/api/auth/signout", { method: "POST" });
      reached = true;
    } catch {
      // offline (or server unreachable) — proceed locally
    }
    if (!reached) setPendingSignout();
    setSignedOutFlag();
    setOffline(false);
    setUser(null);
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    offline,
    signIn,
    signUp,
    signOut,
    refresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

export type { SessionUser, UserRole };
