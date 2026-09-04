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
  TrendingUp,
  BookMarked,
  CheckSquare,
  Send,
  ChevronLeft,
  Clock,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { useShell, type ScreenRoute } from "@/app/app/page";
import { computeGpa } from "@/lib/grades";

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

  // fix (R12-01): latest announcements preview (round 26: the "القادم قريباً"
  // exams widget was removed by owner request — exam schedules live in the
  // الاختبارات service tile, one tap away, instead of a duplicated home widget).
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
      icon: <BookOpen className="w-5 h-5" />,
      route: "COURSES",
      delay: 0,
    },
    {
      title: t("nav.schedule"),
      subtitle: "حصص الأسبوع",
      icon: <CalendarDays className="w-5 h-5" />,
      route: "SCHEDULE",
      delay: 0.05,
    },
    {
      title: t("nav.exams"),
      subtitle: "مواعيد الاختبارات",
      icon: <FlaskConical className="w-5 h-5" />,
      route: "EXAMS",
      delay: 0.1,
    },
    {
      // round 29: حاسبة الطالب screen removed — the tile now opens أدواتي
      // (whose first tool IS the GPA calculator, same talib-grades storage).
      title: t("nav.tools"),
      subtitle: "حاسبة، PDF، عدّاد ومؤقت",
      icon: <Wrench className="w-5 h-5" />,
      route: "TOOLS",
      delay: 0.15,
    },
    {
      title: t("nav.files"),
      subtitle: "محفوظات وملاحظات",
      icon: <FolderOpen className="w-5 h-5" />,
      route: "FILES",
      delay: 0.2,
    },
    {
      title: t("nav.announcements"),
      subtitle: "تنبيهات الفوج",
      icon: <Megaphone className="w-5 h-5" />,
      route: "ANNOUNCEMENTS",
      delay: 0.25,
    },
    {
      title: t("nav.assignments"),
      subtitle: "واجبات وتكليفات",
      icon: <CheckSquare className="w-5 h-5" />,
      route: "ASSIGNMENTS",
      delay: 0.3,
    },
    {
      title: t("nav.group"),
      subtitle: "زملاء الفوج",
      icon: <Users className="w-5 h-5" />,
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
          <div className="p-3.5 flex items-center gap-3 rounded-2xl bg-amber-500/5 border border-amber-500/25 transition-colors hover:bg-amber-500/10">
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
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          onClick={() => navigate("BROWSE_GROUPS")}
          className="w-full text-right"
          aria-label="تصفح المجموعات"
        >
          <div className="p-3.5 flex items-center gap-3 rounded-2xl bg-primary/5 border border-primary/15 transition-colors hover:bg-primary/10">
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
          <p className="py-2 text-center text-xs text-muted-foreground">جارٍ التحميل…</p>
        )}
        {annState === "error" && (
          <div className="py-2 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">تعذّر تحميل الإعلانات</span>
            <Button variant="outline" size="sm" onClick={() => setAnnTick((n) => n + 1)}>
              <RefreshCw className="w-3.5 h-3.5" />إعادة المحاولة
            </Button>
          </div>
        )}
        {annState === "ok" && latestAnnouncements.length === 0 && (
          <p className="py-2 text-center text-xs text-muted-foreground">لا توجد إعلانات جديدة حالياً.</p>
        )}
        {annState === "ok" && latestAnnouncements.length > 0 && (
          <div className="divide-y divide-border/70">
            {latestAnnouncements.map((ann) => (
              <motion.button
                key={ann.id}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                onClick={() => navigate("ANNOUNCEMENTS" as ScreenRoute)}
                className="w-full text-right flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Megaphone className="w-4.5 h-4.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{ann.title}</p>
                  {ann.date && <p className="text-xs text-muted-foreground truncate">{ann.date}</p>}
                </div>
                <ChevronLeft className="w-4 h-4 text-muted-foreground/40 shrink-0 rotate-180" />
              </motion.button>
            ))}
          </div>
        )}
      </section>

      {/* Quick actions grid — id used by the first-run tour (review §15) */}
      <section id="talib-tour-services">
        <h2 className="text-lg font-black mb-3">{t("home.quickActions")}</h2>
        {/* round 26 — compact cards: same icon+label+subtitle structure at a
            smaller footprint so the grid fits without heavy scrolling. */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
          {actions.map((action, i) => (
            <motion.button
              key={action.route}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: action.delay }}
              onClick={() => navigate(action.route)}
              className="group text-right"
            >
              <div className="h-full rounded-2xl bg-muted/40 border border-border/70 p-3 transition-colors group-hover:bg-muted/70 group-hover:border-border">
                <div className="flex items-start justify-between mb-2">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    {action.icon}
                  </div>
                  <ChevronLeft className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                </div>
                <h3 className="font-bold text-sm">{action.title}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {action.subtitle}
                </p>
              </div>
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
        <div className="p-4 flex items-center gap-3 rounded-2xl bg-primary/5 border border-primary/15 transition-colors group-hover:bg-primary/10">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
            <Send className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm">دروس تيليجرام</h3>
            <p className="text-xs text-muted-foreground mt-0.5">قنوات ومساحة الفوج — محاضرات وتمارين مرتبة حسب المقياس</p>
          </div>
          <ChevronLeft className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
        </div>
      </motion.button>

      {/* Onboarding hint — only for users whose profile is not yet linked (was permanent) */}
      {user?.assignedSpecialtyId == null && (
      <div className="p-5 rounded-2xl bg-muted/30 border border-border/70">
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
      </div>
      )}
    </div>
  );
}
