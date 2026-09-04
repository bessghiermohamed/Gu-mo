import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Replaces the old static public/robots.txt — same open policy, now with a
// Sitemap reference so Search Console picks the map up automatically.
// The ads test page is disallowed at whatever path the owner configured
// (ADS_TEST_PATH env — same variable the [slug] route reads; Vercel
// redeploys on env change so both stay in sync).
const ADS_PATH = (process.env.ADS_TEST_PATH ?? "ads-test").trim().toLowerCase();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [`/${ADS_PATH}`, "/app", "/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
