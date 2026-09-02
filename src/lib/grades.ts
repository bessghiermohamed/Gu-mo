/**
 * Shared grade-calculation helpers (R12: single GPA source of truth).
 *
 * The estimator GPA was computed in two places (grades screen + home hero)
 * with subtly different rules — the home hero even showed a hardcoded
 * "— / 20" while the calculator produced a real number. Both now call this.
 *
 * Rule (fix R12): only rows the student actually filled in (a name or any
 * score > 0) participate — untouched placeholder rows must not dilute the
 * average.
 */

export interface GpaRowLike {
  moduleName: string;
  continuousScore: number;
  examScore: number;
  coefficient: number;
}

export function isActiveGradeRow(row: GpaRowLike): boolean {
  return (
    (row.moduleName ?? "").trim() !== "" ||
    Number(row.continuousScore) > 0 ||
    Number(row.examScore) > 0
  );
}

/** Weighted average on the /20 scale, or null when nothing is filled in. */
export function computeGpa(rows: GpaRowLike[]): number | null {
  const active = rows.filter(isActiveGradeRow);
  const total = active.reduce(
    (acc, g) =>
      acc + ((Number(g.continuousScore) || 0) + (Number(g.examScore) || 0)) / 2 * (Number(g.coefficient) || 1),
    0
  );
  const totalCoef = active.reduce((acc, g) => acc + (Number(g.coefficient) || 1), 0);
  if (totalCoef <= 0) return null;
  return total / totalCoef;
}
