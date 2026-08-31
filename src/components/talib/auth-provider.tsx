"use client";

import * as React from "react";
import type { SessionUser, UserRole } from "@/lib/auth/types";
import { useI18n } from "@/components/talib/i18n-provider";

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  signIn: (fullName: string, email: string) => Promise<{ error?: string }>;
  signUp: (fullName: string, email: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [user, setUser] = React.useState<SessionUser | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user ?? null);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const signIn = React.useCallback(
    async (fullName: string, email: string) => {
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
        await refresh();
        return {};
      } catch {
        return { error: t("auth.errorNetwork") };
      }
    },
    [refresh, t]
  );

  const signUp = React.useCallback(
    async (fullName: string, email: string) => {
      // fix H-6 (round 4): same network-failure guard as signIn.
      try {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fullName, email }),
        });
        const data = await res.json();
        if (data.error) return { error: data.error };
        await refresh();
        return {};
      } catch {
        return { error: t("auth.errorNetwork") };
      }
    },
    [refresh, t]
  );

  const signOut = React.useCallback(async () => {
    await fetch("/api/auth/signout", { method: "POST" });
    setUser(null);
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
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
