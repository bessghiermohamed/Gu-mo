/**
 * r61 — PRODUCTION offline smoke test (gu-mo.vercel.app).
 * Throwaway account: signup → flag onboarding/tour as done (returning-user
 * simulation) → warm caches → the owner's offline scenarios → DELETE the
 * account at the end (self-cleaning, r59 probe pattern).
 */
const { chromium } = require("playwright");

const BASE = "https://gu-mo.vercel.app";
const NAME = "فحص أوفلاين";
const EMAIL = `r61-probe-${Date.now()}@test.dz`;

const results = [];
function check(name, ok, extra = "") {
  results.push({ name, ok, extra });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? " | " + extra : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function goOffline(context, page) {
  await context.setOffline(true);
  await page
    .evaluate(() => {
      Object.defineProperty(navigator, "onLine", { get: () => false, configurable: true });
      window.dispatchEvent(new Event("offline"));
    })
    .catch(() => {});
}
async function goOnline(context, page) {
  await context.setOffline(false);
  await page
    .evaluate(() => {
      delete navigator.onLine;
      window.dispatchEvent(new Event("online"));
    })
    .catch(() => {});
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "ar-DZ",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  // ── sign up a throwaway account (online) ───────────────────────────
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  const signupTab = page.getByRole("tab", { name: /حساب جديد|إنشاء الحساب/ });
  if (await signupTab.count()) await signupTab.first().click().catch(() => {});
  await page.locator("#fullName").fill(NAME);
  await page.locator("#email").fill(EMAIL);
  await page.getByRole("button", { name: /إنشاء الحساب/ }).first().click();
  // a fresh account lands ON ONBOARDING (no DB scope yet, no device flags)
  await page.getByText(/الخطوة 1 من 6|بياناتاتك الشخصية|دعنا نُجهّز حسابك/).first().waitFor({ timeout: 20000 });
  check("P1 signup → onboarding gate", true);

  // returning-user simulation: onboarding done + tour done (device flags),
  // then reload so the gate re-evaluates and the app shell renders
  await page.evaluate(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("talib-cached-user") || "null");
      if (raw?.id) {
        localStorage.setItem(`talib-onboarding-${raw.id}`, "true");
        localStorage.setItem(`talib-tour-${raw.id}`, "done");
      }
    } catch {}
  });
  // arm the SW + one online reload to warm the shell chunks through it
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("header", { timeout: 20000 });
  await sleep(800);
  // warm the read-screen caches
  await page.evaluate(() => {
    location.hash = "#/courses";
  });
  await sleep(1500);
  await page.evaluate(() => {
    location.hash = "#/schedule";
  });
  await sleep(1500);
  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const keys = await caches.keys();
    let n = 0;
    for (const k of keys) {
      const c = await caches.open(k);
      n += (await c.keys()).length;
    }
    return { active: !!reg?.active, entries: n };
  });
  check("P2 SW active + shell cache warm", sw.active && sw.entries > 3, JSON.stringify(sw));

  // ── offline reload → session restored ──────────────────────────────
  await goOffline(context, page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(4000);
  await page
    .evaluate(() => {
      Object.defineProperty(navigator, "onLine", { get: () => false, configurable: true });
      window.dispatchEvent(new Event("offline"));
    })
    .catch(() => {});
  await sleep(1200);
  const restored = (await page.locator("header").count()) > 0;
  const banner = await page
    .getByText(/الجلسة والبيانات المعروضة محفوظة على جهازك/)
    .count();
  check("P3 offline reload → session restored + banner", restored && banner > 0, `restored=${restored} banner=${banner}`);
  await page.screenshot({ path: "/home/z/my-project/download/r61/prod-offline-reload.png" });

  // ── offline courses → chip ─────────────────────────────────────────
  await page.evaluate(() => {
    location.hash = "#/courses";
  });
  await sleep(2200);
  const chip = await page.getByText(/بيانات محفوظة على جهازك/).count();
  check("P4 offline courses → «بيانات محفوظة» chip", chip > 0, `chip=${chip}`);

  // ── the owner's scenario: sign out offline, log back in offline ────
  await page.evaluate(() => {
    location.hash = "#/profile";
  });
  await sleep(1200);
  await page.getByText("تسجيل الخروج").first().click();
  await page.waitForSelector("#fullName", { timeout: 20000 });
  const hint = await page.getByText(/يمكنك الدخول الآن بآخر بيانات/).count();
  const pfName = await page.locator("#fullName").inputValue();
  check("P5 offline signed-out → hint + prefilled form", hint > 0 && pfName === NAME, `hint=${hint} name="${pfName}"`);
  await page.screenshot({ path: "/home/z/my-project/download/r61/prod-offline-login.png" });

  await page.getByRole("button", { name: /دخول|تسجيل الدخول/ }).first().click();
  await sleep(2500);
  const granted = (await page.locator("header").count()) > 0;
  const grantToast = await page.getByText(/تم الدخول في وضع عدم الاتصال/).count();
  check("P6 offline login → granted", granted && grantToast > 0, `granted=${granted} toast=${grantToast}`);
  await page.screenshot({ path: "/home/z/my-project/download/r61/prod-offline-granted.png" });

  // ── back online → auto re-auth (cookie was killed by the offline... ──
  // note: the offline signout POST failed → cookie alive → refresh keeps
  // the real session; either way the user must REMAIN signed in
  await goOnline(context, page);
  await sleep(5000);
  const stillIn = (await page.locator("header").count()) > 0;
  const loginGone = (await page.locator("#fullName").count()) === 0;
  check("P7 back online → still signed in", stillIn && loginGone, `in=${stillIn} loginGone=${loginGone}`);

  // ── cleanup: delete the throwaway account (needs a live session) ───
  const deleted = await page.evaluate(async () => {
    try {
      const r = await fetch("/api/auth/delete", { method: "POST" });
      return r.status;
    } catch {
      return 0;
    }
  });
  check("P8 throwaway account deleted", deleted === 200, `status=${deleted}`);

  const realErrors = errors.filter((e) => !e.includes("net::ERR") && !e.includes("Failed to load"));
  check("P9 no unexpected page errors", realErrors.length === 0, realErrors.slice(0, 2).join(" ;; "));

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n═══ PROD: ${results.length - failed.length}/${results.length} PASSED ═══`);
  process.exit(failed.length > 0 ? 1 : 0);
})().catch((e) => {
  console.error("SCRIPT ERROR:", e);
  process.exit(2);
});
