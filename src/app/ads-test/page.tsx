import type { Metadata } from "next";
import Link from "next/link";
import { AdUnit } from "@/components/ads/ad-unit";

// Dedicated owner page for verifying ad units render correctly.
// noindex: thin test content must not dilute the main site during the
// AdSense review. Flip adTest to false AFTER Google approves the site.
export const metadata: Metadata = {
  title: "اختبار الإعلانات | طالب",
  robots: { index: false, follow: false },
};

export default function AdsTestPage() {
  return (
    <main dir="rtl" className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:py-14">
        <header className="space-y-2">
          <span className="inline-flex items-center rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
            وضع الاختبار — إعلانات تجريبية
          </span>
          <h1 className="text-2xl font-bold">اختبار الإعلانات</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            صفحة مخصصة لتجربة وحدات إعلانات Google AdSense قبل تفعيلها داخل
            التطبيق. تظهر هنا إعلانات تجريبية للتحقق من الموضع والاستجابة على
            مختلف أحجام الشاشات.
          </p>
        </header>

        <section className="space-y-3 rounded-2xl border bg-muted/30 p-4">
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">وحدة «Mimo»</span>
            <span className="font-mono" dir="ltr">
              slot 4214645931 · responsive
            </span>
          </div>
          <AdUnit adSlot="4214645931" adTest />
        </section>

        <p className="text-xs leading-relaxed text-muted-foreground">
          ملاحظة: الإعلانات الحقيقية لن تظهر قبل موافقة Google على الموقع. في
          وضع الاختبار تظهر لافتة «إعلان تجريبي» للتأكد من أن الوحدة تعمل بشكل
          سليم.
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
