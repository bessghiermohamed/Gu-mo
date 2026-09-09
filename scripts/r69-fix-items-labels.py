#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""r69 fixup 2 — TgItemsManager: fetch the year names so the space filter
options AND the per-item space badges carry the year suffix («فوج 69 — السنة
الأولى 69»), exactly like the binding dialogs."""
import io

PATH = "src/components/talib/screens/admin-panel-screen.tsx"

src = io.open(PATH, encoding="utf-8").read()


def apply(old: str, new: str, count: int = 1) -> None:
    global src
    n = src.count(old)
    assert n == count, f"anchor x{n} (expected {count}): {old[:110]!r}"
    src = src.replace(old, new)


# 1) years state next to spaceCohorts
apply(
    """  // r69: فلتر المساحات — معاينة منشورات فوج بعينه كما يراها طلبته
  const [cohortFilter, setCohortFilter] = React.useState("");
  const [spaceCohorts, setSpaceCohorts] = React.useState<TgCohortRow[]>([]);""",
    """  // r69: فلتر المساحات — معاينة منشورات فوج بعينه كما يراها طلبته
  const [cohortFilter, setCohortFilter] = React.useState("");
  const [spaceCohorts, setSpaceCohorts] = React.useState<TgCohortRow[]>([]);
  const [spaceYears, setSpaceYears] = React.useState<Year[]>([]);""",
)

# 2) fetch years beside cohorts
apply(
    """    // r69: أفواج التخصص لفلتر المساحات
    fetch(`/api/cohort?specialtyId=${user?.assignedSpecialtyId ?? ""}`, { cache: "no-store" })
      .then((r) => r.json()).then((d) => setSpaceCohorts(d.cohorts ?? [])).catch(() => setSpaceCohorts([]));
  }, [user?.assignedSpecialtyId]);""",
    """    // r69: أفواج التخصص لفلتر المساحات + سنواتها لتمييز المتشاركة الاسم
    fetch(`/api/cohort?specialtyId=${user?.assignedSpecialtyId ?? ""}`, { cache: "no-store" })
      .then((r) => r.json()).then((d) => setSpaceCohorts(d.cohorts ?? [])).catch(() => setSpaceCohorts([]));
    fetch(`/api/onboarding/years?specialtyId=${user?.assignedSpecialtyId ?? ""}`, { cache: "no-store" })
      .then((r) => r.json()).then((d) => setSpaceYears(d.years ?? [])).catch(() => setSpaceYears([]));
  }, [user?.assignedSpecialtyId]);""",
)

# 3) shared label helper (year-aware)
apply(
    """  const hiddenCount = items.filter((i) => i.isHidden).length;
  // r69: خريطة معرّف الفوج → اسم مميِّز (لشارة المساحة على المنشور)
  const spaceLabelById = React.useMemo(() => {
    const map = new Map<number, string>();
    for (const c of spaceCohorts) map.set(c.id, cohortOptionLabel(c, spaceCohorts));
    return map;
  }, [spaceCohorts]);""",
    """  const hiddenCount = items.filter((i) => i.isHidden).length;
  // r69: تسمية مميِّزة للفوج مع سنته (كما في نافذة الربط تماماً)
  const spaceLabel = React.useCallback(
    (c: TgCohortRow) => cohortOptionLabel(
      c, spaceCohorts,
      (yid) => spaceYears.find((y) => String(y.id) === String(yid))?.yearName ?? ""
    ),
    [spaceCohorts, spaceYears]
  );
  // r69: خريطة معرّف الفوج → اسم مميِّز (لشارة المساحة على المنشور)
  const spaceLabelById = React.useMemo(() => {
    const map = new Map<number, string>();
    for (const c of spaceCohorts) map.set(c.id, spaceLabel(c));
    return map;
  }, [spaceCohorts, spaceLabel]);""",
)

# 4) filter options use the year-aware label
apply(
    """          {spaceCohorts.map((c) => (
            <option key={c.id} value={String(c.id)}>مساحة {cohortOptionLabel(c, spaceCohorts)}</option>
          ))}""",
    """          {spaceCohorts.map((c) => (
            <option key={c.id} value={String(c.id)}>مساحة {spaceLabel(c)}</option>
          ))}""",
)

io.open(PATH, "w", encoding="utf-8").write(src)
print("r69 fixup 2 (items manager labels) OK")
