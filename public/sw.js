/* Talib service worker — round 56 («إشعارات خارج المتصفح») + round 61
 * («الأوفلاين مهم» — offline app shell).
 *
 * Registered by src/lib/push-client.ts AND (r61) on every /app visit.
 * Three jobs:
 *
 *  1. PUSH events: the server (src/lib/push.ts, VAPID-signed) wakes this
 *     worker even when NO app tab is open — that is the whole point of
 *     the owner's request: notifications that behave «مثل باقي التطبيقات».
 *  2. NOTIFICATIONCLICK: focus an existing app tab if one exists, else
 *     open the app — never a second stray tab.
 *  3. OFFLINE SHELL (r61): same-origin GET requests are served
 *     network-first with a cache fallback. Online users always get the
 *     fresh build (no stale-build risk — the network response wins and
 *     re-warms the cache); offline users get the last copy their device
 *     saw, so /app reloads and boots without connectivity. API calls are
 *     excluded on purpose — the app-level offline cache (src/lib/offline.ts)
 *     owns data, auth and its own UX.
 *
 * Deliberately dependency-free vanilla JS (service workers must not go
 * through the Next.js bundler; this file is served as-is from /sw.js).
 */

const SHELL_CACHE = "talib-shell-v1";
const SHELL_URLS = ["/app", "/talib/icon.svg"];

self.addEventListener("install", (event) => {
  // r61 — prefetch the app shell so even the FIRST registration leaves a
  // usable offline copy (chunks warm up on the next online visit).
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) =>
      Promise.allSettled(SHELL_URLS.map((u) => c.add(u)))
    )
  );
  // activate immediately — no waiting for old workers
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // r61 — drop shell caches from older SW versions
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("talib-shell-") && k !== SHELL_CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// r61 — offline shell: network-first, cache-fallback for same-origin GETs.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // writes pass through (fail offline, as designed)
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // cross-origin: not ours
  if (url.pathname.startsWith("/api/")) return; // data APIs: app-level cache owns these

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && (res.type === "basic" || res.type === "default")) {
          const copy = res.clone();
          caches
            .open(SHELL_CACHE)
            .then((c) => c.put(req, copy))
            .catch(() => {}); // cache quota — offline fallback just stays thinner
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((hit) => {
          if (hit) return hit;
          // any subresource miss while offline: fall back to the shell for
          // navigations, and a plain offline answer otherwise
          if (req.mode === "navigate") {
            return caches.match("/app", { ignoreSearch: true }).then((shell) =>
              shell ||
              new Response(
                "<!doctype html><html lang=ar dir=rtl><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>طالب</title><p style=\"font-family:system-ui;padding:2rem;text-align:center\">أنت غير متصل بالإنترنت — أعد تحميل الصفحة بعد عودة الاتصال.</p>",
                { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 200 }
              )
            );
          }
          return Response.error();
        })
      )
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    // some push services send plain text — tolerate it
    payload = { title: "إشعار جديد", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "طالب — إشعار جديد";
  const body = payload.body || "";
  const tag = payload.tag || "talib-push";
  const url = payload.url || "/app";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag, // replaces older notifications of the same tag (no spam piles)
      renotify: true,
      icon: "/talib/icon.svg",
      badge: "/talib/icon.svg",
      dir: "rtl",
      lang: "ar",
      vibrate: [100, 50, 100],
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/app";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // focus an existing app window when possible (incl. one on another route)
      for (const client of clientList) {
        const url = new URL(client.url);
        if (url.pathname.startsWith("/app") && "focus" in client) {
          client.focus();
          if ("navigate" in client) {
            return client.navigate(targetUrl).catch(() => {});
          }
          return;
        }
      }
      // no app window open → open one
      return self.clients.openWindow(targetUrl);
    })
  );
});
