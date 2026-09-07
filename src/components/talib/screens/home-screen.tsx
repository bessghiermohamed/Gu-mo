"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  CalendarDays,
  FlaskConical,
  Wrench,
  FolderOpen,
  Megaphone,
  Users,
  CheckSquare,
  Send,
  ChevronLeft,
  Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { useShell, type ScreenRoute } from "@/app/app/page";

interface QuickAction {
  title: string;
  icon: React.ReactNode;
  route: ScreenRoute;
  delay: number;
}

export function TalibHomeScreen() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { navigate } = useShell();

  const greeting = user?.fullName || t("home.greetingGuest");

  // ── تحية حسب الوقت + تاريخ اليوم ──
  // محسوبة كسطر أوّلي (client-only: الشاشة تُعرض بعد جلسة مسجلة) — بلا
  // setState داخل effect (قاعدة react-hooks/set-state-in-effect).
  const [nowMeta] = React.useState(() => {
    const d = new Date();
    const h = d.getHours();
    const greet = h >= 5 && h < 12 ? "صباح الخير،" : h < 17 ? "نهارك سعيد،" : "مساء الخير،";
    const date = new Intl.DateTimeFormat("ar-DZ", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
    return { greet, date };
  });

  // round 51 (طلب المالك: «حذف آخر الإعلانات والجدول» من الرئيسية):
  // ودجتا «جدول اليوم» و«آخر الإعلانات» (إضافة r48) أُزيلتا — الرئيسية
  // تعود مركزاً على الخدمات، والجدول والإعلانات يعيشان في شاشتيهما
  // الكاملتين (تبويبا «الجدول» و«الإعلانات» دون أي فقدان وظيفة).

  // fix (R12-01) — kept: join-request discovery stays on home.
  const [pendingRequest, setPendingRequest] = React.useState<{ cohortName: string } | null>(null);
  const [noGroupNoRequests, setNoGroupNoRequests] = React.useState(false);
  React.useEffect(() => {
    if (!user) return;
    // students with a cohort already have a group — nothing to surface
    if (user.scopeCohortGroupId != null) return;
    fetch("/api/join-requests/mine", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const reqs: Array<{ status: string; cohortName?: string }> = d.requests ?? [];
        const pending = reqs.find((r) => r.status === "pending");
        setPendingRequest(pending ? { cohortName: pending.cohortName ?? "" } : null);
        setNoGroupNoRequests(reqs.length === 0);
      })
      .catch(() => {});
  }, [user]);

  // Compute quick actions (with shortened names per fix "ج")
  const actions: QuickAction[] = [
    { title: t("nav.courses"), icon: <BookOpen className="w-5 h-5" />, route: "COURSES", delay: 0 },
    { title: t("nav.schedule"), icon: <CalendarDays className="w-5 h-5" />, route: "SCHEDULE", delay: 0.04 },
    { title: t("nav.exams"), icon: <FlaskConical className="w-5 h-5" />, route: "EXAMS", delay: 0.08 },
    // round 29: حاسبة الطالب screen removed — the tile now opens أدواتي
    // (whose first tool IS the GPA calculator, same talib-grades storage).
    { title: t("nav.tools"), icon: <Wrench className="w-5 h-5" />, route: "TOOLS", delay: 0.12 },
    { title: t("nav.files"), icon: <FolderOpen className="w-5 h-5" />, route: "FILES", delay: 0.16 },
    { title: t("nav.announcements"), icon: <Megaphone className="w-5 h-5" />, route: "ANNOUNCEMENTS", delay: 0.2 },
    { title: t("nav.assignments"), icon: <CheckSquare className="w-5 h-5" />, route: "ASSIGNMENTS", delay: 0.24 },
    { title: t("nav.group"), icon: <Users className="w-5 h-5" />, route: "GROUP", delay: 0.28 },
  ];

  return (
    <div className="space-y-5">
      {/* ═══ ترويسة ترحيب نصية — بلا بانر ═══
          round 49 (طلب المالك): إزالة البانر المتدرج نهائياً. ترويسة نصية
          هادئة على خلفية الشاشة نفسها: تحية + اسم + تاريخ + رقم الطالب.
          round 51: المحتوى يبدأ الآن مباشرة بالخدمات بعد حذف الودجتين. */}
      <header className="pt-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {/* min-h ثابت للسطرين يمنع قفز التخطيط لحظة حساب التاريخ */}
            <p className="text-xs font-medium text-muted-foreground min-h-4">
              {nowMeta.greet}
            </p>
            <h1 className="text-xl font-black truncate mt-0.5">{greeting}</h1>
            <p className="text-[11px] text-muted-foreground mt-1 min-h-4">
              {nowMeta.date}
            </p>
          </div>
          {user && (
            <Badge variant="outline" className="shrink-0 font-bold tabular-nums">
              {user.studentId}
            </Badge>
          )}
        </div>
      </header>

      {/* round 10 (review §4): join-request status banner — visible answer
          to "do I have a pending request?" / "where do I join a group?" */}
      {pendingRequest && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          onClick={() => navigate("BROWSE_GROUPS")}
          className="w-full text-right cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="متابعة طلب الانضمام"
        >
          <div className="p-3.5 flex items-center gap-3 rounded-2xl bg-amber-500/5 border border-amber-500/25 transition-colors duration-200 hover:bg-amber-500/10">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">لديك طلب انضمام قيد المراجعة</p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {pendingRequest.cohortName ? `الفوج: ${pendingRequest.cohortName} — ` : ""}تابع حالته من شاشة تصفح المجموعات
              </p>
            </div>
            <ChevronLeft className="w-4 h-4 text-muted-foreground/40 shrink-0" />
          </div>
        </motion.button>
      )}
      {!pendingRequest && noGroupNoRequests && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          onClick={() => navigate("BROWSE_GROUPS")}
          className="w-full text-right cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="تصفح المجموعات"
        >
          <div className="p-3.5 flex items-center gap-3 rounded-2xl bg-primary/5 border border-primary/15 transition-colors duration-200 hover:bg-primary/10">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">لم تنضم إلى فوج بعد</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                تصفّح المجموعات والأفواج وأرسل طلب انضمام إلى فوجك
              </p>
            </div>
            <ChevronLeft className="w-4 h-4 text-muted-foreground/40 shrink-0" />
          </div>
        </motion.button>
      )}

      {/* Quick actions grid — id used by the first-run tour (review §15) */}
      <section id="talib-tour-services" aria-labelledby="quick-actions-title">
        <h2 id="quick-actions-title" className="text-lg font-black mb-3">
          {t("home.quickActions")}
        </h2>
        {/* round 26 — compact cards; round 48 — توحيد المظهر مع لغة r47:
            hover = إطار/ظل/تعبئة الأيقونة فقط (بلا إزاحة تخطيط)، ضغط
            active:scale، حلقات تركيز ظاهرة، ومؤشر يد على كل بطاقة. */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
          {actions.map((action, i) => (
            <motion.button
              key={action.route}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25, delay: action.delay }}
              onClick={() => navigate(action.route)}
              className="group text-right cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] transition-transform"
            >
              <div className="h-full min-h-[76px] rounded-2xl bg-card border border-border p-3 transition-[border-color,box-shadow] duration-200 group-hover:border-primary/45 group-hover:shadow-md">
                <div className="flex items-start justify-between mb-2">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground">
                    {action.icon}
                  </div>
                  <ChevronLeft className="w-4 h-4 text-muted-foreground/40 transition-colors duration-200 group-hover:text-primary" />
                </div>
                <h3 className="font-bold text-sm truncate">{action.title}</h3>
              </div>
            </motion.button>
          ))}
        </div>
      </section>

      {/* Featured: Telegram lessons — full-width card (fixes the orphan 9th tile) */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.3 }}
        onClick={() => navigate("TELEGRAM")}
        className="group w-full text-right cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.99] transition-transform"
        aria-label="دروس تيليجرام"
      >
        <div className="p-4 flex items-center gap-3 rounded-2xl bg-primary/5 border border-primary/15 transition-colors duration-200 group-hover:bg-primary/10">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0 transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground">
            <Send className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm">دروس تيليجرام</h3>
            <p className="text-xs text-muted-foreground mt-0.5">قنوات ومساحة الفوج — محاضرات وتمارين مرتبة حسب المقياس</p>
          </div>
          <ChevronLeft className="w-4 h-4 text-muted-foreground/40 transition-colors duration-200 group-hover:text-primary shrink-0" />
        </div>
      </motion.button>

      {/* Onboarding hint — only for users whose profile is not yet linked (was permanent) */}
      {user?.assignedSpecialtyId == null && (
        <div className="p-5 rounded-2xl bg-card border border-border">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4" />
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
        </div>
      )}
    </div>
  );
}

