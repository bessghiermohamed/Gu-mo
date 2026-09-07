"use client";

/**
 * أدواتي — Tool 7: مؤقّت المراجعة (بومودورو).
 *
 * Classic focus technique adapted for Algerian students: 25-minute focus
 * sessions separated by 5-minute breaks, a longer break after 4 sessions.
 * Durations are adjustable, and the timer keeps ticking accurately even
 * when the tab is backgrounded (timestamps, not naive setInterval
 * counting) — students switch tabs mid-session all the time.
 *
 * Fully offline: a WebAudio beep announces the end (no audio files), and
 * today's completed focus minutes persist in localStorage so the student
 * sees their real daily total.
 */

import * as React from "react";
import { ChevronLeft, Timer, Play, Pause, RotateCcw, Coffee, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { useI18n } from "@/components/talib/i18n-provider";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "talib-timer-minutes";

type Phase = "focus" | "break" | "long-break";

const PHASE_LABEL: Record<Phase, string> = {
  focus: "جلسة تركيز",
  break: "استراحة قصيرة",
  "long-break": "استراحة طويلة",
};

const DEFAULTS: Record<Phase, number> = {
  focus: 25,
  break: 5,
  "long-break": 15,
};

/** mm:ss — Latin digits are bidi-safe inside a dir="ltr" wrapper. */
function fmt(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Short double-beep via WebAudio — zero audio assets needed. */
function beep() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    for (const [offset, freq] of [
      [0, 830],
      [0.35, 830],
    ] as Array<[number, number]>) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + offset + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.32);
    }
    setTimeout(() => ctx.close(), 1200);
  } catch {
    // Audio blocked (rare) — the toast below is the fallback signal.
  }
}

