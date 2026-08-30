"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  CalendarDays,
  FlaskConical,
  Calculator,
  FolderOpen,
  Megaphone,
  Users,
  FileText,
  TrendingUp,
  Clock,
  BookMarked,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { useShell, type ScreenRoute } from "@/app/page";
import { cn } from "@/lib/utils";

interface QuickAction {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  route: ScreenRoute;
  delay: number;
  badge?: string;
}

export function TalibHomeScreen() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { navigate } = useShell();

  const greeting = user?.fullName || t("home.greetingGuest");

  // Compute quick actions (with shortened names per fix "ج")
  const actions: QuickAction[] = [
    {
      title: t("nav.courses"),
      subtitle: "مقاييس ومحاضرات",
      icon: <BookOpen className="w-6 h-6" />,
      route: "COURSES",
      delay: 0,
    },
    {
      title: t("nav.schedule"),
      subtitle: "حصص الأسبوع",
      icon: <CalendarDays className="w-6 h-6" />,
      route: "SCHEDULE",
      delay: 0.05,
    },
    {
      title: t("nav.exams"),
      subtitle: "مواعيد الاختبارات",
      icon: <FlaskConical className="w-6 h-6" />,
      route: "EXAMS",
      delay: 0.1,
    },
    {
      title: t("nav.grades"),
      subtitle: "احسب معدلك",
      icon: <Calculator className="w-6 h-6" />,
      route: "GRADES",
      delay: 0.15,
    },
    {
      title: t("nav.files"),
      subtitle: "محفوظات وملاحظات",
      icon: <FolderOpen className="w-6 h-6" />,
      route: "FILES",
      delay: 0.2,
    },
    {
      title: t("nav.announcements"),
      subtitle: "تنبيهات الفوج",
      icon: <Megaphone className="w-6 h-6" />,
      route: "ANNOUNCEMENTS",
      delay: 0.25,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Hero banner — using local SVG (fix B.2: no broken external link) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-3xl shadow-lg"
      >
        <img
          src="/talib/hero-banner.svg"
          alt="Talib banner"
          className="w-full h-44 object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
        <div className="absolute inset-0 p-5 flex flex-col justify-between text-white">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium opacity-90">
                {t("home.greeting")}
              </p>
              <h1 className="text-xl font-black">{greeting}</h1>
            </div>
            {user && (
              <Badge className="bg-white/20 backdrop-blur text-white border-0">
                {user.studentId}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              <span className="opacity-90">{t("home.gpa")}:</span>
              <span className="font-bold">— / 20</span>
            </div>
            <div className="flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              <span className="font-bold">0 {t("home.modulesCount")}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Quick actions grid */}
      <section>
        <h2 className="text-lg font-black mb-3">{t("home.quickActions")}</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {actions.map((action, i) => (
            <motion.button
              key={action.route}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: action.delay }}
              onClick={() => navigate(action.route)}
              className="group text-right"
            >
              <Card className="p-4 h-full hover:border-primary/50 hover:shadow-md transition-all hover:-translate-y-0.5">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    {action.icon}
                  </div>
                  <ChevronLeftIcon />
                </div>
                <h3 className="font-bold text-sm">{action.title}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {action.subtitle}
                </p>
              </Card>
            </motion.button>
          ))}
        </div>
      </section>

      {/* Empty state hint */}
      <Card className="p-5 bg-muted/30 border-dashed">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <BookMarked className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-sm mb-1">مرحباً بك في طالب!</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              ابدأ بإكمال ملفك الشخصي من شاشة «حسابي» لربطه بتخصصك وفوجك، ثم ستظهر
              مقرراتك ومحاضراتك هنا تلقائياً.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => navigate("PROFILE")}
            >
              الذهاب إلى حسابي
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
