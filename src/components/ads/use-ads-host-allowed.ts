"use client";

import { useSyncExternalStore } from "react";
import { isAdsAllowedHost } from "@/lib/ads";

/**
 * r90 — SSR-safe client gate for Google's ad systems.
 *
 * The server cannot know the request host without forcing every landing page
 * dynamic (headers() in a static layout is a non-starter), so the decision
 * happens on the client via useSyncExternalStore — the canonical way to read
 * an external value with a server snapshot:
 *   • SSR and the hydration pass use getServerSnapshot (false) so the server
 *     HTML and the first client render agree: no ad machinery anywhere.
 *   • Immediately after hydration React reads getSnapshot; on declared hosts
 *     it flips to true in one render — no state writes inside effects, no
 *     cascading renders, no hydration mismatch. On preview/deployment hosts it stays
 *     false forever, so nothing mounts at all.
 *
 * The document host cannot change during a page's lifetime, so subscribe is
 * an honest no-op that just fulfils the store contract; the boolean snapshot
 * is a primitive, hence stable and loop-free.
 *
 * One decision, two consumers: <AdsenseGate /> (the loader script) and
 * <AdSlot /> (the containers) — they must never disagree.
 */

const subscribe = () => () => {};

export function useAdsHostAllowed(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isAdsAllowedHost(window.location.hostname),
    () => false
  );
}
