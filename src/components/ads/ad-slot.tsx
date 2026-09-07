"use client";

import { useEffect, useRef, useState } from "react";
import { Megaphone } from "lucide-react";
import { ADSENSE_CLIENT } from "@/lib/ads";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * Fill detection contract with adsbygoogle.js (verified live on localhost):
 *  - the script sets `data-ad-status="filled" | "unfilled"` on the <ins> —
 *    the ONLY trustworthy signal (an unfilled unit still gets a visible blank
 *    measurement iframe, so "iframe exists" ≠ "ad served")
 *  - if the script never loads (adblocker / offline) no signal arrives at all,
 *    so a timeout is the third exit.
 */
type AdState = "loading" | "filled" | "empty";

/** How long the skeleton holds reserved space before giving up (ms). */
const FILL_TIMEOUT_MS = 5000;

type AdSlotProps = {
  /** AdSense ad-unit slot id — use the constants in src/lib/ads.ts. */
  adSlot: string;
  /** Serve Google's visible test creative (owner diagnostics page only). */
  adTest?: boolean;
  /** Show the raw slot id chip (owner diagnostics page only). */
  showSlotId?: boolean;
  className?: string;
};

/**
 * The redesigned ad experience (round 48).
 *
 * What it fixes over the old bare <AdUnit>:
 *  1. CLS   — the ad area reserves min-height while the unit fills, so content
 *             below never jumps once the creative arrives.
 *  2. Label — a visible «إعلان» chip clearly separates paid content from
 *             editorial content (AdSense policy best practice + RTL readers).
 *  3. Skeleton — a calm pulse while the unit fills instead of a dead hole.
 *  4. Empty  — unfilled slots (site still under review, no fill, adblock)
 *             collapse smoothly to zero height: the page never ships dead
 *             bordered boxes. A late fill re-expands the slot.
 *  5. One   — one consistent, theme-aware (Facebook-blue palette, dark mode)
 *             container across all six placements instead of five wraps.
 *
 * The 0fr/1fr grid-rows technique animates the collapse without JS
 * measurement; overflow-hidden lives on the inner row, never on the <ins>
 * itself once filled.
 */
export function AdSlot({ adSlot, adTest = false, showSlotId = false, className }: AdSlotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pushed = useRef(false);
  const [state, setState] = useState<AdState>("loading");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Push exactly once per mount (StrictMode-safe via ref guard).
    if (!pushed.current) {
      pushed.current = true;
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (error) {
        console.error("adsbygoogle push failed:", error);
      }
    }

    // Filled ↔ empty transitions are driven by the DOM, not just the timeout:
    // the observer keeps running for the component's lifetime so a LATE fill
    // (slow network after we already collapsed) re-expands the slot instead of
    // leaving a served impression invisible inside a collapsed container.
    //
    // IMPORTANT: trust data-ad-status, never a bare iframe check — Google
    // inserts a visible blank measurement iframe (~280px) even when the unit
    // is UNFILLED, so "iframe exists" ≠ "ad served".
    const sync = () => {
      const status = container.querySelector<HTMLElement>("ins.adsbygoogle")?.dataset.adStatus;
      if (status === "filled") setState("filled");
      else if (status === "unfilled") setState("empty");
    };

    const observer = new MutationObserver(sync);
    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-ad-status", "style"],
    });

    // Initial sync (StrictMode remounts may already hold a filled unit) —
    // async via rAF so no setState runs synchronously inside the effect.
    const raf = requestAnimationFrame(sync);

    const timer = window.setTimeout(() => {
      const status = container.querySelector<HTMLElement>("ins.adsbygoogle")?.dataset.adStatus;
      if (status !== "filled") setState("empty");
    }, FILL_TIMEOUT_MS);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, []);

  const collapsed = state === "empty";

  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-500 ease-out ${
        collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
      } ${className ?? ""}`}
      aria-hidden={collapsed}
    >
      <div className="overflow-hidden">
        <aside
          role="complementary"
          aria-label="مساحة إعلانية"
          dir="rtl"
          className="rounded-2xl border border-border/70 bg-card text-card-foreground shadow-sm"
        >
          {/* Label row — tiny, quiet, unmissable. */}
          <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3.5 py-1.5">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wide text-muted-foreground">
              <Megaphone className="h-3 w-3 text-muted-foreground/80" aria-hidden="true" />
              إعلان
            </span>
            {(adTest || showSlotId) && (
              <span
                className="font-mono text-[10px] font-semibold text-muted-foreground/80"
                dir="ltr"
              >
                {adTest && (
                  <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 font-sans font-bold text-amber-600 dark:text-amber-400">
                    adTest
                  </span>
                )}
                slot {adSlot}
              </span>
            )}
          </div>

          {/* Ad area — height reserved while filling (anti-CLS). */}
          <div ref={containerRef} className="relative min-h-[110px] p-2 sm:min-h-[140px]">
            {state === "loading" && (
              <div
                aria-hidden="true"
                className="absolute inset-2 animate-pulse rounded-xl bg-gradient-to-l from-muted/40 via-muted to-muted/40"
              />
            )}
            <ins
              className="adsbygoogle"
              style={{ display: "block" }}
              data-ad-client={ADSENSE_CLIENT}
              data-ad-slot={adSlot}
              data-ad-format="auto"
              data-full-width-responsive="true"
              data-adtest={adTest ? "on" : undefined}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
