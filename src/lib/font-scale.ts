"use client";

/**
 * round 56 — «حجم الواجهة والخط» accessibility setting.
 *
 * A REAL new setting (the owner's complaint: الإعدادات لا تحوي جديداً).
 * Scales the app by adjusting the root font-size — Tailwind spacing is
 * rem-based, so the whole interface (text, paddings, icons) scales
 * together, which is exactly what an accessibility text-size control
 * should do. Persisted per device in localStorage.
 */

export type FontScale = "normal" | "large" | "larger";

const KEY = "talib-font-scale";

const SIZES: Record<FontScale, string> = {
  normal: "16px",
  large: "18px",
  larger: "20px",
};

export const FONT_SCALE_OPTIONS: Array<{ id: FontScale; label: string; desc: string }> = [
  { id: "normal", label: "عادي", desc: "الحجم الافتراضي" },
  { id: "large", label: "كبير", desc: "نص أوضح بقليل" },
  { id: "larger", label: "أكبر", desc: "أريح للعين" },
];

export function loadFontScale(): FontScale {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "normal" || v === "large" || v === "larger") return v;
  } catch {
    // storage disabled — default
  }
  return "normal";
}

export function saveFontScale(scale: FontScale): void {
  try {
    localStorage.setItem(KEY, scale);
  } catch {
    // ignore
  }
  applyFontScale(scale);
}

export function applyFontScale(scale: FontScale): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.fontSize = SIZES[scale];
}
