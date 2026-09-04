import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Cairo, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
// round 4: removed the unused radix <Toaster /> from the old shadcn toast
// system — the app exclusively uses sonner (mounted in src/app/page.tsx).
// Dead files src/components/ui/toaster.tsx, ui/toast.tsx and
// hooks/use-toast.ts were deleted with it (safety grep: no other importers).
import { ThemeProvider } from "@/components/talib/theme-provider";
import { I18nProvider } from "@/components/talib/i18n-provider";
import { ADSENSE_CLIENT } from "@/lib/ads";
import { SITE_URL } from "@/lib/site";
// AdSense loader is global (afterInteractive, non-blocking) — publisher id in
// src/lib/ads.ts, verified via public/ads.txt. NOTE: browser-only; if Talib is
// ever wrapped in an APK/WebView (TWA), switch to AdMob or risk account ban.

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "طالب | Talib — رفيقك الأكاديمي",
  description:
    "رفيقك الأكاديمي الشامل للطلاب: المقررات، المحاضرات، الجدول، العلامات، ومزامنة سحابية على Supabase.",
  keywords: ["طالب", "Talib", "أكاديمي", "طلاب", "جزائر", "ENS Bouzaréah"],
  authors: [{ name: "Talib Team" }],
  icons: {
    icon: "/talib/icon.svg",
  },
  openGraph: {
    title: "طالب | Talib",
    description: "رفيقك الأكاديمي الشامل للطلاب",
    type: "website",
    locale: "ar_DZ",
  },
  // AdSense ownership verification (alternative to the DNS/site-review method).
  other: {
    "google-adsense-account": ADSENSE_CLIENT,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${cairo.variable} antialiased bg-background text-foreground font-arabic`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <I18nProvider>{children}</I18nProvider>
        </ThemeProvider>
        {/* Vercel native add-ons: Web Analytics (audience, referrers, paths) +
            Speed Insights (Core Web Vitals — page-experience signal for
            AdSense). Both defer to Vercel's edge, zero config, Hobby-free. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
