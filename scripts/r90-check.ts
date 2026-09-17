/**
 * r90 — بوابة «التصريحات النزيهة» في AdSense test (bun, no Next.js, no real network).
 *
 * Answers Google's misrepresentation notice example «incomplete or deceptively
 * inaccurate data in ad serving requests, such as partial or inaccurate URLs»:
 * adsbygoogle.js used to load on EVERY Vercel URL (per-deployment hashes,
 * branch previews) — now only declared hosts may talk to Google's ad systems.
 *
 * Verifies:
 *   A) lib/ads host gate: primary host derivation, allowed set, exact-match
 *      guard (subdomain/www/typo hosts stay OUT), extra-hosts parser
 *   B) Gate wiring: layout renders <AdsenseGate/>, the unconditional pagead2
 *      script is GONE, ownership meta tag stays site-wide
 *   C) adsense-gate.tsx: client component, conditional Script, correct id/src
 *   D) use-ads-host-allowed.ts: SSR-safe hook over isAdsAllowedHost
 *   E) AdSlot: host gate with a hooks-safe early return (return AFTER useEffect)
 *   F) Declarations intact: ads.txt exact content, placements untouched
 *
 * Run from the repo root:  bun scripts/r90-check.ts
 */

import {
  ADS_ALLOWED_HOSTS,
  ADS_PRIMARY_HOST,
  ADSENSE_CLIENT,
  isAdsAllowedHost,
  parseExtraAdHosts,
} from "../src/lib/ads";
import { readFileSync, existsSync } from "node:fs";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const read = (p: string) => readFileSync(p, "utf8");

console.log("\n[A] lib/ads — بوابة المضيفين");
ok("ADSENSE_CLIENT ثابت كما هو", ADSENSE_CLIENT === "ca-pub-8081529487869617");
ok("المضيف الأساسي = gu-mo.vercel.app (من SITE_URL)", ADS_PRIMARY_HOST === "gu-mo.vercel.app");
ok("المضيف الأساسي ضمن المسموحين", ADS_ALLOWED_HOSTS.includes("gu-mo.vercel.app"));
ok("localhost تشخيصياً ضمن المسموحين", ADS_ALLOWED_HOSTS.includes("localhost"));
ok("127.0.0.1 ضمن المسموحين", ADS_ALLOWED_HOSTS.includes("127.0.0.1"));
ok("بلا تكرار في القائمة", new Set(ADS_ALLOWED_HOSTS).size === ADS_ALLOWED_HOSTS.length);
ok("يقبل المضيف الرسمي", isAdsAllowedHost("gu-mo.vercel.app"));
ok("يقبل بحروف كبيرة (تطبيع الحالة)", isAdsAllowedHost("GU-MO.VERCEL.APP"));
ok("يقبل هوامش فراغية", isAdsAllowedHost("  gu-mo.vercel.app  "));
ok("يرفض www بادئة", !isAdsAllowedHost("www.gu-mo.vercel.app"));
ok("يرفض نطاقاً فرعياً مزيفاً", !isAdsAllowedHost("evil.gu-mo.vercel.app"));
ok("يرفض لاحقة مخادعة", !isAdsAllowedHost("gu-mo.vercel.app.evil.io"));
ok("يرفض استبدال شرطة", !isAdsAllowedHost("gu_mo.vercel.app"));
ok("يرفض نطاقاً غريباً", !isAdsAllowedHost("gumo-dz.com"));
ok("يرفض سلسلة فارغة", !isAdsAllowedHost(""));

console.log("\n[A+] parseExtraAdHosts — مُحلّل المضيفين الإضافيين");
ok("فراغ → []", JSON.stringify(parseExtraAdHosts(undefined)) === "[]");
ok("نص فارغ → []", JSON.stringify(parseExtraAdHosts("")) === "[]");
ok("فاصلة وحيدة → []", JSON.stringify(parseExtraAdHosts(",")) === "[]");
ok(
  "مضيف واحد",
  JSON.stringify(parseExtraAdHosts("talib-dz.com")) === '["talib-dz.com"]'
);
ok(
  "عدة مضيفين مع فراغات",
  JSON.stringify(parseExtraAdHosts(" talib-dz.com , gumo.dz ")) ===
    '["talib-dz.com","gumo.dz"]'
);
ok("تطبيع حالة الأسطر", JSON.stringify(parseExtraAdHosts("WWW.Example.COM")) === '["example.com"]');
ok(
  "إزالة تكرار عبر Set في المسموحين (محاكاة)",
  (() => {
    const merged = new Set(["gu-mo.vercel.app", ...parseExtraAdHosts("gu-mo.vercel.app,x.io")]);
    return merged.size === 2;
  })()
);

