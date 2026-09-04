import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Human-readable byte size in Arabic units — shared by سحابتي and the
 *  library cards (round 32). null/undefined → em-dash. */
export function formatBytes(
  bytes: number | string | null | undefined
): string {
  if (bytes === null || bytes === undefined || bytes === "") return "—";
  const n = typeof bytes === "string" ? Number(bytes) : bytes;
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} بايت`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} ك.ب`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} م.ب`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} ج.ب`;
}
