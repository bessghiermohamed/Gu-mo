/* Talib service worker — round 56 («إشعارات خارج المتصفح»).
 *
 * Registered by src/lib/push-client.ts. Two jobs:
 *
 *  1. PUSH events: the server (src/lib/push.ts, VAPID-signed) wakes this
 *     worker even when NO app tab is open — that is the whole point of
 *     the owner's request: notifications that behave «مثل باقي التطبيقات».
 *  2. NOTIFICATIONCLICK: focus an existing app tab if one exists, else
 *     open the app — never a second stray tab.
 *
 * Deliberately dependency-free vanilla JS (service workers must not go
 * through the Next.js bundler; this file is served as-is from /sw.js).
 */

self.addEventListener("install", (event) => {
  // activate immediately — no waiting for old workers
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
