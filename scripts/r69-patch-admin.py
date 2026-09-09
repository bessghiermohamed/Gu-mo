#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""r69 patch 5 — admin panel: disambiguated cohort labels in the Telegram
binding dialogs (+ promote dialog), cohort filter & cohort badges in the
posts manager so the owner can finally SEE each cohort space's content."""
import io

PATH = "src/components/talib/screens/admin-panel-screen.tsx"

src = io.open(PATH, encoding="utf-8").read()


def apply(old: str, new: str, count: int = 1) -> None:
    global src
    n = src.count(old)
    assert n == count, f"anchor x{n} (expected {count}): {old[:110]!r}"
    src = src.replace(old, new)


# ===========================================================================
# A) TgCohortRow gains subGroup (the /api/cohort payload already sends it)
# ===========================================================================
apply(
    "interface TgCohortRow { id: number; groupName: string; academicYearId: number }",
    "interface TgCohortRow { id: number; groupName: string; subGroup?: string; academicYearId: number }",
)

# ===========================================================================
# B) TgItemsManager row + state: cohortId on items, cohorts for the filter
# ===========================================================================
apply(
    """interface TgItemAdminRow {
  id: number;
  titleAr: string;
  kind: string;
  itemType: string;
  moduleId: number | null;
  moduleName: string | null;""",
    """interface TgItemAdminRow {
  id: number;
  titleAr: string;
  kind: string;
  itemType: string;
  // r69: مساحة الفوج التي ينتمي إليها المنشور (null = مكتبة عامة)
  cohortId: number | null;
  moduleId: number | null;
  moduleName: string | null;""",
)

apply(
    """function TgItemsManager() {
  const [items, setItems] = React.useState<TgItemAdminRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState("");
  const [sourceId, setSourceId] = React.useState("");
  const [itemType, setItemType] = React.useState("");
  const [sources, setSources] = React.useState<TgSourceRow[]>([]);
  const [courses, setCourses] = React.useState<TgCourseRow[]>([]);""",
    """function TgItemsManager() {
  const [items, setItems] = React.useState<TgItemAdminRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState("");
  const [sourceId, setSourceId] = React.useState("");
  const [itemType, setItemType] = React.useState("");
  const [sources, setSources] = React.useState<TgSourceRow[]>([]);
  const [courses, setCourses] = React.useState<TgCourseRow[]>([]);
  // r69: فلتر المساحات — معاينة منشورات فوج بعينه كما يراها طلبته
  const [cohortFilter, setCohortFilter] = React.useState("");
  const [spaceCohorts, setSpaceCohorts] = React.useState<TgCohortRow[]>([]);""",
)

apply(
    """function TgItemsManager() {
  const [items, setItems] = React.useState<TgItemAdminRow[]>([]);""",
    """function TgItemsManager() {
  const { user } = useAuth();
  const [items, setItems] = React.useState<TgItemAdminRow[]>([]);""",
)

apply(
    """  React.useEffect(() => {
    fetch("/api/telegram/sources", { cache: "no-store" }).then((r) => r.json()).then((d) => setSources(d.sources ?? [])).catch(() => setSources([]));
    fetch("/api/courses", { cache: "no-store" }).then((r) => r.json()).then((d) => setCourses(d.courses ?? [])).catch(() => setCourses([]));
  }, []);

  const fetchItems = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ mode: "admin" });
      params.set("limit", "500"); // r68: أوسع نافذة للتنقيح الجماعي
      if (q.trim()) params.set("q", q.trim());
      if (sourceId) params.set("sourceId", sourceId);
      if (itemType) params.set("itemType", itemType);""",
    """  React.useEffect(() => {
    fetch("/api/telegram/sources", { cache: "no-store" }).then((r) => r.json()).then((d) => setSources(d.sources ?? [])).catch(() => setSources([]));
    fetch("/api/courses", { cache: "no-store" }).then((r) => r.json()).then((d) => setCourses(d.courses ?? [])).catch(() => setCourses([]));
    // r69: أفواج التخصص لفلتر المساحات
    fetch(`/api/cohort?specialtyId=${user?.assignedSpecialtyId ?? ""}`, { cache: "no-store" })
      .then((r) => r.json()).then((d) => setSpaceCohorts(d.cohorts ?? [])).catch(() => setSpaceCohorts([]));
  }, [user?.assignedSpecialtyId]);

  const fetchItems = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ mode: "admin" });
      params.set("limit", "500"); // r68: أوسع نافذة للتنقيح الجماعي
      if (q.trim()) params.set("q", q.trim());
      if (sourceId) params.set("sourceId", sourceId);
      if (itemType) params.set("itemType", itemType);
      // r69: مساحة محددة («none» = المكتبة بلا مساحة) أو الكل
      if (cohortFilter) params.set("cohortId", cohortFilter);""",
)

