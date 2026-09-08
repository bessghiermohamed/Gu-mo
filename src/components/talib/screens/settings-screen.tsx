"use client";

import * as React from "react";
import {
  Bell, VolumeX, Info, Loader2, Palette, Sparkles, Compass,
  User, LogOut, LifeBuoy, Megaphone, Users,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/components/talib/auth-provider";
import { useI18n } from "@/components/talib/i18n-provider";
import { usePalette, PALETTES } from "@/components/talib/theme-provider";
import { useShell } from "@/app/app/page";
import { useTheme } from "next-themes";
import { toast } from "sonner";

// round 26 — the app-level settings screen. Opened from the header gear
// icon (which previously only jumped to حسابي). Built as independent
// sections so more settings can be appended without rethinking layout.
//
// round 55 (طلب المالك: «الإعدادات ومحتواها تحتاج تحسيناً وميزات إضافية»):
//   • بطاقة «حسابي» أعلى الشاشة: هوية الطالب + موقعه الأكاديمي (المؤسسة/
//     التخصص/السنة/المجموعة/الفوج) من نفس مصدر حسابي (/api/profile/details)
//     مع اختصارات (فتح حسابي، الإعلانات، الفوج) — كانت الإعدادات بلا أي
//     ذكر لحساب صاحبها.
//   • بطاقة «المساعدة والدعم»: الإبلاغ عن مشكلة وتصفح الأفواج.
//   • زر «تسجيل الخروج» — كان محصوراً في حسابي.
//   • تحديث النصوص القديمة: وصف الجولة التعريفية قال «ثلاث خطوات» وهي
//     سبع مراحل إلزامية منذ r51/r55.
//
// Section: notification preferences — MOVED VERBATIM from the profile
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
  const { user, signOut } = useAuth();
  const { t } = useI18n();
  const { navigate } = useShell();
  const { theme, setTheme } = useTheme();
  const { palette, setPalette } = usePalette();

  // round 55 — academic identity (same source as حسابي): institution,
  // specialty, year, المجموعة/الفوج. null = loading, false = unavailable.
  const [details, setDetails] = React.useState<{
    institution: string; specialtyName: string; trackName: string;
    yearName: string; groupName: string; cohortName: string;
  } | null | false>(null);
  const [signingOut, setSigningOut] = React.useState(false);

  React.useEffect(() => {
    if (!user) return;
    let alive = true;
    fetch("/api/profile/details", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => { if (alive) setDetails(data.profile ?? false); })
      .catch(() => { if (alive) setDetails(false); });
    return () => { alive = false; };
  }, [user]);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try { await signOut(); } finally { setSigningOut(false); }
  }

  // notification preferences state (moved unchanged from profile-screen)
  const [prefsAvailable, setPrefsAvailable] = React.useState<boolean | null>(null);
  const [muted, setMuted] = React.useState<string[]>([]);
  const [savingPref, setSavingPref] = React.useState(false);
  // round 52 — browser notification permission ("default" | "granted" | "denied" | "unsupported")
  const [notifPerm, setNotifPerm] = React.useState<string>("default");

  React.useEffect(() => {
    // async settle — avoids the sync setState-in-effect lint error
    const t = setTimeout(() => {
      setNotifPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  async function askNotifPermission() {
    if (typeof Notification === "undefined") return;
    try {
      const p = await Notification.requestPermission();
      setNotifPerm(p);
      if (p === "granted") toast.success("تم تفعيل إشعارات المتصفح — يصلك التنبيه حتى في الخلفية");
      else if (p === "denied") toast.error("حُظرت الإشعارات — يمكنك تفعيلها من إعدادات الموقع في المتصفح");
    } catch {
      toast.error("تعذّر طلب الإذن من المتصفح");
    }
  }

  React.useEffect(() => {
    if (!user) return;
    // لا تصفير متزامن داخل الـ effect (قاعدة set-state-in-effect): الحالة
    // تبدأ null، والشاشة تُركَّب بعد تسجيل الدخول فقط فلا حاجة لإعادة ضبط.
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
        <h1 className="text-2xl font-black">الإعدادات</h1>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          شخصّ تجربتك: حسابك الأكاديمي، إشعاراتك، مظهر التطبيق، والمساعدة — كل ذلك من مكان واحد
        </p>
      </div>

      {/* round 55 — بطاقة الحساب: هوية صاحب الإعدادات وموقعه الأكاديمي.
          نفس مصدر حسابي (api/profile/details) فلا مصدرين للحقيقة. */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-black text-lg shrink-0">
            {user.fullName.trim().charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-black text-sm truncate">{user.fullName}</h3>
            <p className="text-xs text-muted-foreground truncate" dir="ltr" style={{ textAlign: "end" }}>
              {user.email}
            </p>
          </div>
          <Badge variant="secondary" className="text-[10px] shrink-0">
            {t(`roles.${user.role}`)}
          </Badge>
        </div>

        {details === null ? (
          <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            جارٍ تحميل موقعك الأكاديمي…
          </div>
        ) : details !== false ? (
          <div className="grid grid-cols-2 gap-2 text-xs">
            {([
              ["المؤسسة", details.institution],
              ["التخصص", details.specialtyName],
              ["الشعبة", details.trackName],
              ["السنة", details.yearName],
              ["المجموعة", details.groupName],
              ["الفوج", details.cohortName],
            ] as const).map(([label, value]) => (
              <div key={label} className="rounded-lg border bg-muted/30 px-2.5 py-2">
                <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
                <p className="font-bold truncate" title={value || undefined}>{value || "—"}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            تعذّر جلب الموقع الأكاديمي الآن — تجده دائماً في تبويب حسابي.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-8" onClick={() => navigate("PROFILE")}>
            <User className="w-3.5 h-3.5 ml-1" />
            فتح حسابي
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={() => navigate("ANNOUNCEMENTS")}>
            <Megaphone className="w-3.5 h-3.5 ml-1" />
            الإعلانات
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={() => navigate("GROUP")}>
            <Users className="w-3.5 h-3.5 ml-1" />
            فوجي
          </Button>
        </div>
      </Card>

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

        {/* round 52 — إشعارات المتصفح: «مثل باقي التطبيقات» — التنبيه يصل
            حتى والتبويب في الخلفية، بشرط منح الإذن من هنا */}
        {notifPerm !== "unsupported" && (
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-muted/30">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">إشعارات المتصفح</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                {notifPerm === "granted"
                  ? "مُفعّلة — يظهر تنبيه النظام فور وصول إشعار جديد"
                  : notifPerm === "denied"
                    ? "محظورة من المتصفح — فعّلها من إعدادات الموقع"
                    : "فعّلها ليصلك تنبيه فور وصول إشعار جديد حتى في الخلفية"}
              </p>
            </div>
            {notifPerm === "default" && (
              <Button size="sm" variant="outline" className="shrink-0" onClick={askNotifPermission}>
                تفعيل
              </Button>
            )}
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
                {palette === "academic" ? "أكاديمي — الهوية الرسمية للتطبيق" : palette === "modern" ? "عصري — ألوان حيوية وأنيقة" : "أزرق — هوية هادئة قابلة للاستبدال"}
              </p>
            </div>
            <Palette className="w-4 h-4 text-muted-foreground shrink-0" />
          </div>
        </div>
        {/* round 52 — منتقي الأنماط الثلاثة بدل مبدّل ثنائي: الأخضر
            الأكاديمي، البنفسجي العصري، والأزرق الجديد القابل للاستبدال */}
        <div className="grid grid-cols-3 gap-2">
          {PALETTES.map((p) => {
            const active = palette === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPalette(p.id)}
                aria-pressed={active}
                className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 text-center transition-colors ${
                  active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                }`}
              >
                <span
                  className="w-6 h-6 rounded-full border border-black/10"
                  style={{ background: p.swatch }}
                  aria-hidden
                />
                <span className={`text-xs font-bold ${active ? "text-primary" : "text-foreground"}`}>{p.label}</span>
                <span className="text-[10px] text-muted-foreground leading-tight">{p.desc}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* round 49/55 — replay the first-run tour. The tour is MANDATORY
          since round 55 (لا زر تخطّي — تُنهى بإكمال محطاتها) and spans
          7 stops across the app since round 51; the old copy said
          «ثلاث خطوات» which no longer described reality. */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Compass className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm">الجولة التعريفية</h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              جولة إلزامية عبر سبعة مواضع تفتح تلقائياً عند أول دخول وتُنهى بإكمال محطاتها — ويمكنك إعادتها من هنا متى شئت
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => {
            if (!user) return;
            try {
              localStorage.removeItem(`talib-tour-${user.id}`);
            } catch {
              toast.error("تعذّر إعادة الجولة — التخزين المحلي معطّل على هذا الجهاز");
              return;
            }
            navigate("HOME");
            toast.info("ستبدأ الجولة تلقائياً في الشاشة الرئيسية");
          }}
        >
          <Compass className="w-3.5 h-3.5 ml-1" />
          إعادة الجولة التعريفية
        </Button>
      </Card>

      {/* round 55 — المساعدة والدعم: قنوات الوصول للإدارة كانت مكرّرة بين
          حسابي والإعدادات بشكل غير واضح؛ هنا زرّان مباشران: التبليغ عن
          مشكلة (نموذج حسابي) وتصفّح المجموعات والأفواج (طلب انضمام). */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <LifeBuoy className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm">المساعدة والدعم</h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              واجهت خللاً؟ أو لم تجد فوجك؟ تواصل مع الإدارة من هنا
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" className="h-9" onClick={() => navigate("PROFILE")}>
            <Info className="w-3.5 h-3.5 ml-1" />
            الإبلاغ عن مشكلة
          </Button>
          <Button variant="outline" size="sm" className="h-9" onClick={() => navigate("BROWSE_GROUPS")}>
            <Users className="w-3.5 h-3.5 ml-1" />
            تصفّح الأفواج
          </Button>
        </div>
      </Card>

      {/* round 55 — تسجيل الخروج من الإعدادات: كان محصوراً في قائمة حسابي؛
          وجوده هنا يختصر الطريق على من يفتح الترس مباشرة. */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
            <LogOut className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm">تسجيل الخروج</h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              ستبقى بياناتك محفوظة، ويمكنك العودة في أي وقت بنفس بريدك
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut && <Loader2 className="w-3.5 h-3.5 ml-1 animate-spin" />}
            خروج
          </Button>
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
          </p>
        </div>
      </Card>
    </div>
  );
}
