/**
 * r61 — offline experience end-to-end test against the PRODUCTION build
 * served locally (next start :3131, seeded local DB).
 *
 * Playwright's context.setOffline(true) is the REAL offline simulation: it
 * flips navigator.onLine to false AND blocks every network request — the
 * same condition the owner reproduced manually. The r61 service worker
 * serves the cached app shell on offline reloads, exactly like a real
 * browser with a registered SW.
 *
 * Scenario chain:
 *  S1  online login → app; warm read caches; bridge keys present; SW armed
 *      + one ONLINE reload through the SW (warms every chunk)
 *  S2  offline RELOAD (still logged in) → SW shell boots, session restored
 *      from the device cache + cached-mode in-app banner
 *  S3  offline courses/schedule → «بيانات محفوظة» chip
 *  S4  back online → banner+chip gone + «عاد الاتصال» toast
 *  S5  online sign-out → flag set, device bridge survives
 *  S6  offline reload → LOGIN screen (no resurrection) + returning hint
 *      + prefilled name/email  ← the owner's literal report
 *  S7  submit offline → session granted («وضع عدم الاتصال»)
 *  S8  offline sign-out + wrong-name login → mismatch error
 *  S9  back online → silent re-auth keeps the user signed in
 *  S10 offline sign-out → reconnect → zombie cookie killed, stays logged out
 *  S11 no unexpected console/page errors (+ dark screenshot)
 */
const { chromium } = require("playwright");
const fs = require("fs");

const BASE = "http://localhost:3131";
const NAME = "طالبة التحقق";
const EMAIL = "r52-student@test.dz";
const OUT = "/home/z/my-project/download/r61";
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, extra = "") {
  results.push({ name, ok, extra });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${extra ? " | " + extra : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Playwright's setOffline blocks the network but does NOT flip
 *  navigator.onLine on freshly-reloaded documents (CDP emulation quirk; a
 *  real disconnected browser reports onLine=false to every new document).
 *  Override the property to match real-browser semantics, then dispatch the
 *  events the browser would have fired. */
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
      delete navigator.onLine; // restore the prototype getter → true
      window.dispatchEvent(new Event("online"));
    })
    .catch(() => {});
}

async function gotoHash(page, hash) {
  await page.evaluate((h) => {
    location.hash = h;
  }, hash);
  await sleep(600);
}

async function loginOnline(page) {
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  const signinTab = page.getByRole("tab", { name: /تسجيل الدخول/ });
  if (await signinTab.count()) await signinTab.first().click().catch(() => {});
  await page.locator("#fullName").fill(NAME);
  await page.locator("#email").fill(EMAIL);
  await page.getByRole("button", { name: /دخول|تسجيل الدخول/ }).first().click();
  await page.waitForSelector("header", { timeout: 15000 });
}

