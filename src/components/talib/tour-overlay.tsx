"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/talib/auth-provider";
import type { ScreenRoute } from "@/app/page";

/**
 * round 27 (review §15): first-run guidance tour.
 *
 * Three lightweight steps that introduce the app's three key surfaces:
 *   1. الخدمات الأكاديمية grid (everything is one tap away)
 *   2. the header gear (settings: notifications + appearance)
 *   3. the حسابي tab (profile, report an issue, sign out)
 *
 * Rules from the review:
 *  - shown ONCE per user (localStorage flag, per device — a tour is a
 *    UI concern, not academic data, so no DB table is warranted);
 *  - dismissible at every step («تخطّي»), never blocks content;
 *  - only starts on the home screen AFTER onboarding is done (the
 *    component simply does not open while currentScreen !== "HOME",
 *    which also keeps it away from fresh signups mid-setup).
 *
 * Spotlight mechanics: a rounded ring is positioned over the anchor and
 * dims the rest of the page via a huge box-shadow — no canvas, no lib.
 */

interface TourStep {
  anchorId: string;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    anchorId: "talib-tour-services",
    title: "كل خدماتك في مكان واحد",
    body: "المقررات والجدول والاختبارات وإعلانات الفوج — كل شيء على بعد لمسة واحدة من الشاشة الرئيسية.",
  },
  {
    anchorId: "talib-tour-gear",
    title: "الإعدادات",
    body: "اضبط تفضيلات الإشعارات والمظهر الليلي ونمط الألوان متى شئت من أيقونة الترس.",
  },
  {
    anchorId: "talib-tour-profile",
    title: "حسابي",
    body: "معلوماتك الشخصية، الإبلاغ عن مشكلة، وتسجيل الخروج — كل ذلك من تبويب حسابي بالأسفل.",
  },
];

export function TalibTourOverlay({ currentScreen }: { currentScreen: ScreenRoute }) {
  const { user } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const [rect, setRect] = React.useState<DOMRect | null>(null);
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
  }

  // track the anchor rect for the current step
  React.useEffect(() => {
    if (!open) return;
    const update = () => {
      const el = document.getElementById(STEPS[step].anchorId);
      if (el) setRect(el.getBoundingClientRect());
    };
    update();
    // re-measure once entrance animations have settled
    const t = setTimeout(update, 400);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, step]);

  // measure the tooltip so "above placement" is exact
  React.useLayoutEffect(() => {
    if (tipRef.current) setTipH(tipRef.current.offsetHeight);
  }, [step, open]);

  if (!open || !rect) return null;

  const vw = typeof window !== "undefined" ? window.innerWidth : 390;
  const vh = typeof window !== "undefined" ? window.innerHeight : 844;
  const w = Math.min(320, vw - 24);
  const cx = rect.left + rect.width / 2;
  const left = Math.min(Math.max(cx - w / 2, 12), Math.max(12, vw - 12 - w));
  // place the tooltip on the side with more room
  const placeAbove = rect.top + rect.height / 2 > vh / 2;
  const top = placeAbove
    ? Math.max(12, rect.top - 12 - tipH)
    : Math.min(vh - 12 - tipH, rect.bottom + 12);

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
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed min-h-8">
          {STEPS[step].body}
        </p>
        <div className="flex items-center justify-between mt-3">
          {/* step dots */}
          <div className="flex items-center gap-1.5">
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
            <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={finish}>
              تخطّي
            </Button>
            <Button size="sm" className="h-8" onClick={() => (isLast ? finish() : setStep((s) => s + 1))}>
              {isLast ? "يلا نبدأ" : "التالي"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
