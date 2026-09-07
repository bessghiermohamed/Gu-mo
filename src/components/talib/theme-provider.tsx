"use client";

import * as React from "react";
import {
  ThemeProvider as NextThemesProvider,
  type ThemeProviderProps,
} from "next-themes";

/**
 * ThemeProvider wraps next-themes and adds support for the dual theme system:
 * - "class" attribute controls light/dark
 * - "data-theme" attribute controls the color palette
 *
 * Both are managed via localStorage keys:
 * - "theme" (next-themes default): "light" | "dark"
 * - "talib-palette": "academic" | "modern" | "blue"
 *
 * round 52 — third palette «الأزرق» added (owner request: green and purple
 * existed, blue was missing and had to be substitutable). togglePalette
 * now CYCLES through the three instead of a boolean flip.
 */

export type TalibPalette = "academic" | "modern" | "blue";

export const PALETTES: Array<{
  id: TalibPalette;
  label: string;
  desc: string;
  swatch: string;
}> = [
  {
    id: "academic",
    label: "أكاديمي",
    desc: "أخضر زمردي — الهوية الرسمية",
    swatch: "oklch(0.45 0.09 165)",
  },
  {
    id: "modern",
    label: "عصري",
    desc: "بنفسجي حيوي وأنيق",
    swatch: "oklch(0.55 0.20 290)",
  },
  {
    id: "blue",
    label: "أزرق",
    desc: "أزرق هادئ قابل للاستبدال",
    swatch: "oklch(0.55 0.18 255)",
  },
];

const isPalette = (v: string | null): v is TalibPalette =>
  v === "academic" || v === "modern" || v === "blue";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  // On mount, sync the palette attribute
  React.useEffect(() => {
    const applyPalette = (palette: string) => {
      document.documentElement.setAttribute("data-theme", palette);
    };

    const stored = localStorage.getItem("talib-palette");
    applyPalette(isPalette(stored) ? stored : "academic");

    // Listen for palette changes from other tabs / settings panel
    const handler = (e: StorageEvent) => {
      if (e.key === "talib-palette" && e.newValue) {
        applyPalette(e.newValue);
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}

/**
 * Hook to read & switch the palette (academic / modern / blue).
 */
export function usePalette() {
  const [palette, setPaletteState] = React.useState<TalibPalette>("academic");

  React.useEffect(() => {
    // async settle — avoids the sync setState-in-effect lint error
    const t = setTimeout(() => {
      const stored = localStorage.getItem("talib-palette");
      setPaletteState(isPalette(stored) ? stored : "academic");
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const setPalette = React.useCallback((next: TalibPalette) => {
    localStorage.setItem("talib-palette", next);
    document.documentElement.setAttribute("data-theme", next);
    setPaletteState(next);
  }, []);

  const togglePalette = React.useCallback(() => {
    // round 52: cycles academic → modern → blue → academic (the header
    // palette button keeps its one-tap role across the three identities)
    const order: TalibPalette[] = ["academic", "modern", "blue"];
    const idx = order.indexOf(palette);
    setPalette(order[(idx + 1) % order.length]);
  }, [palette, setPalette]);

  return { palette, setPalette, togglePalette };
}
