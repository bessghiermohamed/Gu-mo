"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, ChevronLeft, Loader2, Moon, Sun, Palette, LogOut, Settings, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Toaster as SonnerToaster } from "sonner";
import { toast } from "sonner";
import { useI18n } from "@/components/talib/i18n-provider";
import { usePalette } from "@/components/talib/theme-provider";
import { useTheme } from "next-themes";
import { AuthProvider, useAuth } from "@/components/talib/auth-provider";
import { canManageRoles } from "@/lib/auth/permissions";
import { TalibLoginScreen } from "@/components/talib/screens/login-screen";
import { TalibOnboardingScreen } from "@/components/talib/screens/onboarding-screen";
import { TalibHomeScreen } from "@/components/talib/screens/home-screen";
import { TalibCoursesScreen } from "@/components/talib/screens/courses-screen";
import { TalibScheduleScreen } from "@/components/talib/screens/schedule-screen";
import { TalibExamsScreen } from "@/components/talib/screens/exams-screen";
import { TalibFilesScreen } from "@/components/talib/screens/files-screen";
import { TalibProfileScreen } from "@/components/talib/screens/profile-screen";
import { TalibSettingsScreen } from "@/components/talib/screens/settings-screen";
import { TalibTourOverlay } from "@/components/talib/tour-overlay";
import { TalibAnnouncementsScreen } from "@/components/talib/screens/announcements-screen";
import { TalibAdminPanelScreen } from "@/components/talib/screens/admin-panel-screen";
import { TalibGroupScreen } from "@/components/talib/screens/group-screen";
import { TalibAssignmentsScreen } from "@/components/talib/screens/assignments-screen";
import { TalibBrowseGroupsScreen } from "@/components/talib/screens/browse-groups-screen";
import { TalibTelegramScreen } from "@/components/talib/screens/telegram-screen";
import { TalibCourseDetailScreen } from "@/components/talib/screens/course-detail-screen";
import { TalibBottomNavBar } from "@/components/talib/bottom-nav-bar";
import {
  TalibNotificationsSheet,
  type AppNotificationItem,
} from "@/components/talib/notifications-sheet";
import { cn } from "@/lib/utils";

export type ScreenRoute =
  | "HOME"
  | "COURSES"
  | "SCHEDULE"
  | "EXAMS"
  | "TOOLS"
  | "ASSIGNMENTS"
  | "FILES"
  | "GROUP"
  | "BROWSE_GROUPS"
  | "PROFILE"
  | "SETTINGS"
  | "ANNOUNCEMENTS"
  | "ADMIN"
  | "TELEGRAM"
  | "COURSE_DETAIL"
  | "ONBOARDING";

// =====================================================
// fix (R12-03, P0): the app used to forget the current screen on refresh —
// every reload dumped the student back on HOME, mid-task work was lost and
// no screen could ever be shared/bookmarked. Each route now has a stable
// hash (#/grades, #/courses, …) that is kept in sync so:
//   • refresh / app re-open restores the exact screen
//   • the Android/browser back gesture walks the real visit history
//   • duplicate tab taps no longer poison the back stack (navigate guards)
// =====================================================
const ROUTE_TO_HASH: Record<ScreenRoute, string> = {
  HOME: "home",
  COURSES: "courses",
  SCHEDULE: "schedule",
  EXAMS: "exams",
  TOOLS: "tools",
  ASSIGNMENTS: "assignments",
  FILES: "files",
  GROUP: "group",
  BROWSE_GROUPS: "browse-groups",
  PROFILE: "profile",
  SETTINGS: "settings",
  ANNOUNCEMENTS: "announcements",
  ADMIN: "admin",
  TELEGRAM: "telegram",
  COURSE_DETAIL: "course",
  ONBOARDING: "onboarding", // never restored from the URL — gated below
};

