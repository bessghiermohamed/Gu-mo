"use client";

import * as React from "react";
import {
  Bell, VolumeX, Info, Loader2, Palette, Sparkles, Compass,
  LogOut, BellRing, Type, Monitor, Trash2, CheckCheck, Camera, ImagePlus,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/components/talib/auth-provider";
import { useI18n } from "@/components/talib/i18n-provider";
import { usePalette, PALETTES } from "@/components/talib/theme-provider";
import { useShell } from "@/app/app/page";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  FONT_SCALE_OPTIONS, loadFontScale, saveFontScale, type FontScale,
} from "@/lib/font-scale";
import { pushSupported, notificationPermission, activatePushWithPrompt } from "@/lib/push-client";
import {
  useAvatar, processAvatarFile, saveAvatar, removeAvatarKey, notifyAvatarChanged,
} from "@/lib/avatar";

// round 26 — the app-level settings screen. Opened from the header gear.
//
// round 56 (owner: «الإعدادات فقط تكرارات لحسابي ولا جديد فيها»):
//   • REMOVED the pure-duplicate bits: the account card's three shortcut
//     buttons (فتح حسابي/الإعلانات/فوجي — all exist in their own screens)
//     and the «المساعدة والدعم» card (its buttons only navigated to
//     PROFILE/BROWSE_GROUPS — duplicates of حسابي's own rows).
//   • ADDED genuinely NEW settings that exist nowhere else:
//       - حجم الواجهة والخط (normal/large/larger — root font scale)
//       - مظهر الجهاز: فاتح/داكن/تلقائي (follows the OS)
//       - الإشعارات خارج المتصفح (Web Push state + activation)
//       - مسح البيانات المحلية (AI chats + completion cache on THIS device)
//   • The account card keeps ONLY the identity row (whose settings these
//     are) — academic details stay in حسابي where they belong.
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

  // ═══ الصورة الشخصية (round 75 — بطلب المالك) ═══
  // كانت أيقونتا الكاميرا والإزالة فوق صندوق الصورة في حسابي؛ نُقلتا
  // إلى هنا تحت الترس كما طلب المالك: بطاقة واحدة تجمع المعاينة والرفع
  // من الجهاز (قصّ مربع + ضغط محلي) والإزالة، والتخزين على جهاز الطالب
  // بلا خادم. التغيير يبثّ حدثاً محلياً فتتحدّث حسابي وبانر الرئيسية فوراً.
  const avatar = useAvatar(user?.id);
  const photoInputRef = React.useRef<HTMLInputElement>(null);

  async function handlePhotoFile(file: File | undefined) {
    if (!file || !user) return;
    try {
      const dataUrl = await processAvatarFile(file);
      if (!saveAvatar(user.id, dataUrl)) {
        toast.error("تعذر حفظ الصورة — مساحة التخزين ممتلئة");
        return;
      }
      notifyAvatarChanged();
      toast.success("تم تحديث صورتك الشخصية");
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      if (code === "INVALID_TYPE") toast.error("اختر ملف صورة صالح");
      else if (code === "READ_FAILED") toast.error("تعذر قراءة الملف");
      else toast.error("تعذر معالجة الصورة");
    }
  }

  function handleRemovePhoto() {
    if (!user) return;
    removeAvatarKey(user.id);
    notifyAvatarChanged();
    toast.success("تمت إزالة الصورة");
  }

  const [signingOut, setSigningOut] = React.useState(false);
  const [wipeOpen, setWipeOpen] = React.useState(false);
  const [wiping, setWiping] = React.useState(false);

  // round 56 — font scale (new setting). Initialize AFTER mount to stay
  // SSR-safe; apply immediately so the change is felt while still on screen.
  const [fontScale, setFontScale] = React.useState<FontScale>("normal");
  React.useEffect(() => {
    const s = loadFontScale();
    setFontScale(s);
  }, []);
  function chooseFontScale(next: FontScale) {
    setFontScale(next);
    saveFontScale(next);
    toast.success(next === "normal" ? "عاد الواجهة لحجمها الافتراضي" : "تم تكبير الواجهة والخط");
  }

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try { await signOut(); } finally { setSigningOut(false); }
  }

  // notification preferences state (moved unchanged from profile-screen)
  const [prefsAvailable, setPrefsAvailable] = React.useState<boolean | null>(null);
  const [muted, setMuted] = React.useState<string[]>([]);
  const [savingPref, setSavingPref] = React.useState(false);
  // round 52/56 — browser/push notification permission state
  const [notifPerm, setNotifPerm] = React.useState<string>("default");

  React.useEffect(() => {
    // async settle — avoids the sync setState-in-effect lint error
    const t = setTimeout(() => {
      setNotifPerm(
        !pushSupported() ? "unsupported" : notificationPermission()
      );
    }, 0);
    return () => clearTimeout(t);
  }, []);

  async function enablePush() {
    const result = await activatePushWithPrompt();
    if (result === "granted" || result === "failed") {
      // re-read the live state either way (denied keeps the old value)
      setNotifPerm(notificationPermission());
    } else {
      setNotifPerm(notificationPermission());
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

  // round 56 — wipe THIS device's local data: AI chat history + the
  // assignment-completion cache the reminder generator reads. Nothing
  // server-side is touched.
  async function handleWipeLocalData() {
    setWiping(true);
    try {
      let cleared = 0;
      const kill = new Set<string>(["talib-assignments-completed"]);
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith("talib-ai-chat-v1-") || kill.has(key))) {
          localStorage.removeItem(key);
          cleared++;
          i--; // removing shifts indices
        }
      }
      toast.success(`تم مسح ${cleared > 0 ? `${cleared} عنصراً` : "كل شيء"} من هذا الجهاز`);
      setWipeOpen(false);
    } catch {
      toast.error("تعذّر المسح — التخزين المحلي معطّل");
    } finally {
      setWiping(false);
    }
  }

  if (!user) return null;

  const visibleCategories = CATEGORY_META.filter(
    (c) => !c.supervisorOnly || isSupervisor(user.role)
  );

  const themeMode = theme === "dark" ? "dark" : theme === "system" ? "system" : "light";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">الإعدادات</h1>
      </div>

      {/* round 56 — account identity ONLY (whose settings these are). The
          academic-position grid and the three shortcut buttons moved OUT:
          they were حسابي duplicates — the owner's exact complaint. */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl overflow-hidden bg-primary/10 text-primary flex items-center justify-center font-black text-lg shrink-0 border border-border">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              user.fullName.trim().charAt(0)
            )}
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
      </Card>

      {/* ═══ الصورة الشخصية (round 75 — بطلب المالك) ═══
          الإدارة الكاملة للصورة تحت الترس: معاينة + رفع من الجهاز + إزالة.
          حسابي يكتفي بعرضها، والرئيسية تجعلها خلفية البانر. */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Camera className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm">الصورة الشخصية</h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              تظهر في حسابي وتصبح خلفية بانر الرئيسية — تُخزَّن في جهازك فقط
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div
            className="w-16 h-16 rounded-2xl overflow-hidden bg-primary/10 text-primary flex items-center justify-center font-black text-xl shrink-0 border border-border"
            role="img"
            aria-label={avatar ? "صورتك الشخصية" : "لا صورة بعد — يُعرض الحرف الأول من اسمك"}
          >
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              user.fullName.trim().charAt(0)
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                handlePhotoFile(e.target.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => photoInputRef.current?.click()}
            >
              <ImagePlus className="w-3.5 h-3.5 ml-1" />
              {avatar ? "تغيير الصورة" : "إضافة صورة"}
            </Button>
            {avatar && (
              <Button
                size="sm"
                variant="outline"
                className="border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={handleRemovePhoto}
              >
                <Trash2 className="w-3.5 h-3.5 ml-1" />
                إزالة الصورة
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* notification preferences: the anti-spam control
          center. Muted categories stop at the emitter, so unread
          counts and the 30s poll payload shrink too. Transactional
          outcomes (join request results, YOUR report resolutions) are
          always delivered. */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Bell className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm">تفضيلات الإشعارات</h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              أطفئ ما لا يهمّك — نتائج طلباتك وتبليغاتك تصلك دائماً
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

        {/* round 56 — الإشعارات خارج المتصفح (Web Push): يصلك التنبيه حتى
            والتطبيق غير مفتوح. يُفعَّل تلقائياً إن كان الإذن ممنوحاً مسبقاً،
            ويسألك التطبيق في الجلسة الرابعة إن لم تكن قد أجبت بعد. */}
        {notifPerm !== "unsupported" && (
          <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${
            notifPerm === "granted" ? "bg-emerald-500/5 border-emerald-500/30" : "bg-muted/30"
          }`}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <BellRing className="w-3.5 h-3.5 text-primary shrink-0" />
                الإشعارات خارج المتصفح
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                {notifPerm === "granted"
                  ? "مُفعّلة — يصلك التنبيه حتى والتطبيق غير مفتوح"
                  : notifPerm === "denied"
                    ? "محظورة من المتصفح — فعّلها من إعدادات الموقع"
                    : "تفعيلها يجعل نتيجة تبليغك والإعلانات تصلك في أي وقت"}
              </p>
            </div>
            {notifPerm === "default" && (
              <Button size="sm" variant="outline" className="shrink-0" onClick={enablePush}>
                تفعيل
              </Button>
            )}
            {notifPerm === "granted" && (
              <CheckCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            )}
          </div>
        )}
      </Card>

      {/* round 56 — المظهر: نمط الجهاز (فاتح/داكن/تلقائي) + حجم الواجهة
          والخط + الألوان. كله إعدادات جديدة لم تكن موجودة إلا جزئياً. */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Palette className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm">المظهر</h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              نمط الجهاز، حجم الواجهة، وهوية الألوان
            </p>
          </div>
        </div>

        {/* نمط العرض: فاتح / داكن / تلقائي (round 56 — «تلقائي» جديد:
            يتبع إعداد نظام جهازك) */}
        <div>
          <p className="text-[11px] font-bold text-muted-foreground mb-1.5 flex items-center gap-1">
            <Monitor className="w-3 h-3" />
            نمط العرض
          </p>
          <div className="grid grid-cols-3 gap-2">
            {([
              { id: "light", label: "فاتح", desc: "نهاري" },
              { id: "dark", label: "داكن", desc: "ليلي" },
              { id: "system", label: "تلقائي", desc: "حسب جهازك" },
            ] as const).map((m) => {
              const active = themeMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTheme(m.id)}
                  className={`flex flex-col items-center gap-0.5 rounded-xl border-2 px-2 py-2.5 text-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                  }`}
                >
                  <span className={`text-xs font-bold ${active ? "text-primary" : "text-foreground"}`}>
                    {m.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{m.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* حجم الواجهة والخط (round 56 — إعداد جديد تماماً) */}
        <div>
          <p className="text-[11px] font-bold text-muted-foreground mb-1.5 flex items-center gap-1">
            <Type className="w-3 h-3" />
            حجم الواجهة والخط
          </p>
          <div className="grid grid-cols-3 gap-2">
            {FONT_SCALE_OPTIONS.map((o) => {
              const active = fontScale === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => chooseFontScale(o.id)}
                  className={`flex flex-col items-center gap-0.5 rounded-xl border-2 px-2 py-2.5 text-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                  }`}
                >
                  <span className={`font-bold ${active ? "text-primary" : "text-foreground"} ${
                    o.id === "large" ? "text-base" : o.id === "larger" ? "text-lg" : "text-sm"
                  }`}>
                    {o.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{o.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* منتقي الأنماط الثلاثة (round 52) */}
        <div>
          <p className="text-[11px] font-bold text-muted-foreground mb-1.5">نمط الألوان</p>
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
        </div>
      </Card>

      {/* round 56 — البيانات المحلية على هذا الجهاز: محادثات المساعد
          الذكي وذاكرة الواجبات المنجزة. إعداد جديد كلياً. */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Trash2 className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm">بيانات جهازك</h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              محادثاتك مع المساعد الذكي وذاكرة الواجبات المنجزة محفوظة على هذا
              الجهاز فقط — امسحها متى شئت
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
          onClick={() => setWipeOpen(true)}
        >
          <Trash2 className="w-3.5 h-3.5 ml-1" />
          مسح بيانات هذا الجهاز
        </Button>

        <Dialog open={wipeOpen} onOpenChange={setWipeOpen}>
          <DialogContent className="max-w-sm text-right" dir="rtl">
            <DialogHeader>
              <DialogTitle>مسح بيانات هذا الجهاز؟</DialogTitle>
              <DialogDescription className="leading-relaxed">
                سيُمسح من جهازك: سجل محادثاتك مع المساعد الذكي، وذاكرة الواجبات
                التي علّمتها كمنجزة. بياناتك الأكاديمية على الخادم لا تُمسح،
                ولا يمكن التراجع عن هذا الإجراء.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-2 justify-start flex-row-reverse">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleWipeLocalData}
                disabled={wiping}
              >
                {wiping && <Loader2 className="w-3.5 h-3.5 ml-1 animate-spin" />}
                مسح الآن
              </Button>
              <Button variant="outline" size="sm" onClick={() => setWipeOpen(false)}>
                إلغاء
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </Card>

      {/* round 49/55 — replay the first-run tour. The tour is MANDATORY
          since round 55 (لا زر تخطّي — تُنهى بإكمال محطاتها) and spans
          7 stops across the app since round 51. */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Compass className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm">الجولة التعريفية</h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              جولة عبر سبعة مواضع تُنهى بإكمال محطاتها — أعدها من هنا متى شئت
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

      {/* تسجيل الخروج */}
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

      {/* about: a quiet identity card */}
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
