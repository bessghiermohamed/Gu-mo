import Link from "next/link";
import { LogIn } from "lucide-react";

// Public site header — server-rendered, zero JS. Links to the content pages
// Google's AdSense review expects (nav structure = "a well-organized site").
const NAV = [
  { href: "/features", label: "المميزات" },
  { href: "/guide", label: "دليل الاستخدام" },
  { href: "/faq", label: "الأسئلة الشائعة" },
  { href: "/about", label: "من نحن" },
  { href: "/contact", label: "اتصل بنا" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
        <Link href="/" className="flex items-center gap-2" aria-label="الصفحة الرئيسية">
          <img src="/talib/icon.svg" alt="شعار طالب" className="h-9 w-9" width={36} height={36} />
          <span className="text-lg font-extrabold text-primary">طالب</span>
          <span className="hidden text-sm text-muted-foreground sm:inline">| Talib</span>
        </Link>

        <nav aria-label="التنقل الرئيسي" className="hidden items-center gap-5 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <Link
          href="/app"
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <LogIn className="h-4 w-4" aria-hidden="true" />
          دخول التطبيق
        </Link>
      </div>

      {/* Mobile nav — horizontal scroll, no JS */}
      <nav
        aria-label="التنقل على الهاتف"
        className="flex gap-4 overflow-x-auto border-t px-4 py-2 md:hidden"
      >
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="whitespace-nowrap text-xs font-semibold text-muted-foreground"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
