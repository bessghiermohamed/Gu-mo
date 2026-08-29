import type { Metadata } from "next";
import { Cairo, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/talib/theme-provider";
import { I18nProvider } from "@/components/talib/i18n-provider";

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
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
