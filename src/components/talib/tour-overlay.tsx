"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/talib/auth-provider";
import { useShell, type ScreenRoute } from "@/app/app/page";

/**
 * round 27 (review §15): first-run guidance tour.
 * round 51 (طلب المالك: «إعادة شرح تلك النقاط للمسجلين الجدد أمر ضروري في
 * مواضع مختلفة من المشروع، واجعلها عملية متماسكة»): the tour is rebuilt
 * as ONE COHERENT JOURNEY ACROSS THE APP'S KEY LOCATIONS instead of three
 * pointers on the home screen. Each step navigates to its screen, waits
 * for it to mount, then spotlights the relevant region:
 *
 *   1. الرئيسية  — services grid (everything is one tap away)
 *   2. الجدول    — official timetable + personal sessions
 *   3. المقررات  — modules, lectures, weekly progress
 *   4. الواجبات  — deadlines and done-marking
 *   5. أدواتي    — offline tools incl. the GPA calculator
 *   6. الرئيسية  — the header gear (settings)
 *   7. حسابي     — the profile tab in the bottom nav
 *
 * Rules (kept from the review + round 49):
 *  - shown ONCE per user (localStorage flag, per device — a tour is a
 *    UI concern, not academic data, so no DB table is warranted);
 *  - dismissible at every step («تخطّي»), never traps the user: if an
 *    anchor never mounts the step is skipped automatically;
 *  - replayable from الإعدادات (round 49) — removing the flag re-arms it;
 *  - only starts on the home screen AFTER onboarding is done.
 *
 * Spotlight mechanics: a rounded ring is positioned over the anchor and
 * dims the rest of the page via a huge box-shadow — no canvas, no lib.
 * The spotlight renders only when the MEASUREMENT belongs to the CURRENT
 * step — so during screen transitions the dim layer alone is shown, and
 * stale rectangles from the previous screen never flash (no sync
 * setState in effects: the measured state carries its step index).
 */

interface TourStep {
  anchorId: string;
  /** the screen this anchor lives on — the tour navigates there itself */
  route: ScreenRoute;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    anchorId: "talib-tour-services",
    route: "HOME",
    title: "كل خدماتك في مكان واحد",
    body: "المقررات والجدول والاختبارات والواجبات وملفاتك — كل شيء على بعد لمسة واحدة من الشاشة الرئيسية.",
  },
  {
    anchorId: "talib-tour-schedule",
    route: "SCHEDULE",
    title: "الجدول الذكي",
    body: "جدولك الرسمي كما أعلنه المشرفون، مع إمكانية إضافة حصصك الشخصية بوضوح تام بين الرسمي والشخصي.",
  },
  {
    anchorId: "talib-tour-courses",
    route: "COURSES",
    title: "مقرراتك ومحاضراتك",
    body: "كل مقررات تخصصك مرتبة: الوصف، الأساتذة، المحاضرات والوثائق، مع متابعة ما أنجزته أسبوعياً.",
  },
  {
    anchorId: "talib-tour-assignments",
    route: "ASSIGNMENTS",
    title: "الواجبات ومواعيدها",
    body: "تتبّع مواعيد التسليم، علّم ما أنجزته، وضف ملاحظاتك على كل واجب كي لا تضيع التفاصيل.",
  },
  {
    anchorId: "talib-tour-tools",
    route: "TOOLS",
    title: "أدوات تعمل داخل جهازك",
    body: "سبع أدوات دون إنترنت ودون رفع ملفات لأي خادم: PDF، ضغط، دمج، عدّاد كلمات — وحاسبة المعدل لحظية.",
  },
  {
    anchorId: "talib-tour-gear",
    route: "HOME",
    title: "الإعدادات",
    body: "اضبط تفضيلات الإشعارات والمظهر الليلي ونمط الألوان متى شئت من أيقونة الترس — ويمكنك إعادة هذه الجولة من هناك.",
  },
  {
    anchorId: "talib-tour-profile",
    route: "HOME",
    title: "حسابي",
    body: "معلوماتك الشخصية، سجلك الأكاديمي، الإبلاغ عن مشكلة، وتسجيل الخروج — كل ذلك من تبويب حسابي بالأسفل.",
  },
];

/** how long we wait for a screen to mount its anchor after navigating */
const ANCHOR_WAIT_MS = 3000;
const POLL_INTERVAL_MS = 100;

