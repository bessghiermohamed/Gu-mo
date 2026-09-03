"use client";

/**
 * أدواتي — Tool 4: حاسبة المعدل (GPA what-if calculator).
 *
 * The question every student asks the week before finals:
 *   «إذا أخذت X في هذا المقياس، ماذا يصبح معدلي؟»
 * and its inverse: «كم أحتاج في الباقي للوصول إلى معدل Y؟»
 *
 * Design decisions:
 *  - Starts from the REAL module list of the student's specialty
 *    (/api/courses — name + coefficient), so the weight of each course
 *    is real, not guessed. Existing estimates from «حاسبة الطالب»
 *    (localStorage talib-grades) are imported by module name so the
 *    student continues from their own numbers, not from zero.
 *  - Fully offline after the first course fetch: all math is local.
 *  - The save action writes BACK to talib-grades (same row shape as
 *    the grades screen), so one source of truth keeps both views in
 *    sync — editing here updates حاسبة الطالب, not a shadow copy.
 *  - Same weighted-average rule as lib/grades.ts computeGpa: module
 *    score = (continuous + exam) / 2, weighted by coefficient. Empty
 *    modules are excluded from the current average and feed the
 *    "what do I still need" solver.
 */

import * as React from "react";
import {
  ChevronLeft,
  Calculator,
  Plus,
  RotateCcw,
  Save,
  Target,
  TrendingUp,
  Loader2,
  GraduationCap,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useI18n } from "@/components/talib/i18n-provider";
import { cn } from "@/lib/utils";
import { computeGpa, isActiveGradeRow } from "@/lib/grades";

interface Row {
  id: number;
  moduleName: string;
  coefficient: number;
  continuousScore: number | null; // null = empty (what-if), not 0
  examScore: number | null;
  isManual: boolean;
}

interface StoredGradeRow {
  id?: number;
  moduleName: string;
  continuousScore: number;
  examScore: number;
  coefficient: number;
  isOfficial?: boolean;
}

let rowSeq = 1;

function clampScore(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return Math.min(20, Math.max(0, n));
}

