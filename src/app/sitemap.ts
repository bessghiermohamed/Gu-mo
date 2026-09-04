import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Public content pages only — the login-walled app and the noindex'd
// /ads-test are deliberately excluded so crawlers index real content.
export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    { path: "", priority: 1.0 },
    { path: "/features", priority: 0.9 },
    { path: "/guide", priority: 0.8 },
    { path: "/faq", priority: 0.8 },
    { path: "/about", priority: 0.6 },
    { path: "/contact", priority: 0.6 },
    { path: "/privacy", priority: 0.5 },
    { path: "/terms", priority: 0.5 },
  ];

  return routes.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: r.priority,
  }));
}
