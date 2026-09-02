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
  TrendingUp,
  BookMarked,
  CheckSquare,
  Send,
  ChevronLeft,
  Clock,
  RefreshCw,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { useShell, type ScreenRoute } from "@/app/page";
import { computeGpa } from "@/lib/grades";

interface UpcomingExam {
  id: number;
  title: string;
  moduleName: string;
  examDate: string;
  time: string;
  isFinished: boolean;
}

interface LatestAnnouncement {
  id: number;
  title: string;
  date: string;
  urgency: string;
}

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

  // Real module count for the hero stats (critique: hardcoded "0")
  const [moduleCount, setModuleCount] = React.useState<number | null>(null);
  React.useEffect(() => {
    fetch("/api/courses", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setModuleCount((d.courses ?? []).length))
      .catch(() => setModuleCount(null));
  }, []);

  // fix (R12-01, P1): the hero showed a STATIC "— / 20" while the grades
  // calculator held a real number — two disconnected GPA concepts. The hero
  // now reads the same localStorage rows through the SAME shared helper.
  const [heroGpa, setHeroGpa] = React.useState<number | null>(null);
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem("talib-grades");
      if (!stored) return;
      const rows = JSON.parse(stored);
      if (Array.isArray(rows)) setHeroGpa(computeGpa(rows));
    } catch {
      // corrupted storage — hero stays "—"
    }
  }, []);

  // fix (R12-01): Home could not answer "what's next?" — the dead i18n keys
  // home.upcomingClasses / home.upcomingAnnouncements prove the intent was
  // designed but never shipped. Upcoming exams + latest announcements now
  // render as tappable previews.
  const [upcomingExams, setUpcomingExams] = React.useState<UpcomingExam[]>([]);
  const [examsState, setExamsState] = React.useState<"loading" | "ok" | "error">("loading");
  const [examsTick, setExamsTick] = React.useState(0);
  React.useEffect(() => {
    let alive = true;
    setExamsState("loading");
    fetch("/api/exams", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!alive) return;
        const all: UpcomingExam[] = d.exams ?? [];
        const today = new Date().toISOString().slice(0, 10);
        setUpcomingExams(
          all
            .filter((e) => !e.isFinished && (!e.examDate || e.examDate >= today))
            .sort((a, b) => (a.examDate || "9999").localeCompare(b.examDate || "9999"))
            .slice(0, 2)
        );
        setExamsState("ok");
      })
      .catch(() => alive && setExamsState("error"));
    return () => { alive = false; };
  }, [examsTick]);

  const [latestAnnouncements, setLatestAnnouncements] = React.useState<LatestAnnouncement[]>([]);
  const [annState, setAnnState] = React.useState<"loading" | "ok" | "error">("loading");
  const [annTick, setAnnTick] = React.useState(0);
  React.useEffect(() => {
    if (user?.assignedSpecialtyId == null) {
      setAnnState("ok");
      return;
    }
    let alive = true;
    setAnnState("loading");
    fetch("/api/announcements", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!alive) return;
        setLatestAnnouncements((d.announcements ?? []).slice(0, 2));
        setAnnState("ok");
      })
      .catch(() => alive && setAnnState("error"));
    return () => { alive = false; };
  }, [user, annTick]);

  // round 10 (review §4 + §17-G): the student must clearly know whether
  // they have a PENDING join request (and discover the feature if they
  // have no group at all) — not find out only inside a deep screen.
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
    {
      title: t("nav.assignments"),
      subtitle: "واجبات وتكليفات",
      icon: <CheckSquare className="w-6 h-6" />,
      route: "ASSIGNMENTS",
      delay: 0.3,
    },
    {
      title: t("nav.group"),
      subtitle: "زملاء الفوج",
      icon: <Users className="w-6 h-6" />,
      route: "GROUP",
      delay: 0.35,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Hero banner — local asset (fix B.2: no broken external link).
          Round 4: replaced flat SVG with illustrated banner (pending هـ design
          work). File swap point: overwrite public/talib/hero-banner.jpg with
          the owner's own artwork — no code change needed. */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-3xl shadow-lg"
      >
        <img
          src="/talib/hero-banner.jpg"
          alt="طالب — رفيقك الأكاديمي"
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
              <span className="font-bold">{heroGpa != null ? heroGpa.toFixed(2) : "—"} / 20</span>
            </div>
            <div className="flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              <span className="opacity-90">{t("home.modulesCount")}:</span>
              <span className="font-bold">{moduleCount ?? "…"}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* round 10 (review §4): join-request status banner — visible answer
          to "do I have a pending request?" / "where do I join a group?" */}
      {pendingRequest && (
        <motion.button
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          onClick={() => navigate("BROWSE_GROUPS")}
          className="w-full text-right"
          aria-label="متابعة طلب الانضمام"
        >
          <Card className="p-3.5 flex items-center gap-3 bg-amber-500/5 border-amber-500/30 hover:border-amber-500/50 transition-colors">
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
          </Card>
        </motion.button>
      )}
      {!pendingRequest && noGroupNoRequests && (
        <motion.button
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          onClick={() => navigate("BROWSE_GROUPS")}
          className="w-full text-right"
          aria-label="تصفح المجموعات"
        >
          <Card className="p-3.5 flex items-center gap-3 bg-primary/5 border-primary/20 hover:border-primary/40 transition-colors">
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
          </Card>
        </motion.button>
      )}

      {/* fix (R12-01): "ما القادم؟" — upcoming exams preview. Tapping goes
          straight to the exams screen. Silent failure shows a retry line
          instead of pretending everything is fine. */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-black">القادم قريباً</h2>
          <button
            onClick={() => navigate("EXAMS" as ScreenRoute)}
            className="text-xs text-primary font-bold flex items-center gap-0.5"
          >
            كل الاختبارات
            <ChevronLeft className="w-3.5 h-3.5 rotate-180" />
          </button>
        </div>
        {examsState === "loading" && (
          <Card className="p-4 text-center text-xs text-muted-foreground">جارٍ التحميل…</Card>
        )}
        {examsState === "error" && (
          <Card className="p-4 flex items-center justify-between gap-2 bg-red-500/5 border-red-500/30">
            <span className="text-xs text-muted-foreground">تعذّر تحميل الاختبارات القادمة</span>
            <Button variant="outline" size="sm" onClick={() => setExamsTick((n) => n + 1)}>
              <RefreshCw className="w-3.5 h-3.5" />إعادة المحاولة
            </Button>
          </Card>
        )}
        {examsState === "ok" && upcomingExams.length === 0 && (
          <Card className="p-4 text-center bg-muted/30 border-dashed">
            <p className="text-xs text-muted-foreground">لا توجد اختبارات قادمة مسجّلة — راجع شاشة الاختبارات لاحقاً.</p>
          </Card>
        )}
        {examsState === "ok" && upcomingExams.map((exam) => (
          <motion.button
            key={exam.id}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => navigate("EXAMS" as ScreenRoute)}
            className="w-full text-right mb-2"
          >
            <Card className="p-3.5 flex items-center gap-3 hover:border-primary/40 transition-colors">
              <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <FlaskConical className="w-4.5 h-4.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{exam.title}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {exam.moduleName}{exam.examDate ? ` • ${exam.examDate}` : ""}{exam.time ? ` • ${exam.time}` : ""}
                </p>
              </div>
              <ChevronLeft className="w-4 h-4 text-muted-foreground/40 shrink-0 rotate-180" />
            </Card>
          </motion.button>
        ))}
      </section>

      {/* fix (R12-01): latest announcements preview — the "تنبيهات الفوج"
          tile used to be the ONLY hint that announcements existed. */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-black">آخر الإعلانات</h2>
          <button
            onClick={() => navigate("ANNOUNCEMENTS" as ScreenRoute)}
            className="text-xs text-primary font-bold flex items-center gap-0.5"
          >
            الكل
            <ChevronLeft className="w-3.5 h-3.5 rotate-180" />
          </button>
        </div>
        {annState === "loading" && (
          <Card className="p-4 text-center text-xs text-muted-foreground">جارٍ التحميل…</Card>
        )}
        {annState === "error" && (
          <Card className="p-4 flex items-center justify-between gap-2 bg-red-500/5 border-red-500/30">
            <span className="text-xs text-muted-foreground">تعذّر تحميل الإعلانات</span>
            <Button variant="outline" size="sm" onClick={() => setAnnTick((n) => n + 1)}>
              <RefreshCw className="w-3.5 h-3.5" />إعادة المحاولة
            </Button>
          </Card>
        )}
        {annState === "ok" && latestAnnouncements.length === 0 && (
          <Card className="p-4 text-center bg-muted/30 border-dashed">
            <p className="text-xs text-muted-foreground">لا توجد إعلانات جديدة حالياً.</p>
          </Card>
        )}
        {annState === "ok" && latestAnnouncements.map((ann) => (
          <motion.button
            key={ann.id}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => navigate("ANNOUNCEMENTS" as ScreenRoute)}
            className="w-full text-right mb-2"
          >
            <Card className="p-3.5 flex items-center gap-3 hover:border-primary/40 transition-colors">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Megaphone className="w-4.5 h-4.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{ann.title}</p>
                {ann.date && <p className="text-xs text-muted-foreground truncate">{ann.date}</p>}
              </div>
              <ChevronLeft className="w-4 h-4 text-muted-foreground/40 shrink-0 rotate-180" />
            </Card>
          </motion.button>
        ))}
      </section>

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
                  <ChevronLeft className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
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

      {/* Featured: Telegram lessons — full-width card (fixes the orphan 9th tile) */}
      <motion.button
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, delay: 0.4 }}
        onClick={() => navigate("TELEGRAM")}
        className="group w-full text-right"
        aria-label="دروس تيليجرام"
      >
        <Card className="p-4 flex items-center gap-3 bg-primary/5 border-primary/20 hover:border-primary/50 hover:shadow-md transition-all hover:-translate-y-0.5">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
            <Send className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm">دروس تيليجرام</h3>
            <p className="text-xs text-muted-foreground mt-0.5">قنوات ومساحة الفوج — محاضرات وتمارين مرتبة حسب المقياس</p>
          </div>
          <ChevronLeft className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
        </Card>
      </motion.button>

      {/* Onboarding hint — only for users whose profile is not yet linked (was permanent) */}
      {user?.assignedSpecialtyId == null && (
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
      )}
    </div>
  );
}
