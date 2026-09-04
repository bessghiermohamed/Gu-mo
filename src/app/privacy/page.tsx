import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { CONTACT_EMAIL, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "سياسة الخصوصية | طالب | Talib",
  description:
    "سياسة خصوصية منصة طالب: ما نجمعه من بيانات ولماذا، كيف نحميه، حقوقك الكاملة عليه، وكيف تتعامل إعلانات Google والارتباطات الخارجية مع معلوماتك.",
  alternates: { canonical: "/privacy" },
};

const UPDATED = "٤ سبتمبر ٢٠٢٦";

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <header className="space-y-3">
          <h1 className="text-3xl font-extrabold">سياسة الخصوصية</h1>
          <p className="text-sm text-muted-foreground">آخر تحديث: {UPDATED}</p>
          <p className="leading-relaxed text-muted-foreground">
            خصوصيتك ليست بنداً إضافياً عندنا — بل مبدأ بُنيت عليه المنصة نفسها.
            هذه الصفحة تشرح بلغة واضحة ما نجمعه من بيانات، ولماذا، وكيف تحمّيه،
            وما حقوقك الكاملة عليه. باستخدامك منصة «طالب» فأنت توافق على ما
            فيها، لذا نرجو قراءتها بعناية.
          </p>
        </header>

        <div className="mt-10 space-y-10 text-foreground/90">
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-primary">١. من نحن ومجال هذه السياسة</h2>
            <p className="leading-loose">
              «طالب» (Talib) منصة ويب تعليمية جزائرية تديرها لتطورها طاقم مستقل،
              تخدم أساساً طلبة المدرسة العليا للأساتذة بووزعادة. تشمل هذه السياسة
              الموقع العام ({SITE_URL}) والتطبيق المسجل خلف تسجيل الدخول، وأي
              خدمة مرتبطة بهما مثل تنبيهات تيليجرام الاختيارية.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-primary">٢. البيانات التي نجمعها</h2>
            <p className="leading-loose">
              نجمع الحد الأدنى الضروري لتشغيل الخدمة، وفق مبدأ «لا نجمع ما لا
              نحتاجه»:
            </p>
            <ul className="list-disc space-y-2 pe-5 leading-loose">
              <li><b>بيانات الحساب:</b> الاسم واللقب، البريد الإلكتروني، وكلمة مرور مشفرة (لا يمكننا قراءتها نحن أنفسنا)، والمؤسسة والتخصص والشعبة التي اخترتها عند الإعداد.</li>
              <li><b>بيانات أكاديمية تُدخلها أنت:</b> العلامات التي تسجلها، الحصص الشخصية التي تضيفها، الواجبات وملاحظاتها، والملفات التي ترفعها إلى «ملفاتي».</li>
              <li><b>بيانات استخدام تقنية:</b> سجلات اتصال قياسية (نوع المتصفح، توقيت الطلب، معالجة الأخطاء) لأغراض الأمان والتشغيل فقط، تُحذف دورياً.</li>
              <li><b>اختياري — تيليجرام:</b> إن ربطت حسابك، نحفظ معرّف حسابك فيه لغرض وحيد هو إرسال التنبيهات التي وافقت عليها، ولا يقرأ البوت رسائلك.</li>
            </ul>
            <p className="leading-loose">
              لا نطلب ولا نجمع رقم الهاتف، رقم بطاقة التعريف، الصور الشخصية، أو
              أي بيانات هوية حساسة — وليست هناك حاجة إليها أصلاً.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-primary">٣. كيف نستخدم بياناتك</h2>
            <ul className="list-disc space-y-2 pe-5 leading-loose">
              <li>تشغيل حسابك وعرض المحتوى الأكاديمي الصحيح لتخصصك وشعبتك.</li>
              <li>حفظ علاماتك وواجباتك وملفاتك ومزامنتها بين أجهزتك.</li>
              <li>إرسال إشعارات الخدمة (واجب، اختبار، إعلان) عبر المنصة أو تيليجرام إن فعّلته.</li>
              <li>تحسين الخدمة عبر إحصاءات مجمعة لا تعرّفك كفرد (مثلاً: نسبة استخدام شاشة معينة).</li>
            </ul>
            <p className="leading-loose">
              ما لا نفعله أبداً: بيع بياناتك، مشاركتها مع جهات إعلانية لاستهدافك
              شخصياً، أو استخدام بريدك للرسائل الترويجية غير المرتبطة بالخدمة.
            </p>
          </section>

          <section className="space-y-4 rounded-2xl border-2 border-secondary/40 bg-secondary/5 p-5">
            <h2 className="text-xl font-bold text-secondary">٤. الإعلانات وملفات الارتباط (Cookies) — اقرأ هذا بعناية</h2>
            <p className="leading-loose">
              يدعم هذا الموقع نفسه عبر مساحات إعلانية من <b>Google AdSense</b>.
              تُستخدم هنا ملفات ارتباط وأدوات قياس من طرف ثالث (بما فيها Google)
              لعرض الإعلانات وصيانتها.
            </p>
            <ul className="list-disc space-y-2 pe-5 leading-loose">
              <li>
                يطلب مزودو الأطراف الثالثة، ومنهم Google، استخدام ملفات الارتباط
                لعرض إعلانات بناءً على زياراتك السابقة لهذا الموقع أو لمواقع
                أخرى على الإنترنت.
              </li>
              <li>
                استخدام Google لملفات الارتباط الإعلانية (مثل ملف DoubleClick /
                إعلانات Google) يمكّنها أن تعرض إعلانات لزوار موقعنا بناءً على
                زياراتهم لمواقعنا ولمواقع أخرى على الإنترنت.
              </li>
              <li>
                يمكنك تعطيل الإعلانات المخصصة وتحكم ملفات الارتباط الإعلانية عبر
                <a
                  href="https://www.google.com/settings/ads"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-primary underline underline-offset-4"
                  dir="ltr"
                >
                  {" "}إعدادات إعلانات Google{" "}
                </a>
                كما يمكنك تعطيل ملفات ارتباط الطرف الثالث عموماً من إعدادات
                متصفحك.
              </li>
              <li>
                <b>المستخدمون دون ١٨ عاماً:</b> جمهورنا الأساسي طلبة جامعيون، لكن
                حرصاً على الامتثال بسياسات Google تجاه القاصرين، نعامل الخدمة
                معاملة «محتوى موجه للأطفال» عند الحاجة ونطلب من الأولياء مراسلتنا
                لحذف أي حساب يخص مَن دون السن القانونية.
              </li>
              <li>
                زيارتك للموقع لا تضيف بياناتك الأكاديمية إلى أي نظام إعلاني:
                علاماتك وواجباتك داخل التطبيق المسجل لا تُستخدم إطلاقاً في
                الاستهداف الإعلاني، والإعلانات تظهر في الموقع العام فقط.
              </li>
              <li>
                للاطلاع على ممارسات Google الكاملة راجع
                <a
                  href="https://policies.google.com/technologies/ads"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-primary underline underline-offset-4"
                  dir="ltr"
                >
                  {" "}سياسة Google الإعلانية{" "}
                </a>
                وصفحات سياسة الخصوصية الخاصة بمزودي الإعلانات الآخرين إن وجدوا.
              </li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-primary">٥. مشاركة البيانات مع الغير</h2>
            <p className="leading-loose">
              لا نبيع بياناتك ولا نؤجرها. نشاركها فقط في الحدود التالية: مع
              مزودي البنية التقنية (استضافة وقواعد بيانات مثل Supabase/Vercel)
              بوصفهم معالجي بيانات ملزمين تعاقدياً بالسرية؛ مع مشرفي فوجك في
              الحدود الأكاديمية التنظيمية فقط (كعضوية الفوج) دون الوصول لعلاماتك
              أو ملفاتك؛ وعند وجود طلب قانوني ملزم من جهة مختصة، مع إخطارك إن
              سمح القانون بذلك.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-primary">٦. حقوقك الكاملة على بياناتك</h2>
            <p className="leading-loose">
              بياناتك ملكك. في أي لحظة يمكنك:
            </p>
            <ul className="list-disc space-y-2 pe-5 leading-loose">
              <li><b>الوصول والتصحيح:</b> تعديل اسمك وبياناتك من شاشة «حسابي» مباشرة.</li>
              <li><b>التصدير:</b> طلب نسخة من بياناتك الأكاديمية (علامات، ملفات) عبر صفحة الاتصال.</li>
              <li><b>الحذف النهائي:</b> من «حسابي» داخل التطبيق — تُمحى بياناتك من خوادمنا خلال المدة الاحتياطية النظامية ولا تبقى نسخة قابلة للاستخدام بعدها.</li>
              <li><b>الاعتراض على المعالجة:</b> يمكنك فصل تيليجرام أو تعطيل الإشعارات متى شئت من الإعدادات.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-primary">٧. الأمان والاحتفاظ بالبيانات</h2>
            <p className="leading-loose">
              تُنقل البيانات عبر اتصال مشفر (HTTPS) وتُخزن كلمات المرور مشفرة
              تماماً، وقاعدة البيانات محمية بمفاتيح وصول محدودة الصلاحيات. نحفظ
              بياناتك طوال مدة نشاط حسابك، وبعد حذفه تُزال خلال مدة احتياطية
              قصيرة تلزمها النسخ الأمنية التقنية. في حال أي اختراق مؤثر سنخبرك
              عبر بريدك المسجل دون تأخير.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-primary">٨. تحديثات هذه السياسة</h2>
            <p className="leading-loose">
              قد نحدّث هذه السياسة عند تطور الخدمة أو تغيّر التزامات قانونية،
              وسنشير دائماً لتاريخ آخر تحديث أعلى الصفحة. التغييرات الجوهرية
              (كإضافة نوع جديد من المعالجة) سنخبرك بها داخل التطبيق أو عبر بريدك
              المسجل قبل نفاذها.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-primary">٩. التواصل بشأن الخصوصية</h2>
            <p className="leading-loose">
              لأي سؤال أو طلب يتعلق بخصوصيتك أو بياناتك:
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="font-semibold text-primary underline underline-offset-4"
                dir="ltr"
              >
                {" "}{CONTACT_EMAIL}{" "}
              </a>
              — نرد على رسائل الخصوصية بأولوية، ويمكنك أيضاً مراجعة
              <Link href="/terms" className="font-semibold text-primary underline underline-offset-4"> شروط الاستخدام </Link>
              و<Link href="/faq" className="font-semibold text-primary underline underline-offset-4">الأسئلة الشائعة</Link>.
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
