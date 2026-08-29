"use client";

import * as React from "react";
import {
  ThemeProvider as NextThemesProvider,
  type ThemeProviderProps,
} from "next-themes";

/**
 * ThemeProvider wraps next-themes and adds support for the dual theme system:
 * - "class" attribute controls light/dark
 * - "data-theme" attribute controls academic/modern palette
 *
 * Both are managed via localStorage keys:
 * - "theme" (next-themes default): "light" | "dark"
 * - "talib-palette": "academic" | "modern"
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  // On mount, sync the palette attribute
  React.useEffect(() => {
    const applyPalette = (palette: string) => {
      document.documentElement.setAttribute("data-theme", palette);
    };

    const stored = localStorage.getItem("talib-palette") || "academic";
    applyPalette(stored);

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
 * Hook to read & toggle the palette (academic vs modern).
 */
export function usePalette() {
  const [palette, setPaletteState] = React.useState<"academic" | "modern">(
    "academic"
  );

  React.useEffect(() => {
    const stored =
      (localStorage.getItem("talib-palette") as "academic" | "modern") ||
      "academic";
    setPaletteState(stored);
  }, []);

  const setPalette = React.useCallback((next: "academic" | "modern") => {
    localStorage.setItem("talib-palette", next);
    document.documentElement.setAttribute("data-theme", next);
    setPaletteState(next);
  }, []);

  const togglePalette = React.useCallback(() => {
    setPalette(palette === "academic" ? "modern" : "academic");
  }, [palette, setPalette]);

  return { palette, setPalette, togglePalette };
}
