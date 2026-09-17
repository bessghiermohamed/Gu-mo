// Single source of truth for Google AdSense config.
// Publisher ca-pub-8081529487869617 — verified via public/ads.txt.

import { SITE_URL } from "@/lib/site";

export const ADSENSE_CLIENT = "ca-pub-8081529487869617";

/**
 * Ad unit slots. One slot id is currently used for every placement — that is
 * valid AdSense usage, but per-placement ids (created in the AdSense console)
 * give per-position reporting. Add them here as the owner creates them.
 */
export const ADSENSE_SLOT_MIMO = "4214645931";

// ---------------------------------------------------------------------------
// r90 — honest-declarations host gate (Google «misrepresentation» notice).
//
// The adsbygoogle.js loader used to sit unconditionally in the root layout, so
// EVERY Vercel URL served it: production (gu-mo.vercel.app) but also each
// per-deployment URL (gu-mo-<hash>.vercel.app) and branch previews. Google's
// ad-request logs then show one publisher requesting ads from hostnames never
// declared in the account — literally the policy's «partial or inaccurate URLs
// in ad serving requests» example under honest declarations.
//
// From r90 on, ads (script + containers) are allowed ONLY on:
//   1. the canonical site host — derived from SITE_URL, i.e. the exact URL
//      declared in the AdSense account (gu-mo.vercel.app today; a custom
//      domain later, by just setting NEXT_PUBLIC_SITE_URL and redeploying),
//   2. hosts explicitly whitelisted by the owner via the
//      NEXT_PUBLIC_ADSENSE_EXTRA_HOSTS env var (comma-separated),
//   3. localhost / 127.0.0.1 for owner diagnostics (never reaches Google's
//      production logs).
// Preview/staging hosts render no ad script and no ad containers at all.
// ---------------------------------------------------------------------------

/** Parse the NEXT_PUBLIC_ADSENSE_EXTRA_HOSTS env var ("a.com, www.b.com" → ["a.com","b.com"]). */
export function parseExtraAdHosts(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase().replace(/^www\./, ""))
    .filter(Boolean);
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** The one host AdSense should ever see requests from (plus localhost for diagnostics). */
export const ADS_PRIMARY_HOST = hostOf(SITE_URL) ?? "gu-mo.vercel.app";

export const ADS_ALLOWED_HOSTS: readonly string[] = Array.from(
  new Set([
    ADS_PRIMARY_HOST,
    "localhost",
    "127.0.0.1",
    ...parseExtraAdHosts(process.env.NEXT_PUBLIC_ADSENSE_EXTRA_HOSTS),
  ])
);

/** Exact-match guard — subdomains and www-prefixed hosts of the canonical site stay OUT. */
export function isAdsAllowedHost(hostname: string): boolean {
  return ADS_ALLOWED_HOSTS.includes(hostname.trim().toLowerCase());
}
