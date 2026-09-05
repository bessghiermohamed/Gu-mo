import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { AdUnit } from "@/components/ads/ad-unit";

export const metadata: Metadata = {
  title: "دليل الاستخدام خطوة بخطوة | طالب | Talib",
  description:
    "كيف تبدأ مع منصة طالب: إنشاء الحساب، الإعداد الأولي، اختيار التخصص والفوج، استخدام الجدول والواجبات وحاسبة العلامات — دليل عملي مصور خطوة بخطوة.",
  alternates: { canonical: "/guide" },
};

const STEPS = [
  {
    title: "الخطوة الأولى: إنشاء الحساب",
    body: [
      "افتح صفحة الدخول من زر «دخول التطبيق» ثم اختر «حساب جديد». المطلوب ثلاثة أشياء فقط: الاسم واللقب كما هو في بطاقة الطالب (سيظهر لزملاء فوجك)، بريد إلكتروني تستعمله فعلاً (سيصلك عليه التحقق والإشعارات المهمة)، وكلمة مرور لا تقل عن ثمانية محارف.",
      "بعد الضغط على «إنشاء الحساب» تُرحَّب مباشرة داخل التطبيق ويبدأ الإعداد الأولي. لا نطلب رقم هاتف ولا معلومات هوية — أدنى قدر من البيانات، وهو مبدأ عملنا في الخصوصية.",
    ],
  },
  {
    title: "الخطوة الثانية: الإعداد الأولي (٣٠ ثانية)",
    body: [
      "أول ما يفتح لك: اختيار المؤسسة (المدرسة العليا للأساتذة — بوزريعة)، ثم التخصص، ثم السنة الدراسية، ثم الشعبة. هذه الاختيارات تُخبر التطبيق أي مقررات وجدول يعرض لك — وبعدها لا تعود تختار شيئاً يدوياً.",
      "ستلاحظ جولة تعريفية قصيرة أول مرة تفتح التطبيق: ثلاث خطوات تريك أين الخدمات، أين الإعدادات، وأين حسابك. إن أخطأت التجاوز، كل شيء موجود أيضاً في هذا الدليل.",
    ],
  },
  {
    title: "الخطوة الثالثة: جدولك اليومي",
    body: [
      "افتح تبويب «الجدول» من شريط التنقل السفلي. ستجد جدولك الرسمي مرتباً بالأيام مع القاعة والأستاذ. لعرض يوم بعينه بسرعة، استخدم شريط الأيام في الأعلى.",
      "لإضافة حصة شخصية: زر «حصة شخصية» أعلى الشاشة، ثم حدد اليوم والتوقيت واسم المادة والقاعة (مثلاً: مراجعة تحليل — قاعة المكتبة — السبت ١٠:٠٠). الحصة تظهر بلون كهرماني مميز مع شارة «شخصية»، وتعدّلها أو تحذفها من زرّي القلم والسلة بجانبها.",
    ],
  },
  {
    title: "الخطوة الرابعة: تسجيل العلامات ومتابعة المعدل",
    body: [
      "من بطاقة «أدواتي» في الشاشة الرئيسية افتح «حاسبة المعدل»: مقاييس تخصصك بمعاملاتها جاهزة، أدخل العلامة التي حصلت عليها في كل مقياس (مراقبة مستمرة، امتحان…) والمعدل يُحسب فوراً مع تفصيل كل مقياس، وبعد الحفظ يظهر معدلك في بطاقة الرئيسية.",
      "نصيحة من طلاب سبقوك: أدخل كل علامة يوم استلامها قبل أن تضيع الورقة. المعدل المحدَّث باستمرار يعطيك صورة حقيقية لمستواك في منتصف الفصل، حين يكون الوقت كافياً لتحسينه.",
    ],
  },
  {
    title: "الخطوة الخامسة: الواجبات والملفات",
    body: [
      "كل واجب يصدر عن مشرفي فوجك يظهر في «الواجبات» مع موعده. عند إنجازه اضغط علامة الإتمام فيتنقل إلى المنجز، وتبقى مرئياً للرجوع إليه عند المراجعة.",
      "أما «ملفاتي» فمساحتك الخاصة: زر الرفع، اختر الملف من جهازك، وسمّه باسم واضح (مثلاً: «شهادة تربص رياضيات ٢٠٢٥»). ملفاتك تتزامن سحابياً وتظل متاحة من أي جهاز آخر تسجل منه.",
      "ومن بطاقة «أدواتي» في الرئيسية تجد سبع أدوات تعمل داخل جهازك دون إنترنت — حاسبة المعدل، تحويل الصور إلى PDF، ضغط PDF ودمجه، استخراج صفحات محددة منه، عدّاد الكلمات للتقارير، ومؤقّت مراجعة بأسلوب بومودورو.",
    ],
  },
  {
    title: "الخطوة السادسة: الإشعارات والإعدادات",
    body: [
      "جرس الإشعارات في أعلى الشاشة يجمع كل جديد. من «الإعدادات» (أيقونة الترس) تتحكم في الوضع الليلي، وربط تيليجرام لاستقبال التنبيهات المهمة خارج التطبيق، وتسجيل الخروج عند الحاجة.",
      "كل شيء آخر — الإعلانات العامة، الفوج، الملفات — متاح من الشاشة الرئيسية مباشرة. وإن احتجت يوماً شرحاً لشيء ما، صفحة الأسئلة الشائعة موجودة لهذا.",
    ],
  },
];