export function StudyTimerTool({ onBack }: { onBack: () => void }) {
  const { dir } = useI18n();

  // Adjusted durations (minutes).
  const [focusMin, setFocusMin] = React.useState(DEFAULTS.focus);
  const [breakMin, setBreakMin] = React.useState(DEFAULTS.break);

  const [phase, setPhase] = React.useState<Phase>("focus");
  const [running, setRunning] = React.useState(false);
  // Seconds REMAINING in the current phase — derived from timestamps while running.
  const [remaining, setRemaining] = React.useState(DEFAULTS.focus * 60);
  // wall-clock reference: when the current phase started (ms).
  const endAtRef = React.useRef<number>(0);
  const [completedFocus, setCompletedFocus] = React.useState(0);
  const [todayMinutes, setTodayMinutes] = React.useState(0);

  // Load today's persisted focus total (keyed by date — a fresh day resets).
  React.useEffect(() => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { date: string; minutes: number };
        if (saved.date === today) setTodayMinutes(saved.minutes);
      }
    } catch {
      // corrupted storage — start fresh, no crash
    }
  }, []);

  function persistMinutes(delta: number) {
    setTodayMinutes((prev) => {
      const today = new Date().toISOString().slice(0, 10);
      const next = Math.max(0, prev + delta);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: today, minutes: next }));
      } catch {
        // storage full — in-session total still works
      }
      return next;
    });
  }

  const phaseMinutes: Record<Phase, number> = {
    focus: focusMin,
    break: breakMin,
    "long-break": breakMin * 3,
  };

  // The tick loop — timestamp-based so background throttling can't drift it.
  React.useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const left = Math.max(0, Math.round((endAtRef.current - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        // Phase finished — advance outside the interval callback state batch.
        clearInterval(id);
        advancePhase(true);
      }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, phase, focusMin, breakMin]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const advancePhase = React.useCallback(
    (natural: boolean) => {
      const wasFocus = phase === "focus";
      if (wasFocus) {
        if (natural) {
          persistMinutes(focusMin);
          setCompletedFocus((c) => c + 1);
        }
        // Every 4th focus session earns a long break.
        const next: Phase =
          natural && (completedFocus + 1) % 4 === 0 ? "long-break" : "break";
        setPhase(next);
        endAtRef.current = Date.now() + phaseMinutes[next] * 1000;
        setRemaining(phaseMinutes[next] * 60);
        if (natural) {
          beep();
          toast.success("انتهت جلسة التركيز — خذ استراحتك، تستحقها");
        }
      } else {
        setPhase("focus");
        endAtRef.current = Date.now() + focusMin * 1000;
        setRemaining(focusMin * 60);
        if (natural) {
          beep();
          toast.info("انتهت الاستراحة — عودة إلى التركيز");
        }
      }
    },
    [phase, focusMin, breakMin, completedFocus, phaseMinutes]
  );

  function toggle() {
    if (running) {
      // Pause: freeze the remaining seconds.
      setRunning(false);
      const left = Math.max(0, Math.round((endAtRef.current - Date.now()) / 1000));
      setRemaining(left);
    } else {
      endAtRef.current = Date.now() + remaining * 1000;
      setRunning(true);
    }
  }

  function reset() {
    setRunning(false);
    setPhase("focus");
    setRemaining(focusMin * 60);
  }

  function adjust(setter: (n: number) => void, current: number, delta: number, min: number, max: number) {
    const next = Math.min(max, Math.max(min, current + delta));
    setter(next);
    // If not running, mirror the change into the countdown for the focus phase.
    if (!running && phase === "focus" && current === focusMin) {
      setRemaining(next * 60);
    }
  }

  const total = phaseMinutes[phase] * 60;
  const progress = total > 0 ? ((total - remaining) / total) * 100 : 0;
  // SVG ring progress.
  const R = 54;
  const CIRC = 2 * Math.PI * R;
  const dash = (progress / 100) * CIRC;

  const phaseColor =
    phase === "focus" ? "text-primary" : "text-secondary";
  const ringColor = phase === "focus" ? "#1B5E4B" : "#C8956C";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="رجوع" className="shrink-0">
          <ChevronLeft className={cn("w-5 h-5", dir === "rtl" && "rotate-180")} />
        </Button>
        <div>
          <h2 className="text-lg font-black flex items-center gap-2">
            <Timer className="w-5 h-5 text-primary" />
            مؤقّت المراجعة
          </h2>
          <p className="text-xs text-muted-foreground">
            جلسات تركيز قصيرة واستراحات منتظمة — تقنية بومودورو
          </p>
        </div>
      </div>

      {/* Timer ring */}
      <Card className="p-6 flex flex-col items-center gap-4">
        <div className="relative w-[144px] h-[144px]">
          <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90">
            <circle cx="64" cy="64" r={R} fill="none" stroke="currentColor" className="text-border" strokeWidth="8" />
            <circle
              cx="64"
              cy="64"
              r={R}
              fill="none"
              stroke={ringColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${CIRC}`}
              style={{ transition: "stroke-dasharray 0.3s linear" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn("text-xs font-bold", phaseColor)}>{PHASE_LABEL[phase]}</span>
            <span className="text-4xl font-black tabular-nums mt-1" dir="ltr">
              {fmt(remaining)}
            </span>
            <span className="text-[10px] text-muted-foreground mt-1">
              {completedFocus} جلسة اليوم
            </span>
          </div>
        </div>

        <div className="flex gap-2 w-full">
          <Button className="flex-1 h-11" onClick={toggle}>
            {running ? (
              <>
                <Pause className="w-4 h-4 ml-2" />
                إيقاف مؤقت
              </>
            ) : (
              <>
                <Play className="w-4 h-4 ml-2" />
                {remaining === total ? "ابدأ التركيز" : "متابعة"}
              </>
            )}
          </Button>
          <Button variant="outline" onClick={reset} aria-label="إعادة ضبط">
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      </Card>

      {/* Durations */}
      <Card className="p-4 space-y-4">
        <p className="text-xs font-bold text-muted-foreground">مدة الجلسات (بالدقائق)</p>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              { label: "تركيز", icon: <Brain className="w-4 h-4" />, value: focusMin, setter: setFocusMin, min: 5, max: 60, delta: 5 },
              { label: "استراحة", icon: <Coffee className="w-4 h-4" />, value: breakMin, setter: setBreakMin, min: 1, max: 30, delta: 1 },
            ] as const
          ).map((row) => (
            <div key={row.label} className="rounded-xl border bg-background p-2 flex items-center justify-between gap-1">
              <span className="text-xs font-bold flex items-center gap-1.5 text-primary">
                {row.icon}
                {row.label}
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label={`تقليل ${row.label}`}
                  onClick={() => adjust(row.setter as (n: number) => void, row.value, -row.delta, row.min, row.max)}
                >
                  −
                </Button>
                <span className="w-8 text-center text-sm font-black tabular-nums" dir="ltr">
                  {row.value}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label={`زيادة ${row.label}`}
                  onClick={() => adjust(row.setter as (n: number) => void, row.value, row.delta, row.min, row.max)}
                >
                  +
                </Button>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          بعد كل ٤ جلسات تركيز تأتي استراحة طويلة تلقائياً (٣× مدة الاستراحة).
          المؤقّت يواصل العدّ بدقة حتى لو غيّرت التبويب أثناء الجلسة.
        </p>
      </Card>

      {/* Today total */}
      <Card className="p-4 flex items-center gap-3 bg-muted/30">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Brain className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">
            تركيزك اليوم: {todayMinutes} دقيقة
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {todayMinutes === 0
              ? "لم تبدأ بعد — ٢٥ دقيقة واحدة الآن خير من ساعة مؤجلة"
              : todayMinutes < 100
                ? "استمر — أيام الامتحانات تُبنى من هذه الدقائق"
                : "يوم ممتاز — لا تنسَ الراحة تقيك الاحتراق"}
          </p>
        </div>
      </Card>
    </div>
  );
}
