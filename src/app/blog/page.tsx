import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock } from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { AdUnit } from "@/components/ads/ad-unit";
import { BLOG_POSTS } from "@/lib/blog";

export const metadata: Metadata = {
  title: "المدونة — مقالات ونصائح للطالب الجامعي | طالب | Talib",
  description:
    "مقالات عملية للطالب الجزائري: حساب المعدل بالمعاملات، طريقة بومودورو للمراجعة، تنظيم الوثائق الرقمية بصيغة PDF، وبناء جدول مراجعة أسبوعي واقعي.",
  alternates: { canonical: "/blog" },
};

// ar-DZ yields the Algerian Arabic month names (جانفي، فيفري…) students use.
function formatDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("ar-DZ", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function BlogIndexPage() {
  const posts = [...BLOG_POSTS].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <header className="space-y-3">
          <h1 className="text-3xl font-extrabold">المدونة</h1>
          <p className="leading-relaxed text-muted-foreground">
            مقالات قصيرة عملية نتكتبها لطلبة الجامعة: طرق مراجعة مجرَّبة، تنظيم
            وثائق، وحساب معدل — كل ما يختصر عليك ساعة أسبوعياً أو يرفع علامة
            نقطة واحدة. بلا حشو وبلا نصائح عامة مستهلكة.
          </p>
        </header>

        <div className="mt-8 space-y-5">
          {posts.map((p) => (
            <article
              key={p.slug}
              className="group space-y-3 rounded-2xl border bg-card p-6 transition-shadow hover:shadow-md"
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                  {formatDate(p.date)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {p.readingMinutes} دقائق قراءة
                </span>
              </div>
              <h2 className="text-lg font-extrabold leading-snug">
                <Link
                  href={`/blog/${p.slug}`}
                  className="transition-colors hover:text-primary"
                >
                  {p.title}
                </Link>
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {p.excerpt}
              </p>
              <Link
                href={`/blog/${p.slug}`}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline-offset-4 hover:underline"
              >
                اقرأ المقال
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>

        <div className="mt-10 rounded-xl border bg-muted/30 p-3" aria-label="مساحة إعلانية">
          <AdUnit adSlot="4214645931" />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
