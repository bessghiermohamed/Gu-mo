import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdUnit } from "@/components/ads/ad-unit";

/**
 * Owner-only ads test page at a CONFIGURABLE path.
 *
 * The fixed /ads-test route was removed by owner request — instead this
 * catch-all segment renders the test page only when the URL matches the
 * ADS_TEST_PATH environment variable (default: "ads-test"). The owner can
 * change it any time in Vercel → Settings → Environment Variables
 * (ADS_TEST_PATH = e.g. "check-7f2k") — no code edit needed, and old paths
 * 404 automatically, so the page stays effectively private.
 *
 * Any other unknown single-segment path falls through to notFound() (the
 * Arabic 404), exactly as before.
 *
 * ADS_TEST_REAL="true" switches the unit from Google's visible "test ad"
 * placeholder to real ads (use after the site is approved).
 */

// Runtime env (server-side) → path change applies after redeploy, which
// Vercel triggers automatically on env changes.
const ADS_PATH = (process.env.ADS_TEST_PATH ?? "ads-test").trim().toLowerCase();
const REAL_ADS = (process.env.ADS_TEST_REAL ?? "").trim().toLowerCase() === "true";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "اختبار الإعلانات | طالب",
  // Thin test content must never be indexed, whatever path it lives at.
  robots: { index: false, follow: false },
};

export default async function AdsTestPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (decodeURIComponent(slug).trim().toLowerCase() !== ADS_PATH) {
    notFound();
  }

  return (
    <main dir="rtl" className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:py-14">
        <header className="space-y-2">
          <span className="inline-flex items-center rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
            {REAL_ADS ? "إعلانات حقيقية — وضع الإنتاج" : "وضع الاختبار — إعلانات تجريبية"}
          </span>
          <h1 className="text-2xl font-bold">اختبار الإعلانات</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            صفحة خاصة بمالك الموقع لتجربة وحدات Google AdSense قبل تفعيلها داخل
            التطبيق. مسار الصفحة قابل للتغيير من متغير البيئة{" "}
            <code dir="ltr" className="rounded bg-muted px-1.5 py-0.5 text-xs">
              ADS_TEST_PATH
            </code>{" "}
            في إعدادات الاستضافة.
          </p>
        </header>

        <section className="space-y-3 rounded-2xl border bg-muted/30 p-4">
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">وحدة «Mimo»</span>
            <span className="font-mono" dir="ltr">
              slot 4214645931 · responsive
            </span>
          </div>
          <AdUnit adSlot="4214645931" adTest={!REAL_ADS} />
        </section>

        <p className="text-xs leading-relaxed text-muted-foreground">
          ملاحظة: الإعلانات الحقيقية لن تظهر قبل موافقة Google على الموقع. في
          وضع الاختبار تظهر لافتة «إعلان تجريبي» للتأكد من أن الوحدة تعمل بشكل
          سليم. لتمكين الإعلانات الحقيقية هنا، اضبط{" "}
          <code dir="ltr" className="rounded bg-muted px-1.5 py-0.5">
            ADS_TEST_REAL=true
          </code>
          .
        </p>

        <Link
          href="/app"
          className="inline-block text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          ← الرجوع إلى التطبيق
        </Link>
      </div>
    </main>
  );
}
