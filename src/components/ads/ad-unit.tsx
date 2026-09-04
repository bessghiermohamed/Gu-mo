"use client";

import { useEffect, useRef, useState } from "react";
import { ADSENSE_CLIENT } from "@/lib/ads";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

let adsenseLoader: Promise<void> | undefined;

function loadAdsense() {
  if (window.adsbygoogle) return Promise.resolve();
  if (adsenseLoader) return adsenseLoader;

  adsenseLoader = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "google-adsense";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("AdSense failed to load"));
    document.head.appendChild(script);
  });

  return adsenseLoader;
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
  const [canRender, setCanRender] = useState(false);

  useEffect(() => {
    // AdSense cannot initialize inside the v0 preview iframe. Rendering an
    // <ins> there makes the vendor script throw TagError on every refresh.
    const inPreviewFrame = window.self !== window.top;
    if (inPreviewFrame) return;

    setCanRender(true);
  }, []);

  useEffect(() => {
    if (!canRender || pushed.current) return;

    let cancelled = false;
    loadAdsense()
      .then(() => {
        if (cancelled || pushed.current) return;
        pushed.current = true;
        try {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch {
          // AdSense failures are vendor-side; never turn them into app errors.
          pushed.current = false;
        }
      })
      .catch(() => {
        // Keep ad provider failures isolated from the application.
      });

    return () => {
      cancelled = true;
    };
  }, [canRender]);

  if (!canRender) return null;

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
