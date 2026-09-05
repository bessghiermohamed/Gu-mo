import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { BLOG_POSTS } from "@/lib/blog";

// Public content pages only — the login-walled app and the noindex'd
// /ads-test are deliberately excluded so crawlers index real content.
export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    { path: "", priority: 1.0 },
    { path: "/features", priority: 0.9 },
    { path: "/guide", priority: 0.8 },
    { path: "/blog", priority: 0.7 },
    { path: "/faq", priority: 0.8 },
    { path: "/about", priority: 0.6 },
    { path: "/contact", priority: 0.6 },
    { path: "/privacy", priority: 0.5 },
    { path: "/terms", priority: 0.5 },
  ];

  const blogRoutes: MetadataRoute.Sitemap = BLOG_POSTS.map((p) => ({
    url: `${SITE_URL}/blog/${p.slug}`,
    lastModified: new Date(p.date),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [
    ...routes.map((r) => ({
      url: `${SITE_URL}${r.path}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: r.priority,
    })),
    ...blogRoutes,
  ];
}
