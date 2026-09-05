// Single source of truth for the PUBLIC site config (landing + content pages).
// The app itself lives at /app behind login; these pages exist so crawlers and
// the AdSense review team can read real, server-rendered content.
//
// Set NEXT_PUBLIC_SITE_URL in Vercel to the production domain (e.g.
// https://talib.example.com). The fallback must stay a plausible absolute URL
// because sitemap.ts / robots.ts / canonical URLs all derive from it.
// round 36: an EMPTY NEXT_PUBLIC_SITE_URL (=) used to defeat the ??
// fallback (empty string is not nullish) and break canonical/sitemap URLs —
// trim + || so an empty value falls back like a missing one.
export const SITE_URL =
  (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim() || "https://gu-mo.vercel.app";

export const SITE_NAME = "طالب | Talib";
export const SITE_TAGLINE = "رفيقك الأكاديمي الشامل";
export const SITE_DESCRIPTION =
  "منصة «طالب» الدراسية للطلاب الجزائريين: المقررات، المحاضرات، الجدول الذكي، حاسبة العلامات، الواجبات، ملفاتي، الفوج والإشعارات — كل ما يحتاجه الطالب في مكان واحد.";
export const CONTACT_EMAIL = "besseghiermohamed719@gmail.com";
