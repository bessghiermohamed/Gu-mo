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
  TrendingUp,
  GraduationCap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { useShell, type ScreenRoute } from "@/app/app/page";
import { computeGpa } from "@/lib/grades";

interface QuickAction {
  title: string;
  icon: React.ReactNode;
  route: ScreenRoute;
  delay: number;
}

/** صف من جدول الحصص كما يعيده /api/schedule — لمؤشر «حصص اليوم» */
interface ScheduleRow {
  id: number;
  dayOfWeek: number;
  startTime: string;
}

/** "08:30" → 510 دقيقة من منتصف الليل */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
}

/** تقسيم اليوم وفق اصطلاح التطبيق (1=الأحد … 7=السبت) كما في شاشة الجدول */
function appDayFromJsDate(d: Date): number {
  return d.getDay() + 1; // JS: 0=الأحد
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

  // ── بيانات مؤشرات البانر الثلاثة (r53: عاد البانر بمؤشراته) ──

  // المعدل التقديري: من نفس مخزن حاسبة المعدل (talib-grades) عبر نفس
  // الدالة المشتركة — مفهوم واحد للمعدل في كامل التطبيق. قراءة واحدة
  // في مُهيّئ كسول (الشاشة لا تُعرض إلا بعد جلسة مسجلة) — بلا
  // setState داخل effect.
  const [heroGpa] = React.useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem("talib-grades");
      if (!stored) return null;
      const rows = JSON.parse(stored);
      return Array.isArray(rows) ? computeGpa(rows) : null;
    } catch {
      // مخزن تالف — يبقى المؤشر «—»
      return null;
    }
  });

  // عدد المقاييس الحقيقي (بدل رقم ثابت)
  const [moduleCount, setModuleCount] = React.useState<number | null>(null);
  React.useEffect(() => {
    let alive = true;
    fetch("/api/courses", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (alive) setModuleCount((d.courses ?? []).length);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // حصص اليوم: عدّاد فقط — الودجت الكاملة تبقى محذوفة (r51 بطلب المالك)
  // والمؤشر يجيب سؤال «هل عندي حصص اليوم؟» بنظرة واحدة.
  const hasSpecialty = user?.assignedSpecialtyId != null;
  const [todayCount, setTodayCount] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!hasSpecialty) return;
    let alive = true;
    fetch("/api/schedule", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!alive) return;
        const rows: ScheduleRow[] = d.items ?? [];
        const appDay = appDayFromJsDate(new Date());
        const todays = rows
          .filter((i) => i.dayOfWeek === appDay)
          .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
        setTodayCount(todays.length);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user, hasSpecialty]);

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
      {/* ═══ بطاقة الترحيب — لحظة الهوية ═══
          round 53 (طلب المالك: «أعد البانر»): البانر المتدرج يعود إلى
          الرئيسية بعد الدخول. لأجل الشفافية: أُزيل في r49 تفسيراً لتعليمة
          «أزل البانر من الصفحة الرئيسية» حيث كانت «الرئيسية» آنذاك تعني
          هذه الشاشة، ثم ذهبت جولة r51 بتعليمة «Re-banner» إلى استرجاع
          لافتة الهبوط فبقي بانر هذه الشاشة محذوفاً — وهو ما يُصحّح الآن.
          البطاقة تقود بالبيانات: تحية بحسب الوقت، تاريخ اليوم، رقم
          الطالب، وثلاثة مؤشرات حقيقية (المعدل/المقاييس/حصص اليوم).
          التدرج مبني على tokens فقط (bg-primary + طبقتا عمق محايدتان)
          ليبقى صحيحاً مع الثلاث هويات (أخضر/بنفسجي/أزرق) وفي الوضعين. */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35 }}
        className="relative overflow-hidden rounded-3xl bg-primary text-primary-foreground shadow-md"
        aria-label="لوحة الطالب"
      >
        {/* طبقتا عمق محايدتان (تعملان فوق أي لون هوية) */}
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-tr from-black/25 via-transparent to-white/15" />
        <GraduationCap
          aria-hidden="true"
          className="absolute -bottom-9 -left-7 w-40 h-40 text-white/10 rotate-12 pointer-events-none"
        />
        <div className="relative p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {/* min-h ثابت للسطرين يمنع قفز التخطيط لحظة حساب التاريخ */}
              <p className="text-xs font-medium text-primary-foreground/85 min-h-4">
                {nowMeta.greet}
              </p>
              <h1 className="text-xl font-black truncate mt-0.5">{greeting}</h1>
              <p className="text-[11px] text-primary-foreground/70 mt-1 min-h-4">
                {nowMeta.date}
              </p>
            </div>
            {user && (
              <Badge className="shrink-0 bg-white/20 backdrop-blur-sm text-white border border-white/25 font-bold">
                {user.studentId}
              </Badge>
            )}
          </div>

          {/* المؤشرات: قيم حقيقية، بدون قفز — «…» أثناء التحميل */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <HeroStat
              icon={<TrendingUp className="w-3.5 h-3.5" />}
              label={t("home.gpa")}
              value={heroGpa != null ? `${heroGpa.toFixed(2)} / 20` : "—"}
              title="يُحسب من حاسبة المعدل في أدواتي"
            />
            <HeroStat
              icon={<BookOpen className="w-3.5 h-3.5" />}
              label={t("home.modulesCount")}
              value={moduleCount != null ? String(moduleCount) : "…"}
            />
            <HeroStat
              icon={<CalendarDays className="w-3.5 h-3.5" />}
              label="حصص اليوم"
              value={todayCount != null ? String(todayCount) : hasSpecialty ? "…" : "—"}
            />
          </div>
        </div>
      </motion.section>

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

/** رقاقة مؤشر داخل بطاقة الترحيب — زجاجية فاتحة تعمل فوق أي درجة
 *  هوية (أخضر/بنفسجي/أزرق) وفي الوضعين الفاتح والداكن */
function HeroStat({
  icon,
  label,
  value,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div
      title={title}
      className="flex items-center gap-1.5 rounded-xl bg-white/15 backdrop-blur-sm px-2.5 py-1.5"
    >
      <span className="text-primary-foreground/85 [&>svg]:w-3.5 [&>svg]:h-3.5">{icon}</span>
      <span className="text-[11px] text-primary-foreground/80">{label}:</span>
      <span className="text-xs font-bold tabular-nums">{value}</span>
    </div>
  );
}

