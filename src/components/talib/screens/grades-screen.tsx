"use client";

import * as React from "react";
import { Calculator, TrendingUp, Award, Target } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useI18n } from "@/components/talib/i18n-provider";

interface GradeRow {
  id: number;
  moduleName: string;
  continuousScore: number;
  examScore: number;
  coefficient: number;
  isOfficial: boolean;
}

export function TalibGradesScreen() {
  const { t } = useI18n();
  const [grades, setGrades] = React.useState<GradeRow[]>([
    { id: 1, moduleName: "", continuousScore: 0, examScore: 0, coefficient: 1, isOfficial: false },
  ]);

  const gpa = React.useMemo(() => {
    const total = grades.reduce(
      (acc, g) => acc + (g.continuousScore + g.examScore) / 2 * g.coefficient,
      0
    );
    const totalCoef = grades.reduce((acc, g) => acc + g.coefficient, 0);
    return totalCoef > 0 ? total / totalCoef : 0;
  }, [grades]);

  function updateGrade(id: number, field: keyof GradeRow, value: string | number | boolean) {
    setGrades((gs) =>
      gs.map((g) =>
        g.id === id
          ? { ...g, [field]: typeof value === "string" ? Number(value) || 0 : value }
          : g
      )
    );
  }

  function addRow() {
    setGrades((gs) => [
      ...gs,
      {
        id: Date.now(),
        moduleName: "",
        continuousScore: 0,
        examScore: 0,
        coefficient: 1,
        isOfficial: false,
      },
    ]);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black mb-1">{t("grades.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("grades.subtitle")}</p>
      </div>

      {/* GPA summary card */}
      <Card className="p-5 bg-primary/5 border-primary/20">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <span className="font-bold text-sm">{t("grades.gpa")}</span>
          </div>
          <Badge variant={gpa >= 10 ? "default" : "destructive"}>
            {gpa > 0 ? (gpa >= 10 ? "ناجح" : "غير ناجح") : "—"}
          </Badge>
        </div>
        <div className="flex items-end gap-2">
          <span className="text-4xl font-black text-primary">
            {gpa.toFixed(2)}
          </span>
          <span className="text-sm text-muted-foreground mb-1">/ 20</span>
        </div>
        <Progress value={(gpa / 20) * 100} className="mt-3" />
      </Card>

      {/* Grade rows */}
      <div className="space-y-3">
        {grades.map((g, i) => (
          <Card key={g.id} className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                مقياس #{i + 1}
              </span>
              <Badge variant="outline" className="text-[10px]">
                {g.isOfficial ? t("grades.isOfficial") : t("grades.isEstimated")}
              </Badge>
            </div>

            <Input
              placeholder="اسم المقياس"
              value={g.moduleName}
              onChange={(e) => updateGrade(g.id, "moduleName", e.target.value)}
            />

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">
                  {t("grades.continuousScore")}
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={20}
                  step={0.5}
                  value={g.continuousScore || ""}
                  onChange={(e) =>
                    updateGrade(g.id, "continuousScore", e.target.value)
                  }
                  className="text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">
                  {t("grades.examScore")}
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={20}
                  step={0.5}
                  value={g.examScore || ""}
                  onChange={(e) =>
                    updateGrade(g.id, "examScore", e.target.value)
                  }
                  className="text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">
                  {t("grades.coefficient")}
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={g.coefficient}
                  onChange={(e) =>
                    updateGrade(g.id, "coefficient", e.target.value)
                  }
                  className="text-sm"
                />
              </div>
            </div>

            {/* Per-row final score */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-xs text-muted-foreground">المعدل:</span>
              <span className="text-sm font-bold text-primary">
                {((g.continuousScore + g.examScore) / 2).toFixed(2)} / 20
              </span>
            </div>
          </Card>
        ))}
      </div>

      <button
        onClick={addRow}
        className="w-full py-3 rounded-xl border-2 border-dashed border-border hover:border-primary/50 text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
      >
        + إضافة مقياس آخر
      </button>
    </div>
  );
}