apply(
    """  }, [q, sourceId, itemType]);
  React.useEffect(() => { fetchItems(); }, [fetchItems]);

  // r68: تغيير الفلاتر يبدأ تحديداً نظيفاً
  React.useEffect(() => { setSelectedIds(new Set()); }, [q, sourceId, itemType]);""",
    """  }, [q, sourceId, itemType, cohortFilter]);
  React.useEffect(() => { fetchItems(); }, [fetchItems]);

  // r68: تغيير الفلاتر يبدأ تحديداً نظيفاً
  React.useEffect(() => { setSelectedIds(new Set()); }, [q, sourceId, itemType, cohortFilter]);""",
)

# -------------------------------------------------------------------------
# B2) the filter select itself — appended after the itemType select
# -------------------------------------------------------------------------
apply(
    """        <select value={itemType} onChange={(e) => setItemType(e.target.value)} className={`${selectCls} w-36`}>
          <option value="">كل الأنواع</option>
          {TG_TYPES_ADMIN.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>""",
    """        <select value={itemType} onChange={(e) => setItemType(e.target.value)} className={`${selectCls} w-36`}>
          <option value="">كل الأنواع</option>
          {TG_TYPES_ADMIN.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        {/* r69: تصفية حسب مساحة الفوج — معاينة ما يراه طلبة كل فوج */}
        <select value={cohortFilter} onChange={(e) => setCohortFilter(e.target.value)} className={`${selectCls} w-48`}>
          <option value="">كل المساحات + المكتبة</option>
          <option value="none">بلا مساحة (المكتبة)</option>
          {spaceCohorts.map((c) => (
            <option key={c.id} value={String(c.id)}>مساحة {cohortOptionLabel(c, spaceCohorts)}</option>
          ))}
        </select>
      </div>""",
)

# ===========================================================================
# C) shared label helper — module scope, used by both managers
# ===========================================================================
anchor = "const TG_TYPES_ADMIN = ["
helper = """/** r69: تسمية فوج مميِّزة — «فوج 7 — السنة الثانية». وُجد فعلاً فوجان
 * بالاسم نفسه «فوج 7» في سنتين مختلفتين فربُطت قناة بالفوج الخطأ. الاسم
 * وحده لا يكفي أبداً في القوائم. */
function cohortOptionLabel(c: { id: number; groupName: string; subGroup?: string; academicYearId?: number }, list: Array<{ id: number; groupName: string; academicYearId?: number }>, yearNameFor?: (yearId: number | undefined) => string): string {
  const base = [c.groupName.trim(), (c.subGroup ?? "").trim()].filter(Boolean).join(" ");
  const yearName = c.academicYearId != null ? (yearNameFor?.(c.academicYearId) ?? "") : "";
  const label = yearName ? `${base} — ${yearName}` : base;
  const dup = list.filter(
    (x) => x.groupName === c.groupName && String(x.academicYearId ?? "") === String(c.academicYearId ?? "")
  ).length > 1;
  return dup ? `${label} · رقم ${c.id}` : label;
}

"""
apply(anchor, helper + anchor)

# ===========================================================================
# D) TgSourcesManager — labels in the three cohort selects
# ===========================================================================
apply(
    """  const yearCourses = courses.filter((c) => !yearId || String(c.academicYearId) === yearId);

  // r66: هل الحقل الحالي رابط قسم داخل قناة؟ (يغيّر التلميحات والأسماء)""",
    """  const yearCourses = courses.filter((c) => !yearId || String(c.academicYearId) === yearId);

  // r69: تسمية مميِّزة لأفواج نافذة الربط — السنة تُقرأ من قائمة السنوات المحمّلة
  const cohortLabel = React.useCallback(
    (c: TgCohortRow) => cohortOptionLabel(c, cohorts, (yid) => years.find((y) => String(y.id) === String(yid))?.yearName ?? ""),
    [cohorts, years]
  );

  // r66: هل الحقل الحالي رابط قسم داخل قناة؟ (يغيّر التلميحات والأسماء)""",
)

# link dialog: channel → cohort space select
apply(
    """                      <option value="">— بدون —</option>
                      {cohorts.map((c) => <option key={c.id} value={c.id}>{c.groupName}</option>)}
                    </select>
                    {cohortId && (
                      <p className="text-xs text-muted-foreground">كل ما يُنشر في القناة يظهر في مساحة هذا الفوج تلقائياً.</p>
                    )}""",
    """                      <option value="">— بدون —</option>
                      {cohorts.map((c) => <option key={c.id} value={c.id}>{cohortLabel(c)}</option>)}
                    </select>
                    {cohortId && (
                      <p className="text-xs text-muted-foreground">
                        كل ما يُنشر في القناة يظهر في مساحة هذا الفوج تلقائياً — يتأكد الاسم والسنة أعلاه أنك اخترت الفوج المقصود (الأفواج قد تتشارك الاسم).
                      </p>
                    )}""",
)

