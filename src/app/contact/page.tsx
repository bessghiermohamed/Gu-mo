import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MessageCircle, Clock, Bug, Lightbulb, ShieldCheck } from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "اتصل بنا | طالب | Talib",
  description:
    "تواصل مع فريق منصة طالب: الدعم التقني، اقتراحات التحسين، أسئلة الخصوصية، والشراكات — نقرأ كل رسالة ونرد بأقرب وقت.",
  alternates: { canonical: "/contact" },
};

const CHANNELS = [
  {
    icon: Mail,
    title: "البريد الإلكتروني — لكل شيء",
    desc: "الطريق الرسمي الأسرع: الدعم التقني، مشاكل الحساب، أسئلة الخصوصية، والشراكات.",
    action: CONTACT_EMAIL,
    href: `mailto:${CONTACT_EMAIL}`,
    ltr: true,
  },
  {
    icon: MessageCircle,
    title: "داخل التطبيق — لطلاب مسجلين",
    desc: "الأسرع للأسئلة الأكاديمية: مشرفو فوجك يجيبون عن الجدول والمقررات والإعلانات مباشرة من شاشة الفوج.",
    action: "من شاشة «الفوج» داخل التطبيق",
    href: "/app",
    ltr: false,
  },
];

const ROUTING = [
  {
    icon: Bug,
    title: "مشكلة تقنية أو خطأ",
    desc: "صف ما حدث، الشاشة، ونوع جهازك ومتصفحك — التفاصيل تختصر أيام التشخيص. أولوية الرد لدينا القصوى.",
  },
  {
    icon: Lightbulb,
    title: "اقتراح أو فكرة",
    desc: "وصّف المشكلة التي تحلها فكرتك قبل شكلها النهائي — ندرس كل اقتراح ونرد حتى لو لم نتبنَّه فوراً.",
  },
  {
    icon: ShieldCheck,
    title: "خصوصية أو بيانات",
    desc: "طلبات الوصول أو التصدير أو الحذف الكامل تصلنا بأولوية، وتُنفذ وفق ما هو مفصل في سياسة الخصوصية.",
  },
];

export default function ContactPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <header className="space-y-3">
          <h1 className="text-3xl font-extrabold">اتصل بنا</h1>
          <p className="leading-relaxed text-muted-foreground">
            نقرأ كل رسالة تصلنا — من خطأ صغير إلى فكرة كبيرة. اختر القناة
            المناسبة وساعدنا بتفاصيل واضحة كي نصلك بأسرع جواب مفيد.
          </p>
        </header>

        <section className="mt-8 grid gap-5 sm:grid-cols-2">
          {CHANNELS.map((c) => (
            <div key={c.title} className="flex flex-col space-y-3 rounded-2xl border bg-card p-6">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <c.icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <h2 className="text-base font-bold">{c.title}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{c.desc}</p>
              {c.href.startsWith("mailto:") ? (
                <a
                  href={c.href}
                  dir={c.ltr ? "ltr" : undefined}
                  className="mt-auto text-sm font-bold text-primary underline underline-offset-4"
                >
                  {c.action}
                </a>
              ) : (
                <Link href={c.href} className="mt-auto text-sm font-bold text-primary underline underline-offset-4">
                  {c.action}
                </Link>
              )}
            </div>
          ))}
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-bold text-primary">كيف توجه رسالتك؟</h2>
          <div className="space-y-4">
            {ROUTING.map((r) => (
              <div key={r.title} className="flex gap-4 rounded-2xl border bg-card p-5">
                <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary/15 text-secondary">
                  <r.icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-sm font-bold">{r.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{r.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10 flex items-center gap-3 rounded-2xl border bg-muted/30 p-5">
          <Clock className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            وقت الرد المعتاد: <b className="text-foreground">٤٨ ساعة</b> خلال أيام
            الدراسة، وقد يطول قليلاً في العطل — لا تتباطأ رسالتك حتماً، فقط
            ترتّب قليلاً في قائمة القراءة.
          </p>
        </section>

        <section className="mt-10 rounded-2xl border bg-primary/5 p-8 text-center space-y-3">
          <h2 className="text-lg font-bold">قبل أن تراسلنا</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            نصف ما يُسأل مكتوب أصلاً في
            <Link href="/faq" className="font-semibold text-primary underline underline-offset-4"> الأسئلة الشائعة </Link>
            — قد تجد جوابك في دقيقة بدل يوم انتظار.
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
