"use client";

import * as React from "react";
import { Bell, VolumeX, Info, Loader2, Palette, Moon, Sun, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/components/talib/auth-provider";
import { usePalette } from "@/components/talib/theme-provider";
import { useTheme } from "next-themes";
import { toast } from "sonner";

// round 26 — the app-level settings screen. Opened from the header gear
// icon (which previously only jumped to حسابي). Built as independent
// sections so more settings can be appended without rethinking layout.
//
// Section 1: notification preferences — MOVED VERBATIM from the profile
// screen (owner request: prefs live under the gear, not inside حسابي).
// State, endpoints, optimistic toggling and supervisor gating are exactly
// as they were in round 24; only the location changed.

// notification preference categories (mirrors
// src/lib/notifications.ts MUTABLE_CATEGORIES; kept local so the
// screen stays a pure presentational unit).
const CATEGORY_META: Array<{
  key: string;
  label: string;
  desc: string;
  supervisorOnly?: boolean;
}> = [
  { key: "announcements", label: "الإعلانات", desc: "إشعار عند نشر إعلان جديد في تخصصك" },
  { key: "exams", label: "الاختبارات", desc: "إشعار عند جدولة اختبار أو تغيير موعده" },
  { key: "assignments", label: "الواجبات", desc: "إشعار عند إضافة واجب أو تغيير موعد تسليمه" },
  { key: "library", label: "المكتبة", desc: "إشعار عند إضافة مرجع جديد للمكتبة" },
  { key: "reminders", label: "التذكيرات", desc: "تذكير قبل الاختبارات ومواعيد تسليم الواجبات" },
  { key: "group_events", label: "طلبات الانضمام", desc: "تنبيه عند وصول طلب انضمام جديد بانتظار مراجعتك", supervisorOnly: true },
  { key: "reports", label: "التبليغات", desc: "تنبيه عند وصول تبليغ جديد من طالب", supervisorOnly: true },
];

function isSupervisor(role: string | undefined): boolean {
  return role === "REPRESENTATIVE" || role === "SPECIALTY_ADMIN" || role === "OWNER";
}

export function TalibSettingsScreen() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const { palette, togglePalette } = usePalette();

  // notification preferences state (moved unchanged from profile-screen)
  const [prefsAvailable, setPrefsAvailable] = React.useState<boolean | null>(null);
  const [muted, setMuted] = React.useState<string[]>([]);
  const [savingPref, setSavingPref] = React.useState(false);

  React.useEffect(() => {
    if (!user) return;
    setPrefsAvailable(null);
    fetch("/api/notifications/preferences", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        setPrefsAvailable(data.available === true);
        setMuted(Array.isArray(data.mutedTypes) ? data.mutedTypes : []);
      })
      .catch(() => setPrefsAvailable(false));
  }, [user]);

  const toggleCategory = React.useCallback(
    async (key: string, nextMuted: boolean) => {
      if (savingPref) return;
      const prev = muted;
      const next = nextMuted
        ? Array.from(new Set([...prev, key]))
        : prev.filter((k) => k !== key);
      setMuted(next); // optimistic
      setSavingPref(true);
      try {
        const res = await fetch("/api/notifications/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mutedTypes: next }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMuted(prev); // revert
          toast.error(data.error ?? "تعذّر حفظ التفضيل");
          return;
        }
        setMuted(Array.isArray(data.mutedTypes) ? data.mutedTypes : next);
      } catch {
        setMuted(prev); // revert
        toast.error("تعذّر حفظ التفضيل — تحقق من الاتصال");
      } finally {
        setSavingPref(false);
      }
    },
    [muted, savingPref]
  );

  if (!user) return null;

  const visibleCategories = CATEGORY_META.filter(
    (c) => !c.supervisorOnly || isSupervisor(user.role)
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black mb-1">الإعدادات</h1>
        <p className="text-sm text-muted-foreground">اضبط التطبيق على مقاسك</p>
      </div>

      {/* notification preferences: the anti-spam control
          center. Muted categories stop at the emitter, so unread
          counts and the 30s poll payload shrink too. Transactional
          outcomes (join request results) are always delivered. */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Bell className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm">تفضيلات الإشعارات</h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              أطفئ ما لا يهمّك — يصل تنبيه «طلبات الانضمام» ونتائجها دائماً
            </p>
          </div>
          {muted.length > 0 && (
            <Badge variant="secondary" className="text-[10px] shrink-0">
              <VolumeX className="w-3 h-3 ml-0.5" />
              {muted.length} مكتوم
            </Badge>
          )}
        </div>

        {prefsAvailable === null ? (
          <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            جارٍ تحميل تفضيلاتك…
          </div>
        ) : prefsAvailable === false ? (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              التفضيلات تحتاج تحديثاً واحداً لقاعدة البيانات (جدول notification_prefs —
              نفّذ download/supabase_notification_prefs.sql من محرر SQL). حالياً تصلك
              كل الإشعارات.
            </span>
          </div>
        ) : (
          <div className="divide-y divide-border rounded-lg border">
            {visibleCategories.map((c) => {
              const isOn = !muted.includes(c.key);
              return (
                <div key={c.key} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{c.label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{c.desc}</p>
                  </div>
                  <Switch
                    checked={isOn}
                    disabled={savingPref}
                    onCheckedChange={(checked) => toggleCategory(c.key, !checked)}
                    aria-label={c.label}
                  />
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* round 26 — appearance: the dark-mode and palette toggles existed
          only as unlabeled header icons. They keep their one-tap header
          shortcuts, and gain a labeled home here. */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Palette className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm">المظهر</h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              طابع التطبيق الليلي وهوية ألوانه
            </p>
          </div>
        </div>

        <div className="divide-y divide-border rounded-lg border">
          <div className="flex items-center gap-3 px-3 py-2.5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">الوضع الليلي</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                {theme === "dark" ? "مُفعّل حالياً — مريح للعين ليلاً" : "غير مُفعّل — الوضع الفاتح مستخدم"}
              </p>
            </div>
            <Switch
              checked={theme === "dark"}
              onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
              aria-label="الوضع الليلي"
            />
          </div>
          <div className="flex items-center gap-3 px-3 py-2.5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">نمط الألوان</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                {palette === "academic" ? "أكاديمي — الهوية الرسمية للتطبيق" : "عصري — ألوان حيوية وأنيقة"}
              </p>
            </div>
            <Switch
              checked={palette === "modern"}
              onCheckedChange={() => togglePalette()}
              aria-label="نمط الألوان"
            />
          </div>
        </div>
      </Card>

      {/* round 26 — about: a quiet identity card. Deliberately version-free
          (same rule as the M-6 fix that removed the internal tag from
          حسابي) and free of external links. */}
      <Card className="p-5">
        <div className="flex flex-col items-center text-center gap-2">
          <img src="/talib/icon.svg" alt="طالب" className="w-12 h-12" />
          <h3 className="font-black text-base flex items-center gap-1.5">
            طالب
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            طالب | Talib — رفيقك الأكاديمي
            <br />
            جدولك ومقرراتك واختباراتك وإعلانات فوجك في مكان واحد
          </p>
        </div>
      </Card>
    </div>
  );
}
