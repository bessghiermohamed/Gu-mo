"use client";

/**
 * أدواتي — shared client-side helpers for the offline file tools.
 *
 * PRIVACY: everything in this folder runs 100% inside the student's browser.
 * No fetch(), no upload, no Supabase Storage — files never leave the device.
 * pdf-lib and pdfjs-dist are lazy-imported ONLY when a tool actually starts
 * processing, so the ملفاتي screen bundle stays small.
 */

import * as React from "react";

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Human-readable byte size in Arabic UI ("1.4 MB" — Latin units keep the
 *  numbers bidi-safe inside RTL sentences, matching common Arabic apps). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} بايت`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb >= 100 ? kb.toFixed(0) : kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb >= 100 ? mb.toFixed(0) : mb.toFixed(2)} MB`;
}

/** "2026-09-04" — used inside generated file names. */
export function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// File picking (programmatic <input type="file"> — no new UI patterns)
// ---------------------------------------------------------------------------

export async function pickFiles(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = "none";
    document.body.appendChild(input);
    const cleanup = () => input.remove();
    input.addEventListener("change", () => {
      resolve(Array.from(input.files ?? []));
      cleanup();
    });
    // Modern browsers fire "cancel" when the picker is dismissed — resolve
    // empty so callers can distinguish "user changed their mind" from errors.
    input.addEventListener("cancel", () => {
      resolve([]);
      cleanup();
    });
    input.click();
  });
}

// ---------------------------------------------------------------------------
// Output: share (Web Share API with files) + download fallback
// ---------------------------------------------------------------------------

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}

export async function shareOrDownload(
  blob: Blob,
  filename: string,
  title: string
): Promise<"shared" | "downloaded" | "cancelled"> {
  try {
    const file = new File([blob], filename, {
      type: blob.type || "application/pdf",
    });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return "shared";
    }
  } catch (e) {
    // Closing the OS share sheet is NOT an error — don't fall back to a
    // surprise download the student never asked for.
    if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
    // Any other failure (old browser, permission…) → plain download below.
  }
  downloadBlob(blob, filename);
  return "downloaded";
}

export function canShareFiles(): boolean {
  try {
    return typeof navigator !== "undefined" && !!navigator.canShare;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Friendly Arabic error mapping — the tools must never crash or leak
// English library stack messages into the student's face.
// ---------------------------------------------------------------------------

export function friendlyFileError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  // pdf.js throws PasswordException / InvalidPDFException by name.
  const name = (err as { name?: string } | null)?.name ?? "";
  if (name === "PasswordException" || /password|encrypt|decrypt/i.test(msg)) {
    return "الملف محمي بكلمة مرور — لا يمكن معالجته. أزل الحماية ثم أعد المحاولة.";
  }
  if (name === "InvalidPDFException" || /invalid pdf|malformed|parse/i.test(msg)) {
    return "الملف تالف أو ليس بصيغة PDF صحيحة.";
  }
  if (/Failed to fetch|network/i.test(msg)) {
    return "تعذّر تحميل مكوّن المعالجة — تحقق من اتصالك ثم أعد المحاولة.";
  }
  if (/image|bitmap|decode/i.test(msg)) {
    return "صيغة الصورة غير مدعومة (مثلاً HEIC) — حوّلها إلى JPG أو PNG ثم أعد المحاولة.";
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Lazy library loaders (keep the initial ملفاتي bundle tiny)
// ---------------------------------------------------------------------------

let pdfjsPromise: Promise<PdfJsModule> | null = null;
type PdfJsModule = typeof import("pdfjs-dist");

export function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((mod) => {
      // Local worker copy — NO CDN, keeps the tool fully offline-capable.
      mod.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      return mod;
    });
  }
  return pdfjsPromise;
}

type PdfLibModule = typeof import("pdf-lib");

export function loadPdfLib(): Promise<PdfLibModule> {
  // import() is already cached by the bundler runtime; a shared promise keeps
  // concurrent calls (rare) from double-importing.
  return import("pdf-lib");
}

// ---------------------------------------------------------------------------
// Misc small helpers shared by the three tools
// ---------------------------------------------------------------------------

/** Yield to the browser so the progress UI can paint between heavy steps. */
export function nextPaint(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

/** Canvas.toBlob wrapped in a promise. */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("canvas encode failed"))),
      type,
      quality
    );
  });
}

/** A4 portrait page size in PDF points (72 dpi). */
export const A4: [number, number] = [595.28, 841.89];

/** pdf-lib's save() returns Uint8Array<ArrayBufferLike>, which TS rejects as
 *  a BlobPart. slice() copies into a plain ArrayBuffer-backed array. */
export function pdfBytesToBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes.slice()], { type: "application/pdf" });
}
