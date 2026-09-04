import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Replaces the old static public/robots.txt — same open policy, now with a
// Sitemap reference so Search Console picks the map up automatically.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/ads-test", "/app", "/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
