import type { Metadata } from "next";
import Link from "next/link";
import {
  BookOpen,
  CalendarDays,
  Calculator,
  FolderOpen,
  Bell,
  Users,
  FileText,
  Moon,
  GraduationCap,
  Smartphone,
  ShieldCheck,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { AdUnit } from "@/components/ads/ad-unit";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/lib/site";

export const metadata: Metadata = {
  title: "طالب | Talib — رفيقك الأكاديمي الشامل للطلاب الجزائريين",
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: "طالب | Talib — رفيقك الأكاديمي الشامل",
    description: SITE_DESCRIPTION,
    type: "website",
    locale: "ar_DZ",
    siteName: SITE_NAME,
  },
};

const FEATURES = [
  {
    icon: BookOpen,
    title: "المقررات والمحاضرات",
    desc: "كل مقررات تخصصك مرتبة في مكان واحد: الوصف، الأساتذة، المحاضرات والوثائق المرجعية، مع إمكانية متابعة ما أنجزته منها أسبوعياً.",
  },
  {
    icon: CalendarDays,
    title: "الجدول الذكي",
    desc: "جدولك الرسمي دائماً بين يديك، مع إمكانية إضافة حصصك الشخصية — دروس خصوصية، أعمال تطبيقية، مراجعة — بوضوح تام بين الرسمي والشخصي.",
  },
  {
    icon: Calculator,
    title: "حاسبة العلامات",
    desc: "داخل «أدواتي»: أدخل علاماتك بمعاملات مقاييسك الحقيقية، شاهد معدلك لحظياً، واعرف ماذا تحتاج في كل مقياس لتحقيق هدفك.",
  },
  {
    icon: FileText,
    title: "الواجبات والمهام",
    desc: "لا تفوّت أي واجب بعد اليوم: تتبّع مواعيد التسليم، علّم ما أنجزته، وضف ملاحظاتك الخاصة على كل واجب كي لا تضيع التفاصيل.",
  },
  {
    icon: FolderOpen,
    title: "ملفاتي",
    desc: "مكتبتك الشخصية: ارفع وصفاتك، ملخصاتك، وشهاداتك الدراسية، وابحث فيها بسرعة عند الحاجة — ملفاتك تبقى معك عبر المزامنة السحابية.",
  },
  {
    icon: Users,
    title: "الفوج والمجموعات",
    desc: "انضم إلى فوجك، تابع أعضاءه، وتواصل مع طلاب تخصصك نفسه. طلبات الانضمام تُدار بإشراف دقيق يحفظ خصوصية الجميع.",
  },
  {
    icon: Bell,
    title: "الإشعارات الفورية",
    desc: "تنبيهات بكل جديد: إعلان عام، واجب قريب، أو اختبار في الطريق — تصل إلى جهازك مباشرة حتى إشعارات تيليجرام إن رغبت.",
  },
  {
    icon: Moon,
    title: "وضع ليلي وتجربة هادئة",
    desc: "واجهة عربية أصيلة من اليمين إلى اليسار بخط القاهرة، وضع ليلي مريح للمراجرة المتأخرة، وتصميم خفيف لا يستهلك باقة الإنترنت.",
  },
];

const STEPS = [
  {
    n: "1",
    title: "أنشئ حسابك في دقيقة",
    desc: "الاسم واللقب، بريد إلكتروني، كلمة مرور — انتهى. لا نطلب معلومات شخصية حساسة، وحسابك يبقى ملكك ويمكنك حذفه متى شئت.",
  },
  {
    n: "2",
    title: "اختر مؤسستك وتخصصك",
    desc: "حدّد المدرسة العليا للأساتذة بووزعادة وتخصصك وشعبتك، فيظهر جدولك ومقرراتك تلقائياً كما أعلنها المشرفون — دون أي إدخال يدوي.",
  },
  {
    n: "3",
    title: "رافقك يوماً بيوم",
    desc: "افتح طالب صباحاً لتعرف حصص اليوم، في المساء لتسجيل الواجبات المنجزة، وقبل الاختبارات لتتبع مراجعتك. رفيق لا ينسى أبداً.",
  },
];

const FAQ_PREVIEW = [
  {
    q: "هل استخدام منصة طالب مجاني؟",
    a: "نعم، جميع الخدمات الأساسية مجانية بالكامل لكل الطلاب المسجلين: المقررات، الجدول، حاسبة العلامات، الواجبات، الملفات والإشعارات.",
  },
  {
    q: "هل أستطيع إضافة حصصي الخاصة إلى الجدول؟",
    a: "بالتأكيد — من شاشة الجدول أضف أي حصة شخصية (دروس خصوصية، مراجعة، عمل تطبيقي) وستظهر بلون مميز مع إمكانية تعديلها أو حذفها، منفصلة عن الجدول الرسمي.",
  },
  {
    q: "هل يعمل طالب على الهاتف؟",
    a: "نعم، طالب مصمم أول ما صُمم للهاتف: واجهة عربية من اليمين لليسار، أزرار بحجم مناسب للمس، وضع ليلي، وسرعة تحميل خفيفة تناسب شبكات الحرم الجامعي.",
  },
  {
    q: "أنا لست طالباً في ENS بووزعادة، هل يمكنني الاستخدام؟",
    a: "التسجيل متاح لطلبة المدرسة العليا للأساتذة بووزعادة حالياً لأن مقرراتهم وجداولهم مفعّلة. بنية المنصة تدعم كل المؤسسات، والتوسع لجامعات أخرى قادم تدريجياً.",
  },
];

