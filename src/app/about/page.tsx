import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, GraduationCap, Heart, ShieldCheck, MapPin } from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";

export const metadata: Metadata = {
  title: "من نحن | طالب | Talib",
  description:
    "قصة منصة طالب: لماذا بُنيت، لمَن، ومبادئها — منصة جزائرية مستقلة تُطوَّر بإصغاء لطلبة المدرسة العليا للأساتذة بووزعادة.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <header className="space-y-3">
          <h1 className="text-3xl font-extrabold">من نحن</h1>
          <p className="leading-relaxed text-muted-foreground">
            قصة قصيرة عن منصة صغيرة طموحة، بدأت من مشكلة يعرفها كل طالب
            جزائري.
          </p>
        </header>

        <div className="mt-10 space-y-10 text-foreground/90">
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-primary">البداية: مشكلة نعرفها جميعاً</h2>
            <p className="leading-loose">
              كل طالب جزائري عاش المشهد نفسه: جدول مصوَّر في مجموعة واتساب يظهر
              بجودة رديئة على هاتف صغير، إعلان هام يضيع بين ألف رسالة، واجب
              تذكّرته ليلة تسليمه، وملف مهم انقرض مع ضياع هاتف قديم. أدوات
              «تنظيم الدراسة» الموجودة إما أجنبية لا تحترم لغتنا واتجاه كتابتنا،
              وإما معقدة صُممت لإدارات لا لطلاب.
            </p>
            <p className="leading-loose">
              من هنا وُلد «طالب»: رفيق أكاديمي بسيط، عربي أصيل، يعرف أن الطالب
              يحتاج الهدوء والنظام أكثر من يحتاج المزيد من الميزات المتضخمة.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-primary">ماذا نبني بالضبط؟</h2>
            <p className="leading-loose">
              نحن منصة ويب تعليمية مستقلة تخدم حالياً طلبة المدرسة العليا
              للأساتذة بووزعادة، وتوسعها التدريجي نحو مؤسسات جزائرية أخرى جارٍ
              بالتنسيق مع مشرفين من كل مؤسسة. ما نقدمه هو التنظيم الأكاديمي
              اليومي: مقررات، جدول رسمي وشخصي، علامات ومعدل، واجبات، ملفات
              خاصة، فوج، وإشعارات تصل في وقتها.
            </p>
            <p className="leading-loose">
              تقنياً، طالب مبني على Next.js وقواعد بيانات سحابية مشفرة — وهو
              اختيار مقصود ليصل إليك سريعاً من أي جهاز دون تثبيت، ويحترم باقة
              إنترنت الحرم الجامعي.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-primary">مبادئنا الثلاثة</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2 rounded-2xl border bg-card p-5">
                <ShieldCheck className="h-6 w-6 text-primary" aria-hidden="true" />
                <h3 className="text-sm font-bold">الخصوصية أولاً</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  أدنى قدر من البيانات، تشفير كامل، ولا بيع ولا مشاركة — حسابك
                  ملكك وقابل للحذف الكامل متى شئت.
                </p>
              </div>
              <div className="space-y-2 rounded-2xl border bg-card p-5">
                <GraduationCap className="h-6 w-6 text-primary" aria-hidden="true" />
                <h3 className="text-sm font-bold">العربية أصالةً</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  واجهة صُممت من الأساس بالعربية وRTL — لا قالب مترجم، بخط
                  القاهرة وتفاصيل تخدم قارئها الطبيعي.
                </p>
              </div>
              <div className="space-y-2 rounded-2xl border bg-card p-5">
                <Heart className="h-6 w-6 text-primary" aria-hidden="true" />
                <h3 className="text-sm font-bold">الهدوء تصميماً</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  أقل تشويش بصر ممكن: تصميم مسطح مسالم يعين التركيز لا يسلب —
                  لأن وقت الطالب أثمن عنصر في المعادلة.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-primary">كيف تُدار وتُموَّل؟</h2>
            <p className="leading-loose">
              يطور المنصة فريق مستقّل من الطلبة السابقين والمهتمين بالتعليم،
              بإشراف أكاديمي من مشرفي الأفواج لضمان صحة المحتوى. الدعم المالي
              يأتي من مساحات إعلانية محدودة في الموقع العام (داخل مساحة بياناتك
              الأكاديمية لا إعلانات) ومن شراكات رعاية مستقبلية مع جهات تخدم
              الطالب — وتبقى الخدمة الجوهرية مجانية لكل طالب دائماً.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-primary">أين نعمل؟</h2>
            <p className="inline-flex items-center gap-2 leading-loose">
              <MapPin className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
              الجزائر العاصمة — وخدمة الطلاب في كل ولايات الوطن عبر الإنترنت.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-primary">شارك في صناعة طالب</h2>
            <p className="leading-loose">
              معظم تحسينات المنصة جاءت من ملاحظات طلاب حقيقيين. إن كان عندك رأي
              في شيء يعمل بشكل خاطئ، أو فكرة تختصر على غيرك ساعة أسبوعياً —
              نريد سماعها حقاً.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
              >
                راسلنا
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/app"
                className="inline-flex items-center gap-2 rounded-full border bg-card px-5 py-2.5 text-sm font-bold transition-colors hover:bg-muted"
              >
                دخول التطبيق
              </Link>
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