async function signOutViaUi(page) {
  await gotoHash(page, "#/profile");
  await sleep(400);
  await page.getByText("تسجيل الخروج").first().click();
  await page.waitForSelector("#fullName", { timeout: 15000 });
  await sleep(400);
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
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  // ── S1 online login + warm caches + arm the service worker ────────
  await loginOnline(page);
  // a returning device (the owner's case) has long finished the first-run
  // tour — mark it done so the tour's journey driver can't fight the test's
  // navigation (fresh profiles otherwise get the once-per-user tour)
  await page.evaluate(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("talib-cached-user") || "null");
      if (raw && raw.id) localStorage.setItem(`talib-tour-${raw.id}`, "done");
    } catch {}
  });
  await gotoHash(page, "#/courses");
  await sleep(1200);
  await gotoHash(page, "#/schedule");
  await sleep(1200);
  const bridge = await page.evaluate(() => ({
    user: !!localStorage.getItem("talib-cached-user"),
    last: !!localStorage.getItem("talib-last-login"),
    courses: !!localStorage.getItem("talib-ocache:/api/courses"),
    schedule: !!localStorage.getItem("talib-ocache:/api/schedule"),
    flag: localStorage.getItem("talib-signed-out"),
  }));
  check(
    "S1 bridge + data caches populated, signed-out flag absent",
    bridge.user && bridge.last && bridge.courses && bridge.schedule && !bridge.flag,
    JSON.stringify(bridge)
  );

  // arm the SW (registered on app mount) + one ONLINE reload so every
  // chunk flows through the worker and lands in the shell cache
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("header", { timeout: 15000 });
  await sleep(1000);
  const swState = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const keys = await caches.keys();
    let n = 0;
    for (const k of keys) {
      const c = await caches.open(k);
      n += (await c.keys()).length;
    }
    return { active: !!reg?.active, cacheKeys: keys, entries: n };
  });
  check(
    "S1b service worker active + shell cache populated",
    swState.active && swState.entries > 3,
    JSON.stringify(swState)
  );

  // ── S2 offline RELOAD → SW shell + session restored ───────────────
  await goOffline(context, page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(3500);
  const restored = (await page.locator("header").count()) > 0;
  const bannerCached = await page
    .getByText(/الجلسة والبيانات المعروضة محفوظة على جهازك/)
    .count();
  check(
    "S2 offline reload → SW shell boots, session restored + cached banner",
    restored && bannerCached > 0,
    `restored=${restored} banner=${bannerCached}`
  );
  await page.screenshot({ path: `${OUT}/offline-reload-restored.png` });

  // ── S3 offline courses → chip ──────────────────────────────────────
  await gotoHash(page, "#/courses");
  await sleep(2000);
  const chip = await page.getByText(/بيانات محفوظة على جهازك/).count();
  check("S3 offline courses → «بيانات محفوظة» chip", chip > 0, `chip=${chip}`);
  await page.screenshot({ path: `${OUT}/offline-courses-cached.png` });

  await gotoHash(page, "#/schedule");
  await sleep(2000);
  const chipS = await page.getByText(/بيانات محفوظة على جهازك/).count();
  check("S3b offline schedule → chip", chipS > 0, `chip=${chipS}`);

  // ── S4 back online → banner gone + toast + fresh data ─────────────
  await goOnline(context, page);
  await sleep(3500);
  const bannerGone = !(await page
    .getByText(/الجلسة والبيانات المعروضة محفوظة/)
    .count());
  const backToast = await page.getByText(/عاد الاتصال بالإنترنت/).count();
  const chipGone = !(await page.getByText(/بيانات محفوظة على جهازك/).count());
  check(
    "S4 back online → banner+chip gone, re-sync toast",
    bannerGone && backToast > 0 && chipGone,
    `bannerGone=${bannerGone} toast=${backToast} chipGone=${chipGone}`
  );

  // ── S5 online sign-out (bridge must survive) ───────────────────────
  await signOutViaUi(page);
  const afterOut = await page.evaluate(() => ({
    user: !!localStorage.getItem("talib-cached-user"),
    last: !!localStorage.getItem("talib-last-login"),
    flag: localStorage.getItem("talib-signed-out"),
  }));
  check(
    "S5 online sign-out → bridge survives + flag set",
    afterOut.user && afterOut.last && afterOut.flag === "1",
    JSON.stringify(afterOut)
  );

  // ── S6 offline reload → login screen, NO resurrection ─────────────
  await goOffline(context, page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(3500);
  // a real disconnected browser reports offline to the fresh document too —
  // CDP emulation doesn't, so apply the same override + event it would send
  await page
    .evaluate(() => {
      Object.defineProperty(navigator, "onLine", { get: () => false, configurable: true });
      window.dispatchEvent(new Event("offline"));
    })
    .catch(() => {});
  await sleep(600);
  const atLogin = (await page.locator("#fullName").count()) > 0;
  const hint = await page.getByText(/يمكنك الدخول الآن بآخر بيانات/).count();
  const pfName = await page.locator("#fullName").inputValue();
  const pfEmail = await page.locator("#email").inputValue();
  const offBanner = await page.getByText("أنت غير متصل بالإنترنت").count();
  check(
    "S6 offline+signed-out → login screen + returning hint + prefill",
    atLogin && hint > 0 && offBanner > 0 && pfName === NAME && pfEmail === EMAIL,
    `name="${pfName}" email="${pfEmail}" hint=${hint} banner=${offBanner}`
  );
  await page.screenshot({ path: `${OUT}/offline-login-prefilled.png` });

  // ── S7 submit → offline login granted ─────────────────────────────
  await page.getByRole("button", { name: /دخول|تسجيل الدخول/ }).first().click();
  await sleep(2500);
  const granted = (await page.locator("header").count()) > 0;
  // re-mark the tour done after every (re)login — fresh session, same device
  await page.evaluate(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("talib-cached-user") || "null");
      if (raw && raw.id) localStorage.setItem(`talib-tour-${raw.id}`, "done");
    } catch {}
  });
  const grantToast = await page.getByText(/تم الدخول في وضع عدم الاتصال/).count();
  const inAppBanner = await page
    .getByText(/الجلسة والبيانات المعروضة محفوظة على جهازك/)
    .count();
  check(
    "S7 offline login → granted (toast + in-app banner)",
    granted && grantToast > 0 && inAppBanner > 0,
    `granted=${granted} toast=${grantToast} banner=${inAppBanner}`
  );
  await page.screenshot({ path: `${OUT}/offline-login-granted.png` });

  // ── S8 offline sign-out then WRONG name → mismatch ────────────────
  await signOutViaUi(page); // offline sign-out path (r58+r61)
  const s8state = await page.evaluate(() => ({
    flag: localStorage.getItem("talib-signed-out"),
    pending: sessionStorage.getItem("talib-pending-signout"),
    user: !!localStorage.getItem("talib-cached-user"),
    last: !!localStorage.getItem("talib-last-login"),
  }));
  check(
    "S8a offline sign-out → flag + pending marker, bridge survives",
    s8state.flag === "1" && s8state.pending === "1" && s8state.user && s8state.last,
    JSON.stringify(s8state)
  );
  await page.locator("#fullName").fill("اسم خاطئ تماماً");
  await page.locator("#email").fill(EMAIL);
  await page.getByRole("button", { name: /دخول|تسجيل الدخول/ }).first().click();
  await sleep(1200);
  const mismatch = await page
    .getByText(/دون اتصال يمكن الدخول بآخر بيانات/)
    .count();
  check("S8b offline login wrong name → mismatch error", mismatch > 0, `mismatch=${mismatch}`);
  await page.screenshot({ path: `${OUT}/offline-login-mismatch.png` });

  // ── S9 back online after an offline grant → auto re-auth ──────────
  await page.locator("#fullName").fill(NAME);
  await page.locator("#email").fill(EMAIL);
  await page.getByRole("button", { name: /دخول|تسجيل الدخول/ }).first().click();
  await sleep(2000);
  const granted2 = (await page.locator("header").count()) > 0;
  check("S9a offline re-login granted", granted2);
  await goOnline(context, page);
  await sleep(4500); // online → refresh → me:null (cookie killed at S5) → silent re-auth
  const stillIn = (await page.locator("header").count()) > 0;
  const loginGone = (await page.locator("#fullName").count()) === 0;
  const bannerGone2 = !(await page
    .getByText(/الجلسة والبيانات المعروضة محفوظة/)
    .count());
  check(
    "S9b back online → silent re-auth keeps the user signed in",
    stillIn && loginGone && bannerGone2,
    `in=${stillIn} loginGone=${loginGone} bannerGone=${bannerGone2}`
  );
  await page.screenshot({ path: `${OUT}/back-online-resynced.png` });

  // ── S10 offline sign-out → reconnect → zombie cookie killed ───────
  await goOffline(context, page);
  await sleep(1500);
  await signOutViaUi(page);
  await goOnline(context, page);
  await sleep(3500); // online event → pending marker → cookie killed
  let atLogin2 = (await page.locator("#fullName").count()) > 0;
  if (!atLogin2) {
    await page.reload({ waitUntil: "domcontentloaded" });
    await sleep(3000);
    atLogin2 = (await page.locator("#fullName").count()) > 0;
  }
  check("S10 offline sign-out + reconnect → NOT resurrected", atLogin2);

  // ── S11 dark screenshot of the offline state ──────────────────────
  await goOffline(context, page);
  await sleep(1000);
  await page.locator("#fullName").fill(NAME);
  await page.locator("#email").fill(EMAIL);
  await page.getByRole("button", { name: /دخول|تسجيل الدخول/ }).first().click();
  await sleep(2000);
  await page.emulateMedia({ colorScheme: "dark" });
  await page
    .locator('header button[aria-label="Toggle dark mode"]')
    .click()
    .catch(() => {});
  await sleep(900);
  await gotoHash(page, "#/courses");
  await sleep(2000);
  await page.screenshot({ path: `${OUT}/offline-app-dark.png` });
  await goOnline(context, page);
  await sleep(1000);

  // ── summary ───────────────────────────────────────────────────────
  const realErrors = errors.filter(
    (e) =>
      !e.includes("net::ERR") && // expected while offline
      !e.includes("Failed to load resource") // expected while offline
  );
  check(
    "S11 no unexpected console/page errors",
    realErrors.length === 0,
    realErrors.slice(0, 3).join(" ;; ")
  );

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n═══ ${results.length - failed.length}/${results.length} PASSED ═══`);
  process.exit(failed.length > 0 ? 1 : 0);
})().catch((e) => {
  console.error("SCRIPT ERROR:", e);
  process.exit(2);
});