# link dialog: group → cohort select
apply(
    """                    <option value="">— اختر الفوج —</option>
                    {cohorts.map((c) => <option key={c.id} value={c.id}>{c.groupName}</option>)}""",
    """                    <option value="">— اختر الفوج —</option>
                    {cohorts.map((c) => <option key={c.id} value={c.id}>{cohortLabel(c)}</option>)}""",
)

# edit dialog: cohort select
apply(
    """                  {editSource.cohortId != null && !cohorts.some((c) => String(c.id) === String(editSource.cohortId)) && (
                    <option value={String(editSource.cohortId)}>{editSource.cohortName ?? `فوج #${editSource.cohortId}`}</option>
                  )}
                  {cohorts.map((c) => <option key={c.id} value={c.id}>{c.groupName}</option>)}""",
    """                  {editSource.cohortId != null && !cohorts.some((c) => String(c.id) === String(editSource.cohortId)) && (
                    <option value={String(editSource.cohortId)}>{editSource.cohortName ?? `فوج #${editSource.cohortId}`}</option>
                  )}
                  {cohorts.map((c) => <option key={c.id} value={c.id}>{cohortLabel(c)}</option>)}""",
)

# ===========================================================================
# E) items manager rows: cohort badge (which space the post lives in)
# ===========================================================================
apply(
    """  const hiddenCount = items.filter((i) => i.isHidden).length;""",
    """  const hiddenCount = items.filter((i) => i.isHidden).length;
  // r69: خريطة معرّف الفوج → اسم مميِّز (لشارة المساحة على المنشور)
  const spaceLabelById = React.useMemo(() => {
    const map = new Map<number, string>();
    for (const c of spaceCohorts) map.set(c.id, cohortOptionLabel(c, spaceCohorts));
    return map;
  }, [spaceCohorts]);""",
)

apply(
    """                    {i.origin === "manual" && <Badge variant="outline" className="text-xs border-teal-500/50 text-teal-700">يدوي</Badge>}""",
    """                    {i.origin === "manual" && <Badge variant="outline" className="text-xs border-teal-500/50 text-teal-700">يدوي</Badge>}
                    {i.cohortId != null && (
                      <Badge variant="outline" className="text-xs border-violet-500/50 text-violet-700">
                        مساحة {spaceLabelById.get(i.cohortId) ?? `فوج #${i.cohortId}`}
                      </Badge>
                    )}""",
)

# ===========================================================================
# F) PromoteDialog — same ambiguity when scoping a representative
# ===========================================================================
apply(
    """  const [cohorts, setCohorts] = React.useState<Array<{ id: number; groupName: string }>>([]);
  const [scopeCohortId, setScopeCohortId] = React.useState(user.scopeCohortGroupId?.toString() ?? "");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    fetch(`/api/cohort?specialtyId=${user.assignedSpecialtyId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setCohorts(data.cohorts ?? []))
      .catch(() => setCohorts([]));
  }, [user.assignedSpecialtyId]);""",
    """  const [cohorts, setCohorts] = React.useState<Array<{ id: number; groupName: string; subGroup?: string; academicYearId?: number }>>([]);
  const [years, setYears] = React.useState<Year[]>([]);
  const [scopeCohortId, setScopeCohortId] = React.useState(user.scopeCohortGroupId?.toString() ?? "");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    fetch(`/api/cohort?specialtyId=${user.assignedSpecialtyId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setCohorts(data.cohorts ?? []))
      .catch(() => setCohorts([]));
    // r69: أسماء السنوات لتمييز الأفواج المتشاركة الاسم
    fetch(`/api/onboarding/years?specialtyId=${user.assignedSpecialtyId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setYears(data.years ?? []))
      .catch(() => setYears([]));
  }, [user.assignedSpecialtyId]);""",
)

apply(
    """                <select value={scopeCohortId} onChange={(e) => setScopeCohortId(e.target.value)} className={selectCls}>
                  <option value="">— بدون فوج محدد —</option>
                  {cohorts.map((c) => <option key={c.id} value={c.id}>{c.groupName} (ID: {c.id})</option>)}
                </select>""",
    """                <select value={scopeCohortId} onChange={(e) => setScopeCohortId(e.target.value)} className={selectCls}>
                  <option value="">— بدون فوج محدد —</option>
                  {cohorts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {cohortOptionLabel(c, cohorts, (yid) => years.find((y) => String(y.id) === String(yid))?.yearName ?? "")}
                    </option>
                  ))}
                </select>""",
)

io.open(PATH, "w", encoding="utf-8").write(src)
print("r69 patch 5 (admin panel) OK")
