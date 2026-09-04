"use client";

import { useEffect, useRef } from "react";
import { ADSENSE_CLIENT } from "@/lib/ads";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

type AdUnitProps = {
  /** AdSense ad-unit slot id (e.g. "4214645931" for Mimo). */
  adSlot: string;
  /** Serve visible test ads instead of real ones (dev / approval pending). */
  adTest?: boolean;
  className?: string;
};

/**
 * Renders one responsive display ad unit. The global loader script lives in
 * the root layout (next/script, afterInteractive); pushes are queued into
 * window.adsbygoogle and consumed whenever the library finishes loading,
 * so mount order never matters. Ref-guarded against StrictMode double-push.
 */
export function AdUnit({ adSlot, adTest = false, className }: AdUnitProps) {
  const pushed = useRef(false);

  useEffect(() => {
    if (pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (error) {
      console.error("adsbygoogle push failed:", error);
    }
  }, []);

  return (
    <ins
      className={`adsbygoogle ${className ?? ""}`}
      style={{ display: "block" }}
      data-ad-client={ADSENSE_CLIENT}
      data-ad-slot={adSlot}
      data-ad-format="auto"
      data-full-width-responsive="true"
      data-adtest={adTest ? "on" : undefined}
    />
  );
}
