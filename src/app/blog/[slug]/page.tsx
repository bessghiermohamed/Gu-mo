import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock } from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { AdUnit } from "@/components/ads/ad-unit";
import { BLOG_POSTS } from "@/lib/blog";
import { SITE_URL } from "@/lib/site";

// Article pages are fully static; unknown slugs 404 at build time.
export const dynamicParams = false;

export function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

const SITE_NAME = "طالب | Talib";

function formatDate(iso: string) {
  // ar-DZ yields the Algerian Arabic month names (جانفي، فيفري…).
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("ar-DZ", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = BLOG_POSTS.find((p) => p.slug === slug);
  if (!post) return {};
  return {
    title: `${post.title} | مدونة طالب`,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      publishedTime: post.date,
      locale: "ar_DZ",
      siteName: SITE_NAME,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = BLOG_POSTS.find((p) => p.slug === slug);
  // Unknown slugs are excluded statically (dynamicParams = false); this guard
  // covers the TypeScript narrowing (notFound() returns never).
  if (!post) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.date,
    inLanguage: "ar-DZ",
    author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteHeader />
      <main id="main" className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <article>
          <header className="space-y-4">
            <Link
              href="/blog"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline-offset-4 hover:underline"
            >
              كل المقالات
              <ArrowLeft className="h-4 w-4 rotate-180" aria-hidden="true" />
            </Link>
            <h1 className="text-2xl font-extrabold leading-snug sm:text-3xl">
              {post.title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                {formatDate(post.date)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {post.readingMinutes} دقائق قراءة
              </span>
            </div>
            <p className="border-r-2 border-primary/40 pr-4 leading-relaxed text-foreground/80">
              {post.excerpt}
            </p>
          </header>

          <div className="mt-10 space-y-9">
            {post.sections.map((s, i) => (
              <section key={s.heading} className="space-y-3">
                <h2 className="text-xl font-bold text-primary">{s.heading}</h2>
                {s.paragraphs.map((para, j) => (
                  <p key={j} className="leading-loose text-foreground/90">
                    {para}
                  </p>
                ))}
                {i === 1 && (
                  <div
                    className="rounded-xl border bg-muted/30 p-3"
                    aria-label="مساحة إعلانية"
                  >
                    <AdUnit adSlot="4214645931" />
                  </div>
                )}
              </section>
            ))}
          </div>
        </article>

        <div className="mt-12 rounded-2xl border bg-primary/5 p-8 text-center space-y-4">
          <h2 className="text-xl font-bold">جرّب طالب بنفسك</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            كل ما قرأته في هذه المقالة جاهز داخل التطبيق: الجدول الرسمي
            والشخصي، أدواتي، حاسبة العلامات، والواجبات — مجاناً بعد إنشاء حساب
            في دقيقة.
          </p>
          <Link
            href="/app"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            دخول التطبيق
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