function routeFromHash(hash: string): ScreenRoute {
  const key = hash.replace(/^#\/?/, "").toLowerCase();
  if (!key) return "HOME";
  const found = (Object.entries(ROUTE_TO_HASH) as Array<[ScreenRoute, string]>).find(
    ([, h]) => h === key
  );
  if (!found) return "HOME";
  // never restore INTO onboarding from the URL — the onboarding gate owns it
  if (found[0] === "ONBOARDING") return "HOME";
  return found[0];
}

// Minimal shape a screen needs to open the course detail view.
export interface CourseSummary {
  id: number;
  name: string;
  code: string;
  coefficient: number;
  professorName: string;
  category: string;
  description: string;
  semester: number;
}

interface ShellContextValue {
  currentScreen: ScreenRoute;
  navigate: (route: ScreenRoute) => void;
  navigateBack: () => void;
  showLoading: (message?: string) => void;
  hideLoading: () => void;
  detailCourse: CourseSummary | null;
  navigateToCourse: (course: CourseSummary) => void;
}

const ShellContext = React.createContext<ShellContextValue | null>(null);

export function useShell() {
  const ctx = React.useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used within ShellProvider");
  return ctx;
}

function ShellInner() {
  const { t, dir } = useI18n();
  const { theme, setTheme } = useTheme();
  const { palette, togglePalette } = usePalette();
  const { user, loading: authLoading, signOut, refresh } = useAuth();

  const [currentScreen, setCurrentScreen] = React.useState<ScreenRoute>("HOME");
  // In-app back stack (the header chevron). Browser history is mirrored via
  // pushState — see the routing comment above.
  const historyStackRef = React.useRef<ScreenRoute[]>([]);
  const [detailCourse, setDetailCourse] = React.useState<CourseSummary | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [loadingMessage, setLoadingMessage] = React.useState("");
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<AppNotificationItem[]>([]);
  const [notifUnread, setNotifUnread] = React.useState(0);
  const [notifLoading, setNotifLoading] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [onboardingDone, setOnboardingDone] = React.useState(true);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Check if user needs onboarding
  // fix (R25): onboarding used to be gated by localStorage ONLY — a
  // fully-registered student who cleared browser data, switched devices,
  // or reinstalled was forced through the whole setup flow again even
  // though their profile exists in the DB. The DB row is now the source
  // of truth: /api/onboarding/complete (and role grants) persist the
  // academic scope on the user row, so a non-null scope specialty/year
  // means the profile is complete and the flow is skipped — with an
  // EMPTY localStorage too. The localStorage flag stays as a fast local
  // cache and is backfilled after a DB-confirmed skip. (Note:
  // assignedSpecialtyId is NOT a valid marker — signup pre-fills it.)
  React.useEffect(() => {
    if (!user) return;
    const flagKey = `talib-onboarding-${user.id}`;
    // DB-backed: scope_academic_year_id / scope_specialty_id are null at
    // signup and only written by onboarding completion (or a role grant).
    const hasDbScope =
      user.scopeAcademicYearId != null || user.scopeSpecialtyId != null;
    const localDone = localStorage.getItem(flagKey) === "true";
    const done = localDone || hasDbScope;
    setOnboardingDone(done);
    if (!done) {
      setCurrentScreen("ONBOARDING");
    } else if (hasDbScope && !localDone) {
      // cache the DB verdict so subsequent loads skip the check instantly
      try {
        localStorage.setItem(flagKey, "true");
      } catch {
        // private mode — the DB check simply re-runs next load
      }
    }
  }, [user]);

  // Fetch unread count (fix B.8)
  const refreshUnreadCount = React.useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    try {
      const res = await fetch("/api/announcements/unread-count", {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count ?? 0);
      }
    } catch {
      // silent fail
    }
  }, [user]);

  // round 10 (review §3/§4): app notifications feed — join-request
  // outcomes for students, waiting items for supervisors.
  const refreshNotifications = React.useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setNotifUnread(0);
      return;
    }
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
        setNotifUnread(data.unreadCount ?? 0);
      }
    } catch {
      // silent fail — badge simply stays stale until next poll
    }
  }, [user]);

  React.useEffect(() => {
    refreshUnreadCount();
    refreshNotifications();
    const interval = setInterval(() => {
      refreshUnreadCount();
      refreshNotifications();
    }, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, [refreshUnreadCount, refreshNotifications]);

  // round 24 — temporal reminders: generate (idempotent) exam D-3/D-1/D-0
  // and assignment D-2/D-1/D-0 reminders for THIS user, then re-fetch the
  // feed if anything new was created. Triggered on mount + every 10 min —
  // deliberately NOT on the 30s poll loop, so the round-13 polling-cost
  // ceiling is not worsened (the 30s loop stays read-only).
  const generateReminders = React.useCallback(async () => {
    if (!user) return;
    try {
      // completion state lives in the student's localStorage — the server
      // cannot know which assignments are already done, so we tell it.
      let completedAssignmentIds: number[] = [];
      try {
        const raw = localStorage.getItem("talib-assignments-completed");
        if (raw) {
          const map = JSON.parse(raw) as Record<string, unknown>;
          completedAssignmentIds = Object.entries(map)
            .filter(([, v]) => !!v)
            .map(([k]) => Number(k))
            .filter((n) => Number.isFinite(n));
        }
      } catch {
        // corrupted storage — generate without completion info
      }
      const res = await fetch("/api/notifications/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completedAssignmentIds }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Number(data.created) > 0) refreshNotifications();
      }
    } catch {
      // silent — reminders retry on the next 10-min tick
    }
  }, [user, refreshNotifications]);

  React.useEffect(() => {
    if (!user || !onboardingDone) return;
    generateReminders();
    const interval = setInterval(generateReminders, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user, onboardingDone, generateReminders]);

  // fix (R12): the announcements screen marks its items read — the badge
  // refreshes IMMEDIATELY instead of waiting for the next 30s poll.
  React.useEffect(() => {
    const onAnnRead = () => { refreshUnreadCount(); };
    window.addEventListener("talib-ann-read", onAnnRead);
    return () => window.removeEventListener("talib-ann-read", onAnnRead);
  }, [refreshUnreadCount]);

  const markAllNotificationsRead = React.useCallback(async () => {
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      setNotifUnread(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    } catch {
      // silent
    }
  }, []);

  const navigate = React.useCallback((route: ScreenRoute) => {
    if (route === "COURSE_DETAIL") return; // use navigateToCourse
    setCurrentScreen((prev) => {
      // fix (R12-03): tapping the tab you are ALREADY on used to push a
      // duplicate history entry, so the back chevron appeared to do nothing.
      if (prev === route) return prev;
      historyStackRef.current.push(prev);
      return route;
    });
    const target = `#/${ROUTE_TO_HASH[route]}`;
    if (window.location.hash !== target) {
      window.history.pushState({ talib: route }, "", target);
    }
  }, []);

  const navigateToCourse = React.useCallback((course: CourseSummary) => {
    setDetailCourse(course);
    try {
      sessionStorage.setItem("talib-course", JSON.stringify(course));
    } catch {
      // storage disabled — in-session navigation still works
    }
    setCurrentScreen((prev) => {
      if (prev === "COURSE_DETAIL") return prev;
      historyStackRef.current.push(prev);
      return "COURSE_DETAIL";
    });
    const target = "#/course";
    if (window.location.hash !== target) {
      window.history.pushState({ talib: "COURSE_DETAIL" }, "", target);
    }
  }, []);

  const navigateBack = React.useCallback(() => {
    const stack = historyStackRef.current;
    if (stack.length > 0) {
      const prev = stack.pop()!;
      setCurrentScreen(prev);
      if (prev !== "COURSE_DETAIL") setDetailCourse(null);
      const target = `#/${ROUTE_TO_HASH[prev]}`;
      if (window.location.hash !== target) {
        window.history.pushState({ talib: prev }, "", target);
      }
    } else {
      setCurrentScreen("HOME");
      const target = "#/home";
      if (window.location.hash !== target) {
        window.history.replaceState({ talib: "HOME" }, "", target);
      }
    }
  }, []);

  // Browser / Android back gesture: the previous hash wins. The in-app stack
  // is cleared (the OS already walked back for us); the next in-app back
  // then safely falls home.
  React.useEffect(() => {
    function onPopState() {
      historyStackRef.current = [];
      const route = routeFromHash(window.location.hash);
      setCurrentScreen((prev) => (prev === route ? prev : route));
      if (route === "COURSE_DETAIL") {
        try {
          const raw = sessionStorage.getItem("talib-course");
          if (raw) setDetailCourse(JSON.parse(raw) as CourseSummary);
        } catch {
          // fall through — render guard below handles a missing course
        }
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Restore the last screen after a refresh / from a shared deep link once
  // we know who the user is (needed for the ADMIN role guard).
  React.useEffect(() => {
    if (!user) return;
    if (!window.location.hash) {
      window.history.replaceState({ talib: "HOME" }, "", "#/home");
      return;
    }
    const route = routeFromHash(window.location.hash);
    if (route === "COURSE_DETAIL") {
      try {
        const raw = sessionStorage.getItem("talib-course");
        if (raw) {
          setDetailCourse(JSON.parse(raw) as CourseSummary);
          setCurrentScreen("COURSE_DETAIL");
          return;
        }
      } catch {
        // corrupted session storage — fall through to HOME
      }
      window.history.replaceState({ talib: "HOME" }, "", "#/home");
      setCurrentScreen("HOME");
      return;
    }
    setCurrentScreen(route);
  }, [user]);

  const handleNotificationTap = React.useCallback(
    (item: AppNotificationItem) => {
      // mark the single notification read
      if (item.readAt == null) {
        fetch("/api/notifications/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [item.id] }),
        })
          .then(() => {
            setNotifUnread((c) => Math.max(0, c - 1));
            setNotifications((prev) =>
              prev.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n))
            );
          })
          .catch(() => {});
      }
      // deep link by type (review §4: the notification takes you to the
      // place where you can act on it)
      setNotifOpen(false);
      if (item.type === "join_approved" || item.type === "join_rejected") {
        navigate("BROWSE_GROUPS");
      } else if (item.type === "join_new" || item.type === "report_new") {
        navigate("ADMIN");
      } else if (item.type === "content_announcement") {
        navigate("ANNOUNCEMENTS");
      } else if (item.type === "content_exam" || item.type === "exam_reminder") {
        navigate("EXAMS");
      } else if (item.type === "content_assignment" || item.type === "assignment_reminder") {
        navigate("ASSIGNMENTS");
      } else if (item.type === "content_library") {
        navigate("FILES");
      }
    },
    [navigate]
  );

  const showLoading = React.useCallback((message?: string) => {
    setIsLoading(true);
    setLoadingMessage(message ?? "");
  }, []);

  const hideLoading = React.useCallback(() => {
    setIsLoading(false);
    setLoadingMessage("");
  }, []);

  const shellValue: ShellContextValue = {
    currentScreen,
    navigate,
    navigateBack,
    showLoading,
    hideLoading,
    detailCourse,
    navigateToCourse,
  };

  // Auth loading state
  if (authLoading || !mounted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="relative w-16 h-16">
            <img
              src="/talib/icon.svg"
              alt="Talib"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{t("common.loading")}</span>
          </div>
        </div>
      </div>
    );
  }

  // Not authenticated → show login
  if (!user) {
    return (
      <div dir={dir} className="min-h-screen bg-background">
        <TalibLoginScreen />
        <SonnerToaster position="top-center" dir={dir} />
      </div>
    );
  }

  // Needs onboarding — pure render gate (no setState during render):
  // onboarding wins over ANY screen, including a restored deep link.
  if (!onboardingDone) {
    return (
      <ShellContext.Provider value={shellValue}>
        <div dir={dir} className="min-h-screen bg-background flex flex-col">
          <main className="flex-1">
            <TalibOnboardingScreen
              onComplete={async () => {
                if (user) {
                  localStorage.setItem(
                    `talib-onboarding-${user.id}`,
                    "true"
                  );
                }
                // fix أ.3/أ.4 (round 3): the session user used to stay stale
                // after onboarding (assignedSpecialtyId = first specialty,
                // null year/track) so the join screen leaked other
                // specialties' groups until a full page reload. Refresh the
                // session user BEFORE navigating home.
                await refresh();
                setOnboardingDone(true);
                window.history.replaceState({ talib: "HOME" }, "", "#/home");
                setCurrentScreen("HOME");
                toast.success(t("onboarding.finish"));
              }}
            />
          </main>
          <SonnerToaster position="top-center" dir={dir} />
        </div>
      </ShellContext.Provider>
    );
  }

  // fix (R12-06, P0): the ADMIN panel used to render for ANY role reached
  // via the notification deep-link or a typed URL. The route is now gated —
  // non-supervisors land on HOME (defense in depth; the APIs already
  // enforce their own authorization).
  const effectiveScreen: ScreenRoute =
    currentScreen === "ADMIN" && !canManageRoles(user ?? null) ? "HOME" : currentScreen;

  const isAdminScreen = effectiveScreen === "ADMIN";
  const showHeader = true;
  const showBottomNav = !isAdminScreen;

  return (
    <ShellContext.Provider value={shellValue}>
      <div dir={dir} className="min-h-screen bg-background flex flex-col">
        {/* Header */}
        {showHeader && (
          <header className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
            <div className="mx-auto max-w-5xl px-4 py-3 flex items-center gap-3">
              {/* Back button */}
              {effectiveScreen !== "HOME" && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={navigateBack}
                  className="shrink-0"
                  aria-label={t("common.back")}
                >
                  <ChevronLeft className={cn("w-5 h-5", dir === "rtl" && "rotate-180")} />
                </Button>
              )}

              {/* App logo + name */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <img
                  src="/talib/icon.svg"
                  alt="Talib"
                  className="w-8 h-8 shrink-0"
                />
                <span className="font-bold text-base truncate">
                  {t("common.appName")}
                </span>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1">
                {/* fix H-1 (round 4): language toggle hidden — EN translation
                    is incomplete (~450 hardcoded Arabic strings). Re-enable the
                    Languages button when src/messages/en.json covers all UI. */}

                {/* Palette toggle (academic / modern) */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={togglePalette}
                  className="shrink-0 h-10 w-10"
                  aria-label="Toggle palette"
                  title={palette === "academic" ? "أكاديمي" : "عصري"}
                >
                  <Palette className="w-4 h-4" />
                </Button>

                {/* Dark / light toggle */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="shrink-0 h-10 w-10"
                  aria-label="Toggle dark mode"
                >
                  {theme === "dark" ? (
                    <Sun className="w-4 h-4" />
                  ) : (
                    <Moon className="w-4 h-4" />
                  )}
                </Button>

                {/* Notifications bell (fix B.8 + round 10 review §3/§4):
                    opens the unified notifications panel — join-request
                    outcomes (students) + waiting items (supervisors) —
                    with announcements still reachable inside it. */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setNotifOpen(true);
                    setNotifLoading(true);
                    refreshNotifications().finally(() => setNotifLoading(false));
                  }}
                  className="shrink-0 relative h-10 w-10"
                  aria-label={t("nav.notifications")}
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount + notifUnread > 0 && (
                    <Badge
                      variant="destructive"
                      className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-xs flex items-center justify-center"
                    >
                      {unreadCount + notifUnread > 9 ? "9+" : unreadCount + notifUnread}
                    </Badge>
                  )}
                </Button>

                {/* Settings gear (round 26): opens the app settings screen
                    — notification preferences live here now, more sections
                    can be added later. Previously it only jumped to حسابي.
                    id used by the first-run tour (review §15). */}
                <Button
                  id="talib-tour-gear"
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate("SETTINGS")}
                  className="shrink-0 h-10 w-10"
                  aria-label="الإعدادات"
                >
                  <Settings className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Loading indicator */}
            <AnimatePresence>
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="absolute top-full left-0 right-0 bg-primary/10 backdrop-blur-sm border-b border-primary/20 py-2 px-4 text-center"
                >
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                    <span className="text-primary font-medium">
                      {loadingMessage || t("common.loading")}
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </header>
        )}

        {/* Main content */}
        <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-4 pb-24">
          <AnimatePresence mode="wait">
            <motion.div
              key={effectiveScreen}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {effectiveScreen === "HOME" && <TalibHomeScreen />}
              {effectiveScreen === "COURSES" && <TalibCoursesScreen />}
              {effectiveScreen === "SCHEDULE" && <TalibScheduleScreen />}
              {effectiveScreen === "EXAMS" && <TalibExamsScreen />}
              {/* round 29: the standalone حاسبة الطالب screen was removed by
                  owner request — the calculator now lives in أدواتي (the GPA
                  tool reads/writes the same talib-grades storage). TOOLS opens
                  ملفاتي straight on the أدواتي tab. */}
              {effectiveScreen === "TOOLS" && <TalibFilesScreen initialTab="tools" />}
              {effectiveScreen === "ASSIGNMENTS" && <TalibAssignmentsScreen />}
              {effectiveScreen === "FILES" && <TalibFilesScreen />}
              {effectiveScreen === "TELEGRAM" && <TalibTelegramScreen />}
              {effectiveScreen === "GROUP" && <TalibGroupScreen />}
              {effectiveScreen === "BROWSE_GROUPS" && <TalibBrowseGroupsScreen />}
              {effectiveScreen === "ANNOUNCEMENTS" && <TalibAnnouncementsScreen />}
              {effectiveScreen === "COURSE_DETAIL" && (
                <TalibCourseDetailScreen course={detailCourse} />
              )}
              {effectiveScreen === "PROFILE" && (
                <TalibProfileScreen
                  onSignOut={async () => {
                    await signOut();
                    window.history.replaceState({ talib: "HOME" }, "", "#/home");
                    setCurrentScreen("HOME");
                  }}
                />
              )}
              {effectiveScreen === "SETTINGS" && <TalibSettingsScreen />}
              {effectiveScreen === "ADMIN" && <TalibAdminPanelScreen />}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Bottom navigation */}
        {showBottomNav && (
          <TalibBottomNavBar
            currentScreen={currentScreen}
            onNavigate={navigate}
          />
        )}

        <SonnerToaster position="top-center" dir={dir} />

        {/* round 27 (review §15): first-run tour — three steps (services
            grid → gear → حسابي), shown once, dismissible at every step. */}
        <TalibTourOverlay currentScreen={currentScreen} />

        {/* round 10 (review §3/§4): unified notifications panel */}
        <TalibNotificationsSheet
          open={notifOpen}
          onOpenChange={setNotifOpen}
          notifications={notifications}
          loading={notifLoading}
          announcementsUnread={unreadCount}
          onMarkAllRead={markAllNotificationsRead}
          onOpenAnnouncements={() => {
            setNotifOpen(false);
            navigate("ANNOUNCEMENTS");
          }}
          onItemTap={handleNotificationTap}
        />
      </div>
    </ShellContext.Provider>
  );
}

export default function Page() {
  return (
    <AuthProvider>
      <ShellInner />
    </AuthProvider>
  );
}
