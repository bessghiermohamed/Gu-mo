#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""r69 patch 6 — bottom nav: «أدواتي» becomes a first-class bottom-bar
destination for every role (owner request: regular students reach the tools
without hunting the home grid). Icon matches the tools screen (Wrench)."""
import io

PATH = "src/components/talib/bottom-nav-bar.tsx"

src = io.open(PATH, encoding="utf-8").read()


def apply(old: str, new: str, count: int = 1) -> None:
    global src
    n = src.count(old)
    assert n == count, f"anchor x{n} (expected {count}): {old[:90]!r}"
    src = src.replace(old, new)


# 1) icon import
apply(
    'import { Home, BookOpen, CalendarDays, User, LayoutDashboard } from "lucide-react";',
    'import { Home, BookOpen, CalendarDays, User, LayoutDashboard, Wrench } from "lucide-react";',
)

# 2) nav item — between Schedule and Profile
apply(
    """    {
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
    },""",
    """    {
      route: "SCHEDULE",
      label: t("nav.schedule"),
      icon: <CalendarDays className="w-5 h-5" />,
      show: true,
    },
    {
      // r69: أدواتي في الشريط السفلي — كان الوصول إليها من شبكة الرئيسية فقط
      route: "TOOLS",
      label: t("nav.tools"),
      icon: <Wrench className="w-5 h-5" />,
      show: true,
    },
    {
      route: "PROFILE",
      label: t("nav.profile"),
      icon: <User className="w-5 h-5" />,
      show: true,
    },""",
)

# 3) tighter tiles so 6 destinations (admins) still fit a 390px phone
apply(
    """                "flex flex-col items-center justify-center gap-1 py-2 px-3 rounded-xl transition-all min-w-16 min-h-14",""",
    """                "flex flex-col items-center justify-center gap-1 py-2 px-2 sm:px-3 rounded-xl transition-all min-w-14 sm:min-w-16 min-h-14",""",
)

io.open(PATH, "w", encoding="utf-8").write(src)
print("r69 patch 6 (bottom nav) OK")