const SCREENS = [
  { src: "/talib/screens/01-home-full.png", alt: "الشاشة الرئيسية لمنصة طالب: الخدمات الأكاديمية والإعلانات", caption: "الرئيسية — خدماتك في متناول اليد" },
  { src: "/talib/screens/02-settings-full.png", alt: "شاشة الإعدادات في منصة طالب: اللغة، الإشعارات والمزامنة", caption: "الإعدادات — تحكم كامل بتجربتك" },
  { src: "/talib/screens/03-settings-dark.png", alt: "الوضع الليلي في منصة طالب", caption: "الوضع الليلي — مريح للعين ليلًا" },
  { src: "/talib/screens/r27-personal-row.png", alt: "الجدول الذكي في منصة طالب مع الحصص الشخصية", caption: "الجدول — رسمي وشخصي معًا" },
];

export default function HomePage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: SITE_NAME,
        url: SITE_URL,
        inLanguage: "ar-DZ",
        description: SITE_DESCRIPTION,
      },
      {
        "@type": "SoftwareApplication",
        name: "طالب | Talib",
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web",
        inLanguage: "ar",
        description: SITE_DESCRIPTION,
        offers: { "@type": "Offer", price: "0", priceCurrency: "DZD" },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteHeader />
      <main id="main">
        {/* ===================== HERO ===================== */}
        <section className="relative overflow-hidden border-b bg-gradient-to-b from-primary/5 via-background to-background">
          <div className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
            <div className="grid items-center gap-10 md:grid-cols-2">
              <div className="space-y-6">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/15 px-3 py-1 text-xs font-bold text-secondary">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  منصة جزائرية ١٠٠٪ — بالعربية وبالاتجاه الصحيح
                </span>
                <h1 className="text-3xl font-extrabold leading-tight text-foreground sm:text-4xl">
                  طالب — رفيقك الأكاديمي
                  <span className="block text-primary">من أول محاضرة إلى التخرج</span>
                </h1>
                <p className="max-w-md text-base leading-relaxed text-muted-foreground">
                  توقّف عن المطاردة بين مجموعات الواتساب وصور الجدول القديمة والورق
                  المبعثر. منصة «طالب» تجمع مقرراتك، جدولك، علاماتك، واجباتك،
                  وملفاتك في مكان واحد منظم — مصممة بوعي لطلبة الجزائر، بلغتهم،
                  وبتقنية لا تتجسس عليك.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href="/app"
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-opacity hover:opacity-90"
                  >
                    ابدأ الآن — إنشاء حساب مجاني
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  <Link
                    href="/features"
                    className="inline-flex items-center gap-2 rounded-full border bg-card px-6 py-3 text-base font-bold text-foreground transition-colors hover:bg-muted"
                  >
                    اكتشف المميزات
                  </Link>
                </div>
                <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-muted-foreground">
                  <li className="inline-flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                    خصوصية محترمة — لا بيع للبيانات
                  </li>
                  <li className="inline-flex items-center gap-1.5">
                    <Smartphone className="h-4 w-4 text-primary" aria-hidden="true" />
                    يعمل على الهاتف والحاسوب
                  </li>
                  <li className="inline-flex items-center gap-1.5">
                    <GraduationCap className="h-4 w-4 text-primary" aria-hidden="true" />
                    مصمم لـ ENS بووزعادة
                  </li>
                </ul>
              </div>

              <div className="relative mx-auto w-full max-w-md">
                <img
                  src="/talib/hero-banner.jpg"
                  alt="منصة طالب الدراسية — نظرة عامة على الخدمات الأكاديمية"
                  width={1536}
                  height={768}
                  className="w-full rounded-2xl border shadow-xl"
                  fetchPriority="high"
                />
                <div className="absolute -bottom-4 -right-2 hidden rounded-xl border bg-card px-4 py-2 shadow-md sm:block">
                  <p className="text-xs font-bold text-foreground">٨ خدمات أكاديمية</p>
                  <p className="text-[10px] text-muted-foreground">في تطبيق واحد خفيف</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== FEATURES ===================== */}
        <section id="features" className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
          <div className="mx-auto max-w-2xl space-y-3 text-center">
            <h2 className="text-2xl font-extrabold sm:text-3xl">كل ما يحتاجه الطالب، دون ما لا يحتاجه</h2>
            <p className="leading-relaxed text-muted-foreground">
              لم نصمم «طالب» كتقليد لمنصات أجنبية، بل كإجابة على مشكلات الطالب
              الجزائري اليومية: أين جدولي؟ ما واجباتي؟ كم معدلي الآن؟ ما الإعلانات
              الجديدة؟ ثماني خدمات متكاملة تعمل معاً بهدوء وخلف واجهة واحدة
              نظيفة.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <article
                key={f.title}
                className="group space-y-3 rounded-2xl border bg-card p-5 transition-shadow hover:shadow-md"
              >
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <f.icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="text-base font-bold">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </article>
            ))}
          </div>

          <div className="mt-8 text-center">
            <Link
              href="/features"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline-offset-4 hover:underline"
            >
              تفصيل أعمق لكل ميزة وشاشة
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>

        {/* ===================== SCREENSHOTS ===================== */}
        <section className="border-y bg-muted/30 py-12 sm:py-16">
          <div className="mx-auto max-w-5xl px-4">
            <div className="mx-auto max-w-2xl space-y-3 text-center">
              <h2 className="text-2xl font-extrabold sm:text-3xl">التطبيق من الداخل</h2>
              <p className="leading-relaxed text-muted-foreground">
                لقطات حقيقية من التطبيق كما يستخدمه الطلاب يومياً — واجهة عربية
                أصلية بخط القاهرة، اتجاه من اليمين لليسار، وتصميم مسطح هادئ لا
                يشوشك أثناء المراجعة.
              </p>
            </div>
            <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {SCREENS.map((s) => (
                <figure className="space-y-2">
                  <img
                    src={s.src}
                    alt={s.alt}
                    width={390}
                    height={844}
                    loading="lazy"
                    className="w-full rounded-xl border shadow-sm"
                  />
                  <figcaption className="text-center text-xs font-semibold text-muted-foreground">
                    {s.caption}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* ===================== HOW IT WORKS ===================== */}
        <section className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
          <div className="mx-auto max-w-2xl space-y-3 text-center">
            <h2 className="text-2xl font-extrabold sm:text-3xl">ثلاث خطوات وتبدأ سنتك بتنظيم</h2>
            <p className="leading-relaxed text-muted-foreground">
              صممنا التجربة الأولى لتكون أقصر من صرف كوب قهوة — لأننا نعرف أن
              بداية السنة فيها ما يكفي من الازدحام.
            </p>
          </div>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="relative space-y-3 rounded-2xl border bg-card p-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-secondary/15 text-lg font-extrabold text-secondary">
                  {s.n}
                </span>
                <h3 className="text-base font-bold">{s.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ===================== AD ===================== */}
        <section aria-label="مساحة إعلانية" className="mx-auto max-w-5xl px-4 pb-6">
          <AdUnit adSlot="4214645931" className="rounded-xl overflow-hidden" />
        </section>

        {/* ===================== FAQ PREVIEW ===================== */}
        <section className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
          <div className="space-y-3 text-center">
            <h2 className="text-2xl font-extrabold sm:text-3xl">أسئلة يسألها الطلاب قبل التسجيل</h2>
            <p className="leading-relaxed text-muted-foreground">
              أجوبة صريحة مباشرة — وإن بقي سؤالك، <Link href="/faq" className="font-semibold text-primary underline-offset-4 hover:underline">صفحة الأسئلة الشائعة</Link> فيها المزيد، أو <Link href="/contact" className="font-semibold text-primary underline-offset-4 hover:underline">راسلنا مباشرة</Link>.
            </p>
          </div>
          <div className="mt-8 space-y-3">
            {FAQ_PREVIEW.map((item) => (
              <details
                key={item.q}
                className="group rounded-2xl border bg-card px-5 py-4 open:shadow-sm"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-bold marker:hidden [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span className="text-muted-foreground transition-transform group-open:rotate-45">＋</span>
                </summary>
                <p className="mt-3 border-t pt-3 text-sm leading-relaxed text-muted-foreground">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* ===================== CTA ===================== */}
        <section className="border-t bg-primary/5 py-12 sm:py-16">
          <div className="mx-auto max-w-3xl px-4 text-center space-y-5">
            <h2 className="text-2xl font-extrabold sm:text-3xl">سنتك الدراسية تستحق رفيقاً منظماً</h2>
            <p className="leading-relaxed text-muted-foreground">
              انضم إلى الطلاب الذين يستقبلون سنتهم بجدول واضح، واجبات مسجلة، ومعدل
              محسوب لحظة بلحظة. الحساب مجاني، والبيانات ملكك وحدك.
            </p>
            <Link
              href="/app"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3.5 text-base font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-opacity hover:opacity-90"
            >
              دخول التطبيق
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
