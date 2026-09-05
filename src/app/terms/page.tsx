import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { CONTACT_EMAIL, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "شروط الاستخدام | طالب | Talib",
  description:
    "شروط استخدام منصة طالب: قبول الشروط، الاستخدام المشروع للحساب، الملكية الفكرية، حدود المسؤولية، الإعلانات، وإجراءات تعليق الحسابات.",
  alternates: { canonical: "/terms" },
};

const UPDATED = "٤ سبتمبر ٢٠٢٦";

export default function TermsPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <header className="space-y-3">
          <h1 className="text-3xl font-extrabold">شروط الاستخدام</h1>
          <p className="text-sm text-muted-foreground">آخر تحديث: {UPDATED}</p>
          <p className="leading-relaxed text-muted-foreground">
            تحكم هذه الشروط استخدامك لموقع ومنصة «طالب». صيغت لتكون واضحة
            ومباشرة بلا لغة قانونية ملتوية — لكنها تبقى ملزمة، فامنحها دقيقة من
            قراءتك قبل التسجيل.
          </p>
        </header>

        <div className="mt-10 space-y-10 text-foreground/90">
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-primary">١. قبول الشروط</h2>
            <p className="leading-loose">
              بإنشائك حساباً أو استخدامك أي جزء من المنصة ({SITE_URL}) فإنك تقرّ
              بقراءتك هذه الشروط وقبولها كاملة. إن لم توافق على أي بند منها، فالرجاء
              عدم استخدام الخدمة — بابنا يظل مفتوحاً متى تغير رأيك.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-primary">٢. من يستخدم المنصة</h2>
            <p className="leading-loose">
              المنصة موجهة للطلبة المسجلين في المؤسسات التعليمية الجزائرية،
              والمفعّل حالياً هو محتوى المدرسة العليا للأساتذة بوزريعة. الحساب
              شخصي لا يجوز مشاركته مع غيرك مهما كان السبب — فبياناته الأكاديمية
              (العلامات، الملفات) تخصك وحدك، ومشاركته تعرّض خصوصيتك للخطر أيضاً.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-primary">٣. استخدامك المشروع للمنصة</h2>
            <p className="leading-loose">اتفقنا معاً على قواعد اللعبة البسيطة:</p>
            <ul className="list-disc space-y-2 pe-5 leading-loose">
              <li>استعمل بيانات صحيحة عند التسجيل (اسمك الحقيقي، بريد تملكه فعلاً).</li>
              <li>لا ترفع محتوى غير قانوني، مسيئاً، أو منسوخاً بحقوق دون تصريح إلى ملفاتك أو وثائق المقررات.</li>
              <li>لا تحاول اختراق المنصة أو تحميل محتواياً بشكل آلي أو إزعاج المستخدمين الآخرين.</li>
              <li>المحتوى الأكاديمي المرفوع من المشرفين للاستعمال الدراسي الشخصي — إعادة نشره تجارياً ممنوعة.</li>
            </ul>
            <p className="leading-loose">
              مخالفة هذه القواعد قد تؤدي إلى تقييد ميزات أو تعليق الحساب بعد
              إنذار عادل، باستثناء الحالات الخطيرة (اختراق، محتوى غير قانوني)
              فتُعالج فوراً.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-primary">٤. الملكية الفكرية</h2>
            <p className="leading-loose">
              اسم «طالب» وهويته البصرية وكلته التطبيقية ملك لمطوريها. الوثائق
              الأكاديمية داخل المنصة تبقى حقوق أصحابها من أساتذة ومؤسسات —
              نوفرها للاستعمال الدراسي فقط. ما ترفعه أنت من ملفات وملاحظات يبقى
              ملكك وحدك.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-primary">٥. الإعلانات</h2>
            <p className="leading-loose">
              يحمل الموقع العام مساحات إعلانية عبر Google AdSense لدعم
              استمرارية الخدمة المجانية. لا نتحكم في محتوى الإعلانات المعروضة
              ولا نؤيد منتجاتها، ولا تُعرض الإعلانات داخل مساحة بياناتك
              الأكاديمية. تفاصيل ملفات الارتباط الإعلانية وخيارات التحكم فيها
              موجودة في
              <Link href="/privacy" className="font-semibold text-primary underline underline-offset-4"> سياسة الخصوصية - القسم ٤</Link>.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-primary">٦. حدود المسؤولية</h2>
            <p className="leading-loose">
              نبذل جهداً حقيقياً لدقة المعلومات الأكاديمية (الجداول، الإعلانات)،
              لكن المرجع الرسمي الوحيد يبقى إدارة مؤسستك — فتحقق دائماً من
              المصدر الرسمي للقرارات المصيرية (تواريخ امتحانات، تسجيلات). تُقدَّم
              الخدمة «كما هي» ونجتهد في استمراريتها وسلامتها، ولا نتحمل أضراراً
              تبعية ناتجة عن انقطاع مؤقت أو خطأ في بيانات أدخلها المستخدمون
              أنفسهم.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-primary">٧. تعديل الشروط وإنهاء الخدمة</h2>
            <p className="leading-loose">
              قد نطور هذه الشروط مع تطور المنصة، ويظهر دائماً تاريخ آخر تحديث
              أعلى الصفحة، والتغييرات الجوهرية تُعلن داخل التطبيق قبل نفاذها. لك
              إنهاء علاقتك بالمنصة في أي لحظة بحذف حسابك من شاشة «حسابي».
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-primary">٨. القانون الواجب التطبيق</h2>
            <p className="leading-loose">
              تخضع هذه الشروط لقوانين الجمهورية الجزائرية الديمقراطية الشعبية،
              وأي نزاع نسعى لحله ودياً أولاً عبر
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="font-semibold text-primary underline underline-offset-4"
                dir="ltr"
              >
                {" "}{CONTACT_EMAIL}{" "}
              </a>
              قبل أي مسار آخر.
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
