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
import { TalibLoginScreen } from "@/components/talib/screens/login-screen";
import { TalibOnboardingScreen } from "@/components/talib/screens/onboarding-screen";
import { TalibHomeScreen } from "@/components/talib/screens/home-screen";
import { TalibCoursesScreen } from "@/components/talib/screens/courses-screen";
import { TalibScheduleScreen } from "@/components/talib/screens/schedule-screen";
import { TalibExamsScreen } from "@/components/talib/screens/exams-screen";
import { TalibGradesScreen } from "@/components/talib/screens/grades-screen";
import { TalibFilesScreen } from "@/components/talib/screens/files-screen";
import { TalibProfileScreen } from "@/components/talib/screens/profile-screen";
import { TalibAnnouncementsScreen } from "@/components/talib/screens/announcements-screen";
import { TalibAdminPanelScreen } from "@/components/talib/screens/admin-panel-screen";
import { TalibGroupScreen } from "@/components/talib/screens/group-screen";
import { TalibAssignmentsScreen } from "@/components/talib/screens/assignments-screen";
import { TalibBrowseGroupsScreen } from "@/components/talib/screens/browse-groups-screen";
import { TalibTelegramScreen } from "@/components/talib/screens/telegram-screen";
import { TalibBottomNavBar } from "@/components/talib/bottom-nav-bar";
import { cn } from "@/lib/utils";

export type ScreenRoute =
  | "HOME"
  | "COURSES"
  | "SCHEDULE"
  | "EXAMS"
  | "GRADES"
  | "ASSIGNMENTS"
  | "FILES"
  | "GROUP"
  | "BROWSE_GROUPS"
  | "PROFILE"
  | "ANNOUNCEMENTS"
  | "ADMIN"
  | "TELEGRAM"
  | "ONBOARDING";

interface ShellContextValue {
  currentScreen: ScreenRoute;
  navigate: (route: ScreenRoute) => void;
  navigateBack: () => void;
  showLoading: (message?: string) => void;
  hideLoading: () => void;
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
  const [history, setHistory] = React.useState<ScreenRoute[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [loadingMessage, setLoadingMessage] = React.useState("");
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [mounted, setMounted] = React.useState(false);
  const [onboardingDone, setOnboardingDone] = React.useState(true);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Check if user needs onboarding
  React.useEffect(() => {
    if (user) {
      // Check localStorage flag for onboarding completion
      const done = localStorage.getItem(`talib-onboarding-${user.id}`) === "true";
      setOnboardingDone(done);
      if (!done) {
        setCurrentScreen("ONBOARDING");
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

  React.useEffect(() => {
    refreshUnreadCount();
    const interval = setInterval(refreshUnreadCount, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, [refreshUnreadCount]);

  const navigate = React.useCallback((route: ScreenRoute) => {
    setCurrentScreen((prev) => {
      setHistory((h) => [...h, prev]);
      return route;
    });
  }, []);

  const navigateBack = React.useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) {
        setCurrentScreen("HOME");
        return h;
      }
      const newHistory = [...h];
      const prev = newHistory.pop()!;
      setCurrentScreen(prev);
      return newHistory;
    });
  }, []);

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

  // Needs onboarding
  if (!onboardingDone && currentScreen !== "ONBOARDING") {
    setCurrentScreen("ONBOARDING");
  }

  const isAdminScreen = currentScreen === "ADMIN";
  const isOnboardingScreen = currentScreen === "ONBOARDING";
  const showHeader = !isOnboardingScreen;
  const showBottomNav = !isAdminScreen && !isOnboardingScreen;

  return (
    <ShellContext.Provider value={shellValue}>
      <div dir={dir} className="min-h-screen bg-background flex flex-col">
        {/* Header */}
        {showHeader && (
          <header className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
            <div className="mx-auto max-w-5xl px-4 py-3 flex items-center gap-3">
              {/* Back button */}
              {currentScreen !== "HOME" && (
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

                {/* Notifications bell with real counter (fix B.8) */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate("ANNOUNCEMENTS")}
                  className="shrink-0 relative h-10 w-10"
                  aria-label={t("nav.notifications")}
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <Badge
                      variant="destructive"
                      className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-[10px] flex items-center justify-center"
                    >
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </Badge>
                  )}
                </Button>

                {/* Admin / Profile menu */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate("PROFILE")}
                  className="shrink-0 h-10 w-10"
                  aria-label={t("nav.profile")}
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
                    <span className="text-primary-foreground/80">
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
              key={currentScreen}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {currentScreen === "ONBOARDING" && (
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
                    setCurrentScreen("HOME");
                    toast.success(t("onboarding.finish"));
                  }}
                />
              )}
              {currentScreen === "HOME" && <TalibHomeScreen />}
              {currentScreen === "COURSES" && <TalibCoursesScreen />}
              {currentScreen === "SCHEDULE" && <TalibScheduleScreen />}
              {currentScreen === "EXAMS" && <TalibExamsScreen />}
              {currentScreen === "GRADES" && <TalibGradesScreen />}
              {currentScreen === "ASSIGNMENTS" && <TalibAssignmentsScreen />}
              {currentScreen === "FILES" && <TalibFilesScreen />}
              {currentScreen === "TELEGRAM" && <TalibTelegramScreen />}
              {currentScreen === "GROUP" && <TalibGroupScreen />}
              {currentScreen === "BROWSE_GROUPS" && <TalibBrowseGroupsScreen />}
              {currentScreen === "ANNOUNCEMENTS" && <TalibAnnouncementsScreen />}
              {currentScreen === "PROFILE" && (
                <TalibProfileScreen
                  onSignOut={async () => {
                    await signOut();
                    setCurrentScreen("HOME");
                  }}
                />
              )}
              {currentScreen === "ADMIN" && <TalibAdminPanelScreen />}
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