function clampCoef(v: string): number {
  const n = Number(v.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(10, Math.max(1, Math.round(n * 10) / 10));
}

export function GpaTool({ onBack }: { onBack: () => void }) {
  const { dir } = useI18n();
  const [rows, setRows] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [target, setTarget] = React.useState<string>("10");
  const [saved, setSaved] = React.useState(false);

  // Load: real courses ∪ imported estimates from حاسبة الطالب.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      let courseRows: Row[] = [];
      try {
        const res = await fetch("/api/courses", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          const courses: Array<{ id: number; name: string; coefficient: number; semester?: number }> =
            Array.isArray(data.courses) ? data.courses : [];
          courseRows = courses.map((c) => ({
            id: rowSeq++,
            moduleName: String(c.name ?? ""),
            coefficient: Number(c.coefficient) > 0 ? Number(c.coefficient) : 2,
            continuousScore: null,
            examScore: null,
            isManual: false,
          }));
        }
      } catch {
        // offline / error → manual rows still work
      }
      // import existing estimates by module name
      let imported = 0;
      try {
        const raw = localStorage.getItem("talib-grades");
        if (raw) {
          const stored: StoredGradeRow[] = JSON.parse(raw);
          if (Array.isArray(stored)) {
            for (const g of stored) {
              if (!g || typeof g.moduleName !== "string") continue;
              const match = courseRows.find((r) => r.moduleName.trim() === g.moduleName.trim());
              const cont = clampScore(String(g.continuousScore ?? ""));
              const exam = clampScore(String(g.examScore ?? ""));
              if (match) {
                if (cont != null || exam != null) {
                  match.continuousScore = cont;
                  match.examScore = exam;
                  match.coefficient = Number(g.coefficient) > 0 ? Math.min(10, Number(g.coefficient)) : match.coefficient;
                  imported++;
                }
              } else if (cont != null || exam != null || String(g.moduleName).trim() !== "") {
                courseRows.push({
                  id: rowSeq++,
                  moduleName: String(g.moduleName),
                  coefficient: Number(g.coefficient) > 0 ? Math.min(10, Number(g.coefficient)) : 2,
                  continuousScore: cont,
                  examScore: exam,
                  isManual: true,
                });
                imported++;
              }
            }
          }
        }
      } catch {
        // corrupted storage → ignore
      }
      if (!cancelled) {
        if (courseRows.length === 0) {
          // no courses (offline?) — give 3 manual rows to start
          courseRows = [1, 2, 3].map(() => ({
            id: rowSeq++,
            moduleName: "",
            coefficient: 2,
            continuousScore: null,
            examScore: null,
            isManual: true,
          }));
        }
        setRows(courseRows);
        setLoading(false);
        if (imported > 0) setSaved(true); // already in sync with حاسبة الطالب
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filled = rows.filter(
    (r) => r.continuousScore != null || r.examScore != null || r.moduleName.trim() !== ""
  );
  const gpa = computeGpa(
    rows.map((r) => ({
      moduleName: r.moduleName,
      continuousScore: r.continuousScore ?? 0,
      examScore: r.examScore ?? 0,
      coefficient: r.coefficient,
    }))
  );

  // --- target solver: what average is still needed on the EMPTY rows? ---
  const activeRows = rows.filter((r) => isActiveGradeRow({
    moduleName: r.moduleName,
    continuousScore: r.continuousScore ?? 0,
    examScore: r.examScore ?? 0,
    coefficient: r.coefficient,
  }));
  const scored = activeRows.filter((r) => r.continuousScore != null || r.examScore != null);
  const unscored = activeRows.filter((r) => r.continuousScore == null && r.examScore == null);
  const earnedPoints = scored.reduce(
    (acc, r) => acc + (((r.continuousScore ?? 0) + (r.examScore ?? 0)) / 2) * r.coefficient,
    0
  );
  const scoredCoef = scored.reduce((acc, r) => acc + r.coefficient, 0);
  const unscoredCoef = unscored.reduce((acc, r) => acc + r.coefficient, 0);
  const targetNum = clampScore(target);
  let solver: { needed: number; possible: boolean } | null = null;
  if (targetNum != null && unscoredCoef > 0) {
    const needed = (targetNum * (scoredCoef + unscoredCoef) - earnedPoints) / unscoredCoef;
    solver = { needed: Math.round(needed * 100) / 100, possible: needed >= 0 && needed <= 20 };
  }

  function updateRow(id: number, patch: Partial<Row>) {
    setSaved(false);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setSaved(false);
    setRows((prev) => [
      ...prev,
      { id: rowSeq++, moduleName: "", coefficient: 2, continuousScore: null, examScore: null, isManual: true },
    ]);
  }

  function removeRow(id: number) {
    setSaved(false);
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function saveToCalculator() {
    try {
      const payload: StoredGradeRow[] = filled.map((r, i) => ({
        id: i + 1,
        moduleName: r.moduleName.trim() || `مقياس ${i + 1}`,
        continuousScore: r.continuousScore ?? 0,
        examScore: r.examScore ?? 0,
        coefficient: r.coefficient,
        isOfficial: false,
      }));
      localStorage.setItem("talib-grades", JSON.stringify(payload));
      setSaved(true);
      toast.success("تم الحفظ — افتح «حاسبة الطالب» من الرئيسية لترى النتائج نفسها");
    } catch {
      toast.error("تعذّر الحفظ في هذا الجهاز");
    }
  }

  const passLine = 10;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="رجوع" className="shrink-0">
          <ChevronLeft className={cn("w-5 h-5", dir === "rtl" && "rotate-180")} />
        </Button>
        <div>
          <h2 className="text-lg font-black flex items-center gap-2">
            <Calculator className="w-5 h-5 text-primary" />
            حاسبة المعدل
          </h2>
          <p className="text-xs text-muted-foreground">
            جداولك الحقيقية من تخصصك — جرّب سيناريوهاتك قبل النتائج
          </p>
        </div>
      </div>

      {/* Live result */}
      <Card className="p-4 flex items-center gap-4">
        <div
          className={cn(
            "w-16 h-16 rounded-2xl flex flex-col items-center justify-center shrink-0 select-none",
            gpa == null
              ? "bg-muted text-muted-foreground"
              : gpa >= passLine
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : "bg-red-500/15 text-red-600 dark:text-red-400"
          )}
        >
          <span className="text-xl font-black leading-none">
            {gpa == null ? "—" : gpa.toFixed(2)}
          </span>
          <span className="text-[10px] opacity-70 mt-0.5">من 20</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">
            {gpa == null ? "أدخل نقاطك لترى المعدل" : gpa >= passLine ? "معدل ناجح — استمر" : "تحت المعدل — أدر الوضع"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            المعدل المرجّح بمعاملات مقاييس تخصصك ({scoredCoef} معامل مُدخل
            {unscoredCoef > 0 ? `، ${unscoredCoef} في الانتظار` : ""})
          </p>
        </div>
        {gpa != null && (
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            <TrendingUp className="w-3 h-3 ml-0.5" />
            {gpa >= passLine ? "ناجح" : "دون 10"}
          </Badge>
        )}
      </Card>

      {/* Target solver */}
      <Card className="p-4 space-y-3 border-primary/20 bg-primary/5">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-primary shrink-0" />
          <p className="text-sm font-bold">كم أحتاج في الباقي؟</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-muted-foreground shrink-0" htmlFor="gpa-target">
            أريد معدل
          </label>
          <input
            id="gpa-target"
            type="number"
            inputMode="decimal"
            min={0}
            max={20}
            step="0.25"
            value={target}
            onChange={(e) => {
              setSaved(false);
              setTarget(e.target.value);
            }}
            className="w-20 h-9 rounded-md border border-input bg-transparent px-2 py-1 text-sm text-center shadow-sm"
          />
          <span className="text-xs text-muted-foreground">/ 20</span>
        </div>
        {solver == null ? (
          <p className="text-xs text-muted-foreground flex items-start gap-1.5 leading-relaxed">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            املأ بعض المقاييس واترك الباقي فارغاً — سنعطيك النقاط المطلوبة في المتبقي.
          </p>
        ) : solver.possible ? (
          <p className="text-xs leading-relaxed">
            تحتاج معدل{" "}
            <strong className="text-primary font-black text-sm">{solver.needed.toFixed(2)}</strong>
            /20 في {unscored.length} مقياساً متبقياً
            {solver.needed >= passLine ? " — ممكن تماماً" : " — في المتناول"}
          </p>
        ) : (
          <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">
            {solver.needed > 20
              ? `يتطلب ${solver.needed.toFixed(2)}/20 في الباقي — فوق السقف (20)، راجع الهدف`
              : "الهدف تحقّق مسبقاً بما أدخلته"}
          </p>
        )}
      </Card>

      {/* Rows */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
          <p className="text-xs">جارٍ تحميل مقاييس تخصصك…</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* column header (visual only) */}
          <div className="flex items-center gap-2 px-3 text-[10px] text-muted-foreground">
            <span className="flex-1">المقياس</span>
            <span className="w-14 text-center">ن.م.م</span>
            <span className="w-14 text-center">امتحان</span>
            <span className="w-12 text-center">معامل</span>
            <span className="w-6" />
          </div>
          {rows.map((r) => {
            const moduleAvg =
              r.continuousScore != null || r.examScore != null
                ? ((r.continuousScore ?? 0) + (r.examScore ?? 0)) / 2
                : null;
            return (
              <Card key={r.id} className="p-2 flex items-center gap-2">
                <input
                  type="text"
                  value={r.moduleName}
                  readOnly={!r.isManual}
                  onChange={(e) => updateRow(r.id, { moduleName: e.target.value })}
                  placeholder="اسم المقياس"
                  aria-label="اسم المقياس"
                  className={cn(
                    "flex-1 min-w-0 h-9 bg-transparent text-sm font-medium rounded-md px-2 border border-transparent focus:border-input focus:shadow-sm outline-none",
                    !r.isManual && "cursor-default"
                  )}
                />
                <ScoreInput
                  value={r.continuousScore}
                  color={moduleAvg}
                  onChange={(v) => updateRow(r.id, { continuousScore: v })}
                  label="نقطة المراقبة المستمرة"
                />
                <ScoreInput
                  value={r.examScore}
                  color={moduleAvg}
                  onChange={(v) => updateRow(r.id, { examScore: v })}
                  label="نقطة الامتحان"
                />
                <input
                  type="number"
                  inputMode="decimal"
                  min={1}
                  max={10}
                  step="1"
                  value={r.coefficient}
                  onChange={(e) => updateRow(r.id, { coefficient: clampCoef(e.target.value) })}
                  aria-label="المعامل"
                  className="w-12 h-9 rounded-md border border-input bg-transparent px-1 py-1 text-sm text-center shadow-sm"
                />
                {r.isManual ? (
                  <button
                    type="button"
                    onClick={() => removeRow(r.id)}
                    aria-label="حذف المقياس"
                    className="w-6 h-9 shrink-0 flex items-center justify-center text-muted-foreground/50 hover:text-red-500 transition-colors"
                  >
                    ×
                  </button>
                ) : (
                  <span className="w-6 shrink-0 flex items-center justify-center" aria-hidden="true">
                    <GraduationCap className="w-3.5 h-3.5 text-muted-foreground/30" />
                  </span>
                )}
              </Card>
            );
          })}
          <Button variant="outline" className="w-full border-dashed" onClick={addRow}>
            <Plus className="w-4 h-4 ml-1" />
            إضافة مقياس يدوياً
          </Button>
        </div>
      )}

      {/* Save + reset */}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={saveToCalculator} disabled={filled.length === 0}>
          <Save className="w-4 h-4 ml-1" />
          {saved ? "محفوظ في حاسبة الطالب" : "حفظ في حاسبة الطالب"}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setRows((prev) =>
              prev.map((r) => ({ ...r, continuousScore: null, examScore: null }))
            );
            setSaved(false);
            toast.info("أُفرغت النقاط — المعاملات والأسماء باقية");
          }}
          aria-label="تفريغ النقاط"
        >
          <RotateCcw className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

/** Numeric score cell: empty means "not yet" (what-if), never zero. */
function ScoreInput({
  value,
  color,
  onChange,
  label,
}: {
  value: number | null;
  color: number | null;
  onChange: (v: number | null) => void;
  label: string;
}) {
  const [text, setText] = React.useState(value == null ? "" : String(value));
  const [focused, setFocused] = React.useState(false);
  // sync external resets (e.g. "تفريغ النقاط")
  React.useEffect(() => {
    if (!focused) setText(value == null ? "" : String(value));
  }, [value, focused]);
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      max={20}
      step="0.25"
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        onChange(clampScore(text));
        setText(text.trim() === "" ? "" : String(clampScore(text) ?? ""));
      }}
      onChange={(e) => setText(e.target.value)}
      aria-label={label}
      placeholder="—"
      className={cn(
        "w-14 h-9 rounded-md border border-input bg-transparent px-1 py-1 text-sm text-center shadow-sm focus:border-ring outline-none",
        color != null && !focused && (color >= 10 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")
      )}
    />
  );
}
