"use client";

import Script from "next/script";
import { ADSENSE_CLIENT } from "@/lib/ads";
import { useAdsHostAllowed } from "./use-ads-host-allowed";

/**
 * r90 — the ONLY place adsbygoogle.js may be injected from.
 *
 * Replaces the unconditional <Script> that used to sit in the root layout and
 * load on every Vercel deployment URL. Now the script loads exclusively on
 * hosts the AdSense account declares (see src/lib/ads.ts «honest-declarations
 * host gate»), answering Google's misrepresentation notice example about
 * «incomplete or deceptively inaccurate data in ad serving requests, such as
 * partial or inaccurate URLs».
 *
 * The ownership meta tag (google-adsense-account) stays site-wide on purpose:
 * it is a plain declaration, not an ad request, and must accurately describe
 * the site wherever it is served.
 */
export function AdsenseGate() {
  const allowed = useAdsHostAllowed();
  if (!allowed) return null;

  return (
    <Script
      id="google-adsense"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
      crossOrigin="anonymous"
      strategy="afterInteractive"
    />
  );
}
