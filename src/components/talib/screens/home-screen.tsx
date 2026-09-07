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
  RefreshCw,
  CalendarX2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { useShell, type ScreenRoute } from "@/app/app/page";

interface LatestAnnouncement {
  id: number;
  title: string;
  date: string;
  urgency: string;
}

interface QuickAction {
  title: string;
  icon: React.ReactNode;
  route: ScreenRoute;
  delay: number;
}

/** صف من جدول الحصص كما يعيده /api/schedule */
interface ScheduleRow {
  id: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  moduleName: string;
  type?: string | null;
  room?: string | null;
  professor?: string | null;
}

/** "08:30" → 510 دقيقة من منتصف الليل */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
}

/** ISO (2026-09-07) → «7 سبتمبر 2026» — توحيداً مع بقية الشاشات؛
 *  أي صيغة أخرى تُمرر كما هي. */
function humanizeDate(s: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(`${s}T00:00:00`);
  return isNaN(d.getTime())
    ? s
    : new Intl.DateTimeFormat("ar-DZ", { day: "numeric", month: "long", year: "numeric" }).format(d);
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

  // ── ساعة الدقيقة الحالية لإبراز الحصة الجارية/التالية ──
  const [nowMin, setNowMin] = React.useState<number | null>(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });
  React.useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  // ── جدول اليوم: أعلى سؤال قيمة في لوحة الطالب («ماذا عندي اليوم؟») ──
  // بلا تخصص لا يوجد جلب إطلاقاً — تُشتق الحالة «فارغ» من user نفسه بدل
  // setState متزامن داخل effect.
  const hasSpecialty = user?.assignedSpecialtyId != null;
  const [todayItems, setTodayItems] = React.useState<ScheduleRow[] | null>(null);
  const [todayError, setTodayError] = React.useState(false);
  const [todayTick, setTodayTick] = React.useState(0);
  React.useEffect(() => {
    if (!hasSpecialty) return;
    let alive = true;
    // بلا تصفير متزامن: الحالة القديمة تبقى معروضة حتى وصول الرد
    // (إعادة المحاولة من بطاقة الخطأ تبقى في مكانها حتى ينجح الجلب)
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
        setTodayItems(todays);
        setTodayError(false);
      })
      .catch(() => {
        if (!alive) return;
        setTodayError(true);
      });
    return () => {
      alive = false;
    };
  }, [user, hasSpecialty, todayTick]);

  // fix (R12-01): latest announcements preview (round 26: the "القادم قريباً"
  // exams widget was removed by owner request — exam schedules live in the
  // الاختبارات service tile, one tap away, instead of a duplicated home widget).
  const [latestAnnouncements, setLatestAnnouncements] = React.useState<LatestAnnouncement[]>([]);
  const [annState, setAnnState] = React.useState<"loading" | "ok" | "error">("loading");
  const [annTick, setAnnTick] = React.useState(0);
  React.useEffect(() => {
    if (!hasSpecialty) return; // بلا تخصص: تُعرض حالة الفراغ اشتقاقياً
    let alive = true;
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
      .catch(() => {
        if (!alive) return;
        setAnnState("error");
      });
    return () => {
      alive = false;
    };
  }, [user, hasSpecialty, annTick]);

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

  // حالات جدول اليوم المشتقة: الجارية الآن / التالية / هل انتهى كل شيء
  // (المشتقة هنا كي لا نحتاج setState متزامن داخل أي effect أعلاه)
  const rows = hasSpecialty ? (todayItems ?? []) : [];
  const todayLoading = hasSpecialty && todayItems === null && !todayError;
  const annLoading = hasSpecialty && annState === "loading";
  const annError = hasSpecialty && annState === "error";
  const annEmpty = hasSpecialty && annState === "ok" && latestAnnouncements.length === 0;
  const ongoingIdx = nowMin == null ? -1 : rows.findIndex((r) => nowMin >= toMinutes(r.startTime) && nowMin < toMinutes(r.endTime));
  const nextIdx = ongoingIdx !== -1 ? -1 : nowMin == null ? -1 : rows.findIndex((r) => nowMin < toMinutes(r.startTime));
  const allDone = rows.length > 0 && ongoingIdx === -1 && nextIdx === -1;

  // نقطة لون حسب درجة إلحاح الإعلان (قيم الـ API: عاجل/هام/عام)
  const urgencyDot = (u: string) =>
    u === "عاجل" ? "bg-red-500" : u === "هام" ? "bg-amber-500" : null;

  return (
    <div className="space-y-5">
      {/* ═══ ترويسة ترحيب نصية — بلا بانر ═══
          round 49 (طلب المالك): إزالة البانر المتدرج نهائياً. ترويسة نصية
          هادئة على خلفية الشاشة نفسها: تحية + اسم + تاريخ + رقم الطالب،
          بلا بطاقة ولا تدرج ولا مؤشرات — المحتوى الفعلي يبدأ فوراً بـ«جدول
          اليوم» (حصص اليوم) والمؤشرات الأخرى تعيش في شاشاتها (المعدل في
          أدواتي، المقاييس في المقررات). */}
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

      {/* ═══ جدول اليوم ═══
          round 48: أعلى سؤال يومي للطالب («ليوم عندنا واش؟») كان يتطلب فتح
          شاشة الجدول كاملة. الآن الإجابة تعيش في اللوحة: الحصة الجارية ثم
          التالية مُبرازتان، skeleton يحجز المسار (بلا قفز تخطيط)، وحالة
          فراغ حقيقية («لا حصص اليوم») وحالة خطأ مع إعادة محاولة. */}
      <section aria-labelledby="today-schedule-title">
        <div className="flex items-center justify-between mb-3">
          <h2 id="today-schedule-title" className="text-lg font-black">
            جدول اليوم
          </h2>
          <button
            onClick={() => navigate("SCHEDULE")}
            className="text-xs text-primary font-bold flex items-center gap-0.5 cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            الجدول الكامل
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>

        {todayLoading ? (
          /* skeleton يحجز نفس ارتفاع صفّي الحصص — لا قفز محتوى */
          <div className="space-y-2" aria-hidden="true">
            <div className="h-[62px] rounded-2xl bg-muted/70 animate-pulse" />
            <div className="h-[62px] rounded-2xl bg-muted/70 animate-pulse w-11/12" />
          </div>
        ) : todayError ? (
          <div className="p-3.5 rounded-2xl bg-card border border-border flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">تعذّر تحميل جدول اليوم</span>
            <Button variant="outline" size="sm" onClick={() => setTodayTick((n) => n + 1)}>
              <RefreshCw className="w-3.5 h-3.5" />
              إعادة المحاولة
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-5 rounded-2xl bg-card border border-dashed border-border text-center">
            <CalendarX2 className="w-6 h-6 text-muted-foreground/50 mx-auto" aria-hidden="true" />
            <p className="text-sm font-bold mt-2">لا توجد حصص اليوم</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              يوم مثالي للمراجعة أو إنجاز الواجبات
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.slice(0, 3).map((item, idx) => {
              const ongoing = idx === ongoingIdx;
              const isNext = idx === nextIdx;
              const highlight = ongoing || isNext;
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 p-3 rounded-2xl border transition-colors duration-200 ${
                    highlight ? "bg-primary/5 border-primary/35" : "bg-card border-border"
                  }`}
                >
                  {/* رقاقة الوقت — تتلون للجارية/التالية */}
                  <div
                    className={`shrink-0 w-14 rounded-xl py-1.5 text-center ${
                      highlight ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}
                  >
                    <p className="text-[11px] font-black leading-none tabular-nums">{item.startTime}</p>
                    <p className={`text-[9px] mt-1 leading-none tabular-nums ${highlight ? "text-primary-foreground/75" : "text-muted-foreground"}`}>
                      {item.endTime}
                    </p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{item.moduleName}</p>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {[item.type, item.room].filter(Boolean).join(" • ") || "—"}
                    </p>
                  </div>
                  {highlight && (
                    <Badge
                      className={`shrink-0 text-[10px] px-2 py-0.5 border-0 ${
                        ongoing
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : "bg-primary/10 text-primary"
                      }`}
                    >
                      {ongoing ? "جارية الآن" : "التالية"}
                    </Badge>
                  )}
                </div>
              );
            })}

            {allDone && (
              <p className="text-[11px] text-muted-foreground text-center pt-1">
                انتهت حصص اليوم — بالتوفيق في مراجعتك
              </p>
            )}
            {rows.length > 3 && (
              <button
                onClick={() => navigate("SCHEDULE")}
                className="w-full text-center text-xs text-primary font-bold py-2 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                +{rows.length - 3} حصص أخرى — افتح الجدول
              </button>
            )}
          </div>
        )}
      </section>

      {/* fix (R12-01): latest announcements preview — the "تنبيهات الفوج"
          tile used to be the ONLY hint that announcements existed. */}
      <section aria-labelledby="latest-announcements-title">
        <div className="flex items-center justify-between mb-3">
          <h2 id="latest-announcements-title" className="text-lg font-black">
            آخر الإعلانات
          </h2>
          <button
            onClick={() => navigate("ANNOUNCEMENTS" as ScreenRoute)}
            className="text-xs text-primary font-bold flex items-center gap-0.5 cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            الكل
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>
        {annLoading && (
          /* skeleton بديل سطر «جارٍ التحميل…» — نفس الحجم التقريبي للصفين */
          <div className="space-y-2" aria-hidden="true">
            <div className="h-12 rounded-xl bg-muted/70 animate-pulse" />
            <div className="h-12 rounded-xl bg-muted/70 animate-pulse w-11/12" />
          </div>
        )}
        {annError && (
          <div className="py-2.5 px-3.5 rounded-2xl bg-card border border-border flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">تعذّر تحميل الإعلانات</span>
            <Button variant="outline" size="sm" onClick={() => setAnnTick((n) => n + 1)}>
              <RefreshCw className="w-3.5 h-3.5" />
              إعادة المحاولة
            </Button>
          </div>
        )}
        {annEmpty && (
          <div className="p-5 rounded-2xl bg-card border border-dashed border-border text-center">
            <Megaphone className="w-6 h-6 text-muted-foreground/50 mx-auto" aria-hidden="true" />
            <p className="text-sm font-bold mt-2">لا توجد إعلانات جديدة</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              ستجد إعلانات تخصصك هنا فور نشرها
            </p>
          </div>
        )}
        {annState === "ok" && latestAnnouncements.length > 0 && (
          <div className="rounded-2xl bg-card border border-border divide-y divide-border/70 overflow-hidden">
            {latestAnnouncements.map((ann) => {
              const dot = urgencyDot(ann.urgency);
              return (
                <motion.button
                  key={ann.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.25 }}
                  onClick={() => navigate("ANNOUNCEMENTS" as ScreenRoute)}
                  className="w-full text-right flex items-center gap-3 px-3.5 py-3 cursor-pointer transition-colors duration-200 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <Megaphone className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate flex items-center gap-1.5">
                      {dot && <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />}
                      {ann.title}
                    </p>
                    {ann.date && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5 tabular-nums">{humanizeDate(ann.date)}</p>
                    )}
                  </div>
                  <ChevronLeft className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                </motion.button>
              );
            })}
          </div>
        )}
      </section>

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

