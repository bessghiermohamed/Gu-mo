"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LogIn, UserPlus, Loader2, GraduationCap, Mail, User, Sparkles, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { toast } from "sonner";

/**
 * Login screen — round 56 (owner request):
 * «شاشة الدخول يجب أن تعرض خيار إنشاء حساب في المرة الأولى، بدل خيار
 * واحد فقط: الدخول ثم إنشاء حساب… وجدت الخيار المُفعّل تلقائياً هو
 * الدخول بدل إنشاء حساب، ونص الرقم التسلسلي في الأسفل يُحذف».
 *
 *  • First visit (no remembered email on this device) → the CREATE-ACCOUNT
 *    option is selected by default — a first-time student lands on
 *    «إنشاء الحساب», not on «دخول». Returning devices default to login.
 *  • The two options are now two big labelled buttons with icons; the
 *    selected one is visibly primary (the owner's «زرّان واضحان»).
 *  • Smart switching: a failed LOGIN with unknown data offers a one-tap
 *    «إنشاء حساب بهذه البيانات» (and vice-versa for an already-registered
 *    email) — the two flows stay one tap apart in both directions.
 *  • The serial-number note at the bottom of the form is DELETED (it
 *    confused first-timers into looking for a number they never had).
 */

const REMEMBERED_EMAIL_KEY = "talib-remembered-email";

function firstVisitOnDevice(): boolean {
  try {
    return !localStorage.getItem(REMEMBERED_EMAIL_KEY);
  } catch {
    return true; // storage disabled → treat as first visit (create account first)
  }
}

/**
 * round 58 — live connection status for the login flow. Starts `true` so SSR
 * markup and the first client render agree (no hydration mismatch), then syncs
 * with `navigator.onLine` and the browser's online/offline events. `false`
 * renders the offline banner and blocks the doomed submit.
 */
function useOnlineStatus(): boolean {
  const [online, setOnline] = React.useState(true);

  React.useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync(); // first mount: adopt the REAL status after hydration
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return online;
}