export function TalibTourOverlay({ currentScreen }: { currentScreen: ScreenRoute }) {
  const { user } = useAuth();
  const { navigate } = useShell();
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState(0);
  // a measurement is only valid for its own step index — the spotlight
  // renders only when measured.step === step (no stale-rect flashes and
  // no synchronous setState needed inside the effect below)
  const [measured, setMeasured] = React.useState<{ step: number; rect: DOMRect } | null>(null);
  const tipRef = React.useRef<HTMLDivElement>(null);
  const [tipH, setTipH] = React.useState(150);

  const storageKey = user ? `talib-tour-${user.id}` : null;

  // open once: logged-in user, on HOME, flag not set yet
  React.useEffect(() => {
    if (!user || !storageKey || currentScreen !== "HOME") return;
    try {
      if (localStorage.getItem(storageKey) === "done") return;
    } catch {
      return; // storage disabled — never nag, just skip the tour
    }
    // let the home screen finish mounting + entrance animations
    const timer = setTimeout(() => setOpen(true), 700);
    return () => clearTimeout(timer);
  }, [user, storageKey, currentScreen]);

  function finish() {
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, "done");
      } catch {
        // storage disabled — closing is enough for this session
      }
    }
    setOpen(false);
    setStep(0); // replay from الإعدادات must start the journey anew
    setMeasured(null);
  }

  // journey driver: if the current screen is not the step's screen,
  // navigate there; otherwise poll for the anchor element (screens fade
  // in over ~200ms + entrance animations), let things settle, then
  // measure. If the anchor never appears, skip forward automatically —
  // the tour must never trap the user. All setState calls below happen
  // inside timers/callbacks, never synchronously in the effect body.
  React.useEffect(() => {
    if (!open) return;
    const target = STEPS[step];
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | null = null;
    let settle: ReturnType<typeof setTimeout> | null = null;

    const startWait = () => {
      const deadline = Date.now() + ANCHOR_WAIT_MS;
      poll = setInterval(() => {
        if (cancelled) return;
        const el = document.getElementById(target.anchorId);
        if (el && el.getBoundingClientRect().height > 0) {
          if (poll) clearInterval(poll);
          poll = null;
          // let entrance animations settle before measuring
          settle = setTimeout(() => {
            if (cancelled) return;
            const fresh = document.getElementById(target.anchorId);
            if (fresh) setMeasured({ step, rect: fresh.getBoundingClientRect() });
          }, 400);
          return;
        }
        if (Date.now() > deadline) {
          // anchor never mounted (error/empty state variant) — skip the
          // step instead of blocking, but never loop forever
          if (poll) clearInterval(poll);
          poll = null;
          if (step < STEPS.length - 1) setStep((s) => s + 1);
          else finish();
        }
      }, POLL_INTERVAL_MS);
    };

    if (currentScreen !== target.route) {
      // navigating triggers a currentScreen change which re-runs this
      // effect, landing in the startWait branch
      navigate(target.route);
    } else {
      startWait();
    }

    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      if (settle) clearTimeout(settle);
    };
  }, [open, step, currentScreen, navigate]);

  // re-measure on viewport changes while a step is displayed
  React.useEffect(() => {
    if (!open || measured?.step !== step) return;
    const update = () => {
      const el = document.getElementById(STEPS[step].anchorId);
      if (el) setMeasured({ step, rect: el.getBoundingClientRect() });
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, step, measured]);

  // measure the tooltip so "above placement" is exact
  React.useLayoutEffect(() => {
    if (tipRef.current) setTipH(tipRef.current.offsetHeight);
  }, [step, open, measured]);

  if (!open) return null;

  const rect = measured?.step === step ? measured.rect : null;

  const vw = typeof window !== "undefined" ? window.innerWidth : 390;
  const vh = typeof window !== "undefined" ? window.innerHeight : 844;

  const w = Math.min(320, vw - 24);
  let top = 0;
  let left = 12;
  if (rect) {
    const cx = rect.left + rect.width / 2;
    left = Math.min(Math.max(cx - w / 2, 12), Math.max(12, vw - 12 - w));
    // place the tooltip on the side with more room
    const placeAbove = rect.top + rect.height / 2 > vh / 2;
    top = placeAbove
      ? Math.max(12, rect.top - 12 - tipH)
      : Math.min(vh - 12 - tipH, rect.bottom + 12);
  }

  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[70]"
      role="dialog"
      aria-modal="true"
      aria-label="جولة تعريفية بالتطبيق"
    >
      {/* click blocker — the tour is dismissed only via its own buttons */}
      <div className="absolute inset-0" onClick={(e) => e.preventDefault()} />

      {rect && (
        <>
          {/* spotlight ring (huge box-shadow dims everything outside it) */}
          <div
            className="absolute rounded-2xl border-2 border-primary pointer-events-none transition-all duration-300"
            style={{
              top: Math.max(2, rect.top - 6),
              left: Math.max(2, rect.left - 6),
              width: rect.width + 12,
              height: rect.height + 12,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.65)",
            }}
          />

          {/* tooltip card */}
          <div
            ref={tipRef}
            className="fixed rounded-2xl border bg-card p-4 shadow-xl transition-all duration-300"
            style={{ top, left, width: w }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <h3 className="font-black text-sm">{STEPS[step].title}</h3>
              <span className="ms-auto text-[10px] font-bold text-muted-foreground tabular-nums shrink-0">
                {step + 1} / {STEPS.length}
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed min-h-8">
              {STEPS[step].body}
            </p>
            <div className="flex items-center justify-between mt-3 gap-2">
              {/* step dots */}
              <div className="flex items-center gap-1.5" aria-hidden="true">
                {STEPS.map((_, i) => (
                  <span
                    key={i}
                    className={
                      i === step
                        ? "w-4 h-1.5 rounded-full bg-primary"
                        : "w-1.5 h-1.5 rounded-full bg-muted-foreground/30"
                    }
                  />
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 text-muted-foreground"
                  onClick={finish}
                >
                  تخطّي
                </Button>
                {!isFirst && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={() => setStep((s) => Math.max(0, s - 1))}
                  >
                    السابق
                  </Button>
                )}
                <Button
                  size="sm"
                  className="h-9"
                  onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
                >
                  {isLast ? "يلا نبدأ" : "التالي"}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
