"use client";

import * as React from "react";
import ar from "@/messages/ar.json";
import en from "@/messages/en.json";

type Locale = "ar" | "en";
type Messages = typeof ar;

const dictionaries: Record<Locale, Messages> = { ar, en };

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  dir: "rtl" | "ltr";
}

const I18nContext = React.createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<Locale>("ar");

  React.useEffect(() => {
    const stored = (localStorage.getItem("talib-locale") as Locale) || "ar";
    setLocaleState(stored);
    applyDir(stored);
  }, []);

  const setLocale = React.useCallback((l: Locale) => {
    localStorage.setItem("talib-locale", l);
    setLocaleState(l);
    applyDir(l);
  }, []);

  const t = React.useCallback(
    (key: string, params?: Record<string, string | number>) => {
      const parts = key.split(".");
      let value: unknown = dictionaries[locale];
      for (const p of parts) {
        if (value && typeof value === "object" && p in value) {
          value = (value as Record<string, unknown>)[p];
        } else {
          return key;
        }
      }
      let result = typeof value === "string" ? value : key;
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          result = result.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        });
      }
      return result;
    },
    [locale]
  );

  const value: I18nContextValue = {
    locale,
    setLocale,
    t,
    dir: locale === "ar" ? "rtl" : "ltr",
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function applyDir(locale: Locale) {
  const dir = locale === "ar" ? "rtl" : "ltr";
  document.documentElement.setAttribute("dir", dir);
  document.documentElement.setAttribute("lang", locale);
}

export function useI18n() {
  const ctx = React.useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}
