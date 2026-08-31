// fix M-4 (round 4): non-existent routes used to show Next.js's default
// ENGLISH 404 template with no way back into the app. This replaces it with
// an Arabic, RTL page consistent with the app's design.
import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <img src="/talib/icon.svg" alt="طالب" className="w-8 h-8" />
          <span className="font-bold text-base">طالب | Talib</span>
        </div>

        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary">
          <Compass className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-5xl font-black text-primary">404</h1>
          <h2 className="text-lg font-bold">هذه الصفحة غير موجودة</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            الرابط الذي فتحته غير صحيح أو تم حذف الصفحة. لا تقلق — بياناتك
            سليمة، يمكنك العودة إلى الواجهة الرئيسية والمتابعة من هناك.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center h-11 px-6 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity"
          >
            العودة إلى الرئيسية
          </Link>
          <a
            href="https://gu-mo.vercel.app/"
            className="inline-flex items-center justify-center h-11 px-6 rounded-xl border border-border text-sm font-bold text-foreground hover:bg-accent/50 transition-colors"
          >
            فتح التطبيق من جديد
          </a>
        </div>
      </div>
    </div>
  );
}