export function TalibLoginScreen() {
  const { t } = useI18n();
  const { signIn, signUp } = useAuth();

  // round 56 — first-time visitors start on CREATE ACCOUNT; returning
  // devices (remembered email) start on LOGIN. Read once at mount.
  const [mode, setMode] = React.useState<"signin" | "signup">(() =>
    firstVisitOnDevice() ? "signup" : "signin"
  );
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  // one-tap cross-switch hint, set from the API's own error wording
  const [switchHint, setSwitchHint] = React.useState<"toSignup" | "toSignin" | null>(null);

  // round 58 — owner: «حالة عدم الاتصال عند الدخول بلا إنترنت». The banner is
  // driven by this live status; the submit guard below reads the same value.
  const online = useOnlineStatus();

  // "Back online" toast — fires ONLY on a real offline→online transition,
  // never on mount (prev ref starts at the current value).
  const wasOnlineRef = React.useRef(true);
  React.useEffect(() => {
    if (wasOnlineRef.current && !online) wasOnlineRef.current = false;
    else if (!wasOnlineRef.current && online) {
      wasOnlineRef.current = true;
      toast.success(t("auth.backOnline"));
    }
  }, [online, t]);

  function switchMode(next: "signin" | "signup") {
    setMode(next);
    setSwitchHint(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      toast.error(t("auth.errorMissingFields"));
      return;
    }

    // round 58 — offline guard: the request can't reach the server, so skip
    // the pointless spinner and say exactly WHY instead of a generic error.
    // (onLine can also be true behind a dead captive portal — that case still
    // reaches the provider's catch and gets the network-error wording.)
    if (!online) {
      toast.error(t("auth.errorOffline"));
      return;
    }

    setLoading(true);
    setSwitchHint(null);
    try {
      const result =
        mode === "signin"
          ? await signIn(fullName, email)
          : await signUp(fullName, email);

      if (result.error) {
        toast.error(result.error);
        // round 56 — the server's wording tells us which OTHER flow fits
        // these exact credentials; surface a one-tap switch instead of
        // leaving the user to hunt for the toggle.
        if (mode === "signin" && /لا يوجد حساب/.test(result.error)) {
          setSwitchHint("toSignup");
        } else if (mode === "signup" && /مسجّل مسبقاً/.test(result.error)) {
          setSwitchHint("toSignin");
        }
      } else {
        // remember this device so the NEXT visit opens on «دخول» directly
        try {
          localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim().toLowerCase());
        } catch {
          // private mode — next visit will offer create-account again; harmless
        }
        toast.success(
          mode === "signin" ? t("auth.loginSuccess") : t("auth.signupSuccess")
        );
      }
    } finally {
      setLoading(false);
    }
  }

  const isSignup = mode === "signup";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-gradient-to-br from-background via-background to-muted/30">
      <div className="w-full max-w-md space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center space-y-3"
        >
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-primary/10 mb-2">
            <img src="/talib/icon.svg" alt="Talib" className="w-14 h-14" />
          </div>
          <h1 className="text-3xl font-black text-primary">
            {t("common.appName")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isSignup ? t("auth.signupSubtitle") : t("auth.loginSubtitle")}
          </p>
        </motion.div>

        {/* round 56 — the two options as two BIG buttons: create-account is
            listed FIRST (RTL right-most) and is the default on a first
            visit; the active one is primary, the other stays fully clickable
            at half a glance. */}
        <Card className="p-2 grid grid-cols-2 gap-2" role="tablist" aria-label={t("auth.login")}>
          <button
            type="button"
            role="tab"
            aria-selected={isSignup}
            onClick={() => switchMode("signup")}
            className={`flex items-center justify-center gap-2 py-3 px-2 rounded-xl text-sm font-bold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              isSignup
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            <UserPlus className="w-4 h-4 shrink-0" />
            {t("auth.signup")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isSignup}
            onClick={() => switchMode("signin")}
            className={`flex items-center justify-center gap-2 py-3 px-2 rounded-xl text-sm font-bold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              !isSignup
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            <LogIn className="w-4 h-4 shrink-0" />
            {t("auth.login")}
          </button>
        </Card>

        {/* round 58 — offline status banner (owner: «حالة عدم الاتصال عند
            الدخول بلا إنترنت"): visible the moment the connection drops,
            before any submit attempt. Amber = warning (not destructive — the
            typed data is safe and waiting); pulsing dot says "live status",
            WifiOff says what it IS, the second line says what to do. */}
        <AnimatePresence initial={false}>
          {!online && (
            <motion.div
              key="offline-banner"
              initial={{ opacity: 0, y: 8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -8, height: 0 }}
              transition={{ duration: 0.25 }}
              role="status"
              aria-live="polite"
              className="overflow-hidden"
            >
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 flex items-center gap-3">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                </span>
                <WifiOff className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
                    {t("auth.offlineTitle")}
                  </p>
                  <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80 mt-0.5 leading-relaxed">
                    {t("auth.offlineHint")}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="space-y-4"
        >
          <Card className="p-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-sm font-semibold">
                {t("auth.fullName")}
              </Label>
              <div className="relative">
                <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t("auth.fullNamePlaceholder")}
                  className="pr-10"
                  autoComplete="name"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold">
                {t("auth.email")}
              </Label>
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("auth.emailPlaceholder")}
                  className="pr-10"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            {/* round 56 — the serial-number note that used to sit here is
                DELETED per the owner's request. The one-tap switch hint
                replaces it with something actionable. */}
            {switchHint && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg bg-primary/5 border border-primary/25 px-3 py-2.5 text-xs flex items-center gap-2"
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0 text-primary" />
                <span className="flex-1 text-muted-foreground leading-relaxed">
                  {switchHint === "toSignup"
                    ? "يبدو أنك جديد هنا — أنشئ حسابك بنفس الاسم والبريد مباشرة:"
                    : "لديك حساب بهذا البريد بالفعل — سجّل الدخول به:"}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 text-xs"
                  onClick={() => switchMode(switchHint === "toSignup" ? "signup" : "signin")}
                >
                  {switchHint === "toSignup" ? t("auth.signupBtn") : t("auth.loginBtn")}
                </Button>
              </motion.div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 text-base font-bold"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin ml-2" />
                  {t("common.loading")}
                </>
              ) : (
                <>
                  {isSignup ? (
                    <UserPlus className="w-4 h-4 ml-2" />
                  ) : (
                    <LogIn className="w-4 h-4 ml-2" />
                  )}
                  {isSignup ? t("auth.signupBtn") : t("auth.loginBtn")}
                </>
              )}
            </Button>
          </Card>
        </motion.form>

        <div className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
          <GraduationCap className="w-3.5 h-3.5" />
          <span>طالب | Talib — رفيقك الأكاديمي</span>
        </div>
      </div>
    </div>
  );
}
