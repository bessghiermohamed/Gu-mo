import Link from "next/link";

// Public site footer — the AdSense review checks for a visible, linked
// privacy policy + contact route on every page. Keep all links here.
export function SiteFooter() {
  return (
    <footer className="border-t bg-muted/40">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="grid gap-8 sm:grid-cols-3">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <img src="/talib/icon.svg" alt="" className="h-8 w-8" width={32} height={32} />
              <span className="text-lg font-extrabold text-primary">طالب | Talib</span>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              رفيقك الأكاديمي الشامل — منصة جزائرية تُرتّب المقررات والجدول والعلامات
              والإعلانات في مكان واحد، صُمّمت خصيصاً لطلبة المدرسة العليا للأساتذة
              بووزعادة وكل الجامعات الجزائرية.
            </p>
          </div>

          <nav aria-label="روابط الموقع" className="space-y-3">
            <h2 className="text-sm font-bold text-foreground">روابط الموقع</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link className="hover:text-foreground hover:underline" href="/features">المميزات</Link></li>
              <li><Link className="hover:text-foreground hover:underline" href="/guide">دليل الاستخدام</Link></li>
              <li><Link className="hover:text-foreground hover:underline" href="/faq">الأسئلة الشائعة</Link></li>
              <li><Link className="hover:text-foreground hover:underline" href="/about">من نحن</Link></li>
              <li><Link className="hover:text-foreground hover:underline" href="/app">دخول التطبيق</Link></li>
            </ul>
          </nav>

          <nav aria-label="السياسات" className="space-y-3">
            <h2 className="text-sm font-bold text-foreground">السياسات والقوانين</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link className="hover:text-foreground hover:underline" href="/privacy">سياسة الخصوصية</Link></li>
              <li><Link className="hover:text-foreground hover:underline" href="/terms">شروط الاستخدام</Link></li>
              <li><Link className="hover:text-foreground hover:underline" href="/contact">اتصل بنا</Link></li>
              <li><Link className="hover:text-foreground hover:underline" href="/ads.txt">ملف إعلانات ads.txt</Link></li>
            </ul>
          </nav>
        </div>

        <div className="mt-8 border-t pt-6 text-center text-xs leading-relaxed text-muted-foreground">
          <p>
            © {new Date().getFullYear()} طالب | Talib — جميع الحقوق محفوظة. صُنع بعناية
            في الجزائر 🇩🇿
          </p>
          <p className="mt-1">
            يعمل هذا الموقع بتقنية Next.js ويُدعّم الإعلانات عبر Google AdSense
            مع احترام كامل لخصوصية الزوّار.
          </p>
        </div>
      </div>
    </footer>
  );
}
