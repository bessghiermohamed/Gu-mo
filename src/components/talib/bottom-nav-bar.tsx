"use client";

import * as React from "react";
import { Home, BookOpen, CalendarDays, User, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { canManageRoles } from "@/lib/auth/permissions";
import type { ScreenRoute } from "@/app/page";

interface Props {
  currentScreen: ScreenRoute;
  onNavigate: (route: ScreenRoute) => void;
}

export function TalibBottomNavBar({ currentScreen, onNavigate }: Props) {
  const { t } = useI18n();
  const { user } = useAuth();

  const items: Array<{
    route: ScreenRoute;
    label: string;
    icon: React.ReactNode;
    show: boolean;
  }> = [
    {
      route: "HOME",
      label: t("nav.home"),
      icon: <Home className="w-5 h-5" />,
      show: true,
    },
    {
      route: "COURSES",
      label: t("nav.courses"),
      icon: <BookOpen className="w-5 h-5" />,
      show: true,
    },
    {
      route: "SCHEDULE",
      label: t("nav.schedule"),
      icon: <CalendarDays className="w-5 h-5" />,
      show: true,
    },
    {
      route: "PROFILE",
      label: t("nav.profile"),
      icon: <User className="w-5 h-5" />,
      show: true,
    },
    {
      route: "ADMIN",
      label: t("nav.admin"),
      icon: <LayoutDashboard className="w-5 h-5" />,
      show: canManageRoles(user ?? null),
    },
  ];

  const visibleItems = items.filter((i) => i.show);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-t border-border"
      aria-label="Main navigation"
    >
      <div className="mx-auto max-w-5xl px-2 py-2 flex items-center justify-around gap-1">
        {visibleItems.map((item) => {
          const active = currentScreen === item.route;
          return (
            <button
              key={item.route}
              onClick={() => onNavigate(item.route)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-2 px-3 rounded-xl transition-all min-w-16 min-h-14",
                "hover:bg-accent/50 active:scale-95",
                active && "bg-primary/10 text-primary"
              )}
              aria-current={active ? "page" : undefined}
            >
              <div
                className={cn(
                  "flex items-center justify-center w-9 h-9 rounded-full transition-colors",
                  active ? "bg-primary/15 text-primary" : "text-muted-foreground"
                )}
              >
                {item.icon}
              </div>
              <span
                className={cn(
                  "text-[11px] font-medium leading-tight",
                  active ? "text-primary font-bold" : "text-muted-foreground"
                )}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