console.log("\n[B] layout.tsx — التوصيل");
const layout = read("src/app/layout.tsx");
ok("layout يعرض <AdsenseGate />", /<AdsenseGate\s*\/>/.test(layout));
ok("لا سكربت pagead2 غير المشروط بعد الآن", !layout.includes("pagead2"));
ok("لم يبق استيراد next/script في layout", !layout.includes('from "next/script"'));
ok("وسم الملكية google-adsense-account باقٍ في كل المواقع", layout.includes('"google-adsense-account"'));
ok("الوسم يستخدم ADSENSE_CLIENT (لا معرفاً حرفياً مكرراً)", layout.includes("google-adsense-account\": ADSENSE_CLIENT"));

console.log("\n[C] adsense-gate.tsx — البوابة");
const gate = read("src/components/ads/adsense-gate.tsx");
ok("الملف موجود", existsSync("src/components/ads/adsense-gate.tsx"));
ok("مكوّن عميل", gate.trimStart().startsWith('"use client"'));
ok("يستورد next/script", gate.includes('from "next/script"'));
ok("يستخدم useAdsHostAllowed", gate.includes("useAdsHostAllowed"));
ok("يعيد null حين يُمنع المضيف", /if \(!allowed\) return null;/.test(gate));
ok("معرّف السكربت google-adsense", gate.includes('id="google-adsense"'));
ok("المصدر pagead2 adsbygoogle.js", gate.includes("pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"));
ok("المصدر يبني من ADSENSE_CLIENT", gate.includes("client=${ADSENSE_CLIENT}"));
ok("strategy afterInteractive", gate.includes('strategy="afterInteractive"'));

console.log("\n[D] use-ads-host-allowed.ts — الخُطّاف");
const hook = read("src/components/ads/use-ads-host-allowed.ts");
ok("الملف موجود", existsSync("src/components/ads/use-ads-host-allowed.ts"));
ok("مكوّن عميل", hook.trimStart().startsWith('"use client"'));
ok("يستورد isAdsAllowedHost", hook.includes("isAdsAllowedHost"));
ok("يقرأ window.location.hostname", hook.includes("window.location.hostname"));
ok("SSR-آمن: useSyncExternalStore بلا أي setState", hook.includes("useSyncExternalStore") && !hook.includes("setState") && !hook.includes("useState"));
ok("لقطة الخادم false (توافق HTML)", hook.includes("() => false"));

console.log("\n[E] AdSlot — الحارس بدون كسر قواعد الخُطّافات");
const slot = read("src/components/ads/ad-slot.tsx");
ok("AdSlot يستخدم الخُطّاف", slot.includes("useAdsHostAllowed()"));
ok(
  "الإرجاع المبكر بعد useEffect (ترتيب الخُطّافات ثابت)",
  (() => {
    const gateIdx = slot.indexOf("useAdsHostAllowed()");
    const effectIdx = slot.indexOf("useEffect(() => {");
    const retIdx = slot.indexOf("if (!adsAllowed) return null;");
    return gateIdx > -1 && effectIdx > -1 && retIdx > effectIdx && retIdx > gateIdx;
  })()
);
ok("لا إرجاع مبكر قبل آخر استدعاء خطّاف", (() => {
  // آخر useState/useRef قبل الإرجاع، ولا خطّافات بعده
  const retIdx = slot.indexOf("if (!adsAllowed) return null;");
  const after = slot.slice(retIdx);
  return !after.includes("useEffect(") && !after.includes("useState(");
})());
ok("data-ad-client من ADSENSE_CLIENT كما هو", slot.includes("data-ad-client={ADSENSE_CLIENT}"));

console.log("\n[F] التصريحات قائمة كما هي");
const adsTxt = read("public/ads.txt").trim();
ok(
  "ads.txt بالمحتوى الصحيح حرفياً",
  adsTxt === "google.com, pub-8081529487869617, DIRECT, f08c47fec0942fa0",
  `فعلي: ${adsTxt}`
);
const placements = [
  "src/app/page.tsx",
  "src/app/[slug]/page.tsx",
  "src/app/blog/page.tsx",
  "src/app/blog/[slug]/page.tsx",
  "src/app/features/page.tsx",
  "src/app/guide/page.tsx",
];
for (const p of placements) {
  ok(`مساحة إعلانية باقية: ${p}`, read(p).includes("AdSlot"));
}

console.log(`\n=== r90: ${pass}/${pass + fail} ===`);
if (fail > 0) process.exit(1);