export default function GuidePage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <header className="space-y-3">
          <h1 className="text-3xl font-extrabold">دليل الاستخدام خطوة بخطوة</h1>
          <p className="leading-relaxed text-muted-foreground">
            كتبنا هذا الدليل ليكون مرجعك الكامل من لحظة إنشاء الحساب إلى إتقان
            كل الشاشات. اقرأه بالترتيب أول مرة، ثم عد إلى أي خطوة عند الحاجة —
            الخطوات مستقلة يسهل الوصول إليها كلٌّ على حدة.
          </p>
        </header>

        <nav
          aria-label="محتويات الدليل"
          className="mt-6 rounded-2xl border bg-muted/30 p-5"
        >
          <h2 className="text-sm font-bold">محتويات الدليل</h2>
          <ol className="mt-3 space-y-1.5 text-sm text-muted-foreground">
            {STEPS.map((s) => (
              <li key={s.title}>• {s.title}</li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-10">
          {STEPS.map((s, i) => (
            <section key={s.title} className="space-y-4">
              <h2 className="text-xl font-bold text-primary">{s.title}</h2>
              {s.body.map((p, j) => (
                <p key={j} className="leading-loose text-foreground/90">{p}</p>
              ))}
              {i === 2 && (
                <figure className="space-y-2">
                  <img
                    src="/talib/screens/r27-personal-row.png"
                    alt="شاشة الجدول في منصة طالب تعرض حصة شخصية بلون كهرماني بجانب الحصص الرسمية"
                    width={390}
                    height={844}
                    loading="lazy"
                    className="w-40 rounded-xl border shadow-sm sm:w-48"
                  />
                  <figcaption className="text-xs font-semibold text-muted-foreground">
                    الحصة الشخصية (الكهرمانية) إلى جانب الحصص الرسمية في الجدول
                  </figcaption>
                </figure>
              )}
              {i === 4 && (
                <div className="rounded-xl border bg-muted/30 p-3" aria-label="مساحة إعلانية">
                  <AdUnit adSlot="4214645931" />
                </div>
              )}
            </section>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border bg-primary/5 p-8 text-center space-y-4">
          <h2 className="text-xl font-bold">بقي سؤال؟</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            صفحة الأسئلة الشائعة تجيب عن أكثر ما يسأله الطلاب، وفريقنا يرد على
            ما عداها عبر صفحة الاتصال.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/faq"
              className="inline-flex items-center gap-2 rounded-full border bg-card px-5 py-2.5 text-sm font-bold transition-colors hover:bg-muted"
            >
              الأسئلة الشائعة
            </Link>
            <Link
              href="/app"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
            >
              فتح التطبيق
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
