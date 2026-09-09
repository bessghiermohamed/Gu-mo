#!/usr/bin/env python3
# r68 — patch src/components/talib/screens/admin-panel-screen.tsx
# A) TgSourceRow: trackId/trackName/specialtyName/linkCount fields
# B) TgSourcesManager: specialty (OWNER) + track selects, cascade follows the choice
# C) handleCreate: sends specialtyId/trackId + variation toast + reset
# D) add-dialog JSX inserts
# E) sources list badges (track/specialty/link count)
# F) edit dialog: track select + PATCH body
# G) TgItemsManager: multi-select + bulk delete + limit 500

import io, sys

PATH = "src/components/talib/screens/admin-panel-screen.tsx"
src = io.open(PATH, encoding="utf-8").read()
orig_len = len(src)
applied = 0


def patch(anchor, replacement, count=1):
    global src, applied
    n = src.count(anchor)
    if n != count:
        print(f"FAIL: anchor {n}x (expected {count}). Head:\n{anchor[:90]!r}")
        sys.exit(1)
    src = src.replace(anchor, replacement)
    applied += 1


# ---------------------------------------------------------------- A) row type
patch(
    "  itemCount: number;\n  topicCount?: number;\n  isSection?: boolean;\n}",
    """  itemCount: number;
  topicCount?: number;
  isSection?: boolean;
  // r68: الربط متعدد القواعد
  specialtyId?: number;
  trackId?: number | null;
  specialtyName?: string | null;
  trackName?: string | null;
  linkCount?: number;
}""",
)

# ---------------------------------------------------------------- B) states + dialog specialty
patch(
    "  // cascade data\n  const [years, setYears] = React.useState<Year[]>([]);\n  const [courses, setCourses] = React.useState<TgCourseRow[]>([]);\n  const [cohorts, setCohorts] = React.useState<TgCohortRow[]>([]);",
    """  // cascade data
  const [years, setYears] = React.useState<Year[]>([]);
  const [courses, setCourses] = React.useState<TgCourseRow[]>([]);
  const [cohorts, setCohorts] = React.useState<TgCohortRow[]>([]);
  // r68: الربط متعدد القواعد — التخصص (المالك فقط) والملمح لكل ربط
  const [specialtyChoice, setSpecialtyChoice] = React.useState("");
  const [trackChoice, setTrackChoice] = React.useState("");
  const [specialties, setSpecialties] = React.useState<Array<{ id: number; nameAr: string }>>([]);
  const [tracks, setTracks] = React.useState<Array<{ id: number; trackNameAr: string }>>([]);
  // التخصص المستهدف في نافذة الربط — المختار أو تخصص الرابط نفسه
  const dialogSpecialtyId = specialtyChoice || String(user?.assignedSpecialtyId ?? 1);
  const isOwnerLinker = user?.role === "OWNER";

  React.useEffect(() => {
    if (!isOwnerLinker) return;
    fetch("/api/specialties", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setSpecialties(
        (data.specialties ?? []).map((sp: { id: number; nameAr: string }) => ({ id: Number(sp.id), nameAr: String(sp.nameAr ?? "") }))
      ))
      .catch(() => setSpecialties([]));
  }, [isOwnerLinker]);""",
)

# B) years/courses effect → follows the chosen specialty (+ tracks)
patch(
    'fetch(`/api/onboarding/years?specialtyId=${user?.assignedSpecialtyId ?? 1}`)\n      .then((r) => r.json()).then((data) => setYears(data.years ?? [])).catch(() => setYears([]));\n    fetch("/api/courses", { cache: "no-store" })\n      .then((r) => r.json()).then((data) => setCourses(data.courses ?? [])).catch(() => setCourses([]));\n  }, [user]);\n\n  React.useEffect(() => {\n    // r67',
    'fetch(`/api/onboarding/years?specialtyId=${dialogSpecialtyId}`)\n      .then((r) => r.json()).then((data) => setYears(data.years ?? [])).catch(() => setYears([]));\n    // r68: مقاييس التخصص المختار — المالك قد يربط القناة لتخصص آخر\n    const coursesUrl = isOwnerLinker && specialtyChoice\n      ? `/api/courses?specialtyId=${specialtyChoice}`\n      : "/api/courses";\n    fetch(coursesUrl, { cache: "no-store" })\n      .then((r) => r.json()).then((data) => setCourses(data.courses ?? [])).catch(() => setCourses([]));\n    // r68: ملامح التخصص المستهدف — الربط متعدد القواعد\n    fetch(`/api/onboarding/tracks?specialtyId=${dialogSpecialtyId}`)\n      .then((r) => r.json()).then((data) => setTracks(data.tracks ?? [])).catch(() => setTracks([]));\n    // تغيير التخصص يصفّر الممح (خيارات الملامح تتبع التخصص)\n    setTrackChoice("");\n  }, [dialogSpecialtyId, user?.role]);\n\n  React.useEffect(() => {\n    // r67',
)

# B) cohorts effect → follows the chosen specialty
patch(
    'fetch(`/api/cohort?specialtyId=${user?.assignedSpecialtyId ?? 1}${yearId ? `&academicYearId=${yearId}` : ""}`)\n      .then((r) => r.json()).then((data) => setCohorts(data.cohorts ?? [])).catch(() => setCohorts([]));\n  }, [yearId, user]);',
    'fetch(`/api/cohort?specialtyId=${dialogSpecialtyId}${yearId ? `&academicYearId=${yearId}` : ""}`)\n      .then((r) => r.json()).then((data) => setCohorts(data.cohorts ?? [])).catch(() => setCohorts([]));\n  }, [yearId, dialogSpecialtyId]);',
)

# ---------------------------------------------------------------- C) POST body
patch(
    'handle: handle.trim(), title: title.trim(), sourceType,\n          ...(yearId ? { yearId: parseInt(yearId) } : {}),\n          ...(semester ? { semester: parseInt(semester) } : {}),\n          ...(sourceType === "channel" && moduleId ? { moduleId: parseInt(moduleId) } : {}),\n          ...(cohortId ? { cohortId: parseInt(cohortId) } : {}),',
    'handle: handle.trim(), title: title.trim(), sourceType,\n          ...(yearId ? { yearId: parseInt(yearId) } : {}),\n          ...(semester ? { semester: parseInt(semester) } : {}),\n          ...(sourceType === "channel" && moduleId ? { moduleId: parseInt(moduleId) } : {}),\n          ...(cohortId ? { cohortId: parseInt(cohortId) } : {}),\n          // r68: الربط متعدد القواعد — التخصص (الملك) والملمح\n          ...(user?.role === "OWNER" && specialtyChoice ? { specialtyId: parseInt(specialtyChoice) } : {}),\n          ...(trackChoice && !cohortId ? { trackId: parseInt(trackChoice) } : {}),',
)

# C) variation toast branch
patch(
    "      } else if (cohortId) {",
    """      } else if ((data.linkedVariations ?? 1) > 1) {
        // r68: تنويعة إضافية لنفس القناة بقواعد مختلفة
        toast.success(data.message ?? "رُبطت القناة بتنويعة إضافية — منشوراتها ستظهر وفق قواعد هذا الربط");
      } else if (cohortId) {""",
)

# C) dialog reset
patch(
    'setOpen(false); setHandle(""); setTitle(""); setModuleId(""); setCohortId(""); setSemester(""); setYearId("");',
    'setOpen(false); setHandle(""); setTitle(""); setModuleId(""); setCohortId(""); setSemester(""); setYearId(""); setTrackChoice(""); setSpecialtyChoice("");',
)

# ---------------------------------------------------------------- D) add-dialog selects
patch(
    "              {(sourceType === \"group\" || !cohortId) && (",
    """              {isOwnerLinker && specialties.length > 0 && (
                <div className="space-y-1.5">
                  <Label>التخصص</Label>
                  <select
                    value={specialtyChoice}
                    onChange={(e) => {
                      setSpecialtyChoice(e.target.value);
                      setYearId(""); setModuleId(""); setCohortId(""); setTrackChoice("");
                    }}
                    className={selectCls}
                  >
                    <option value="">— تخصصي —</option>
                    {specialties.filter((sp) => String(sp.id) !== String(user?.assignedSpecialtyId)).map((sp) => (
                      <option key={sp.id} value={sp.id}>{sp.nameAr}</option>
                    ))}
                  </select>
                </div>
              )}
              {!cohortId && tracks.length > 0 && (
                <div className="space-y-1.5">
                  <Label>الملمح (اختياري — لطلبة هذا الممح فقط)</Label>
                  <select value={trackChoice} onChange={(e) => setTrackChoice(e.target.value)} className={selectCls}>
                    <option value="">— كل الملامح —</option>
                    {tracks.map((t) => <option key={t.id} value={t.id}>{t.trackNameAr}</option>)}
                  </select>
                </div>
              )}
              {(sourceType === "group" || !cohortId) && (""",
)

# ---------------------------------------------------------------- E) list badges
patch(
    "{s.moduleName ? <span>• المقياس: {s.moduleName}</span> : null}\n                    {s.cohortName ? <span>• {s.cohortName}</span> : null}",
    """{s.moduleName ? <span>• المقياس: {s.moduleName}</span> : null}
                    {s.cohortName ? <span>• {s.cohortName}</span> : null}
                    {s.trackName ? <span>• الممح: {s.trackName}</span> : null}
                    {s.specialtyName && new Set(sources.map((x) => x.specialtyId ?? 0)).size > 1 ? (
                      <span>• {s.specialtyName}</span>
                    ) : null}
                    {(s.linkCount ?? 1) > 1 ? (
                      <span>• مربوطة {s.linkCount} {(s.linkCount ?? 1) === 2 ? "مرتين" : "مرات"}</span>
                    ) : null}""",
)

# ---------------------------------------------------------------- F) edit dialog track
patch(
    'const [editCohortId, setEditCohortId] = React.useState("");',
    'const [editCohortId, setEditCohortId] = React.useState("");\n  // r68: الممح — تحرير قاعدة ملمح الربط\n  const [editTrackId, setEditTrackId] = React.useState("");\n  const [editTracks, setEditTracks] = React.useState<Array<{ id: number; trackNameAr: string }>>([]);',
)

patch(
    'setEditCohortId(s.cohortId ? String(s.cohortId) : "");',
    '''setEditCohortId(s.cohortId ? String(s.cohortId) : "");
    // r68: ملامح تخصص المصدر — لتحرير قاعدة الممح
    setEditTrackId(s.trackId ? String(s.trackId) : "");
    fetch(`/api/onboarding/tracks?specialtyId=${s.specialtyId ?? user?.assignedSpecialtyId ?? 1}`)
      .then((r) => r.json()).then((data) => setEditTracks(data.tracks ?? [])).catch(() => setEditTracks([]));''',
)

patch(
    "cohortId: editCohortId ? parseInt(editCohortId) : null,\n          isActive: editIsActive,",
    "cohortId: editCohortId ? parseInt(editCohortId) : null,\n          // r68: الممح — يُرسل دائماً فيُحدَّث أو يبقى كما هو\n          trackId: editTrackId ? parseInt(editTrackId) : null,\n          isActive: editIsActive,",
)

# F) track select JSX — insert before the cohort select's wrapping div (programmatic)
sel_anchor = 'value={editCohortId}\n                  onChange={(e) => { setEditCohortId(e.target.value); if (e.target.value) setEditModuleId(""); }}'
if src.count(sel_anchor) != 1:
    print("FAIL: edit cohort select anchor not unique")
    sys.exit(1)
pos = src.find(sel_anchor)
div_start = src.rfind('<div className="space-y-1.5">', 0, pos)
if div_start < 0:
    print("FAIL: cohort wrapping div not found")
    sys.exit(1)
track_block = """{/* r68: الممح — تحرير قاعدة ملمح الربط */}
              {editTracks.length > 0 && (
                <div className="space-y-1.5">
                  <Label>الملمح (اختياري)</Label>
                  <select value={editTrackId} onChange={(e) => setEditTrackId(e.target.value)} className={selectCls}>
                    <option value="">— كل الملامح —</option>
                    {editSource.trackId != null && !editTracks.some((t) => String(t.id) === String(editSource.trackId)) ? (
                      <option value={String(editSource.trackId)}>{editSource.trackName ?? `ملمح #${editSource.trackId}`}</option>
                    ) : null}
                    {editTracks.map((t) => <option key={t.id} value={t.id}>{t.trackNameAr}</option>)}
                  </select>
                </div>
              )}
              """
src = src[:div_start] + track_block + src[div_start:]
applied += 1

# ---------------------------------------------------------------- G) TgItemsManager — states
patch(
    "  const [deleteItem, setDeleteItem] = React.useState<TgItemAdminRow | null>(null);\n  const [deleting, setDeleting] = React.useState(false);",
    """  const [deleteItem, setDeleteItem] = React.useState<TgItemAdminRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  // r68: الحذف الجماعي — تحديد متعدد لتنظيف المنشورات المصنّفة خطأ
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set());
  const [bulkConfirm, setBulkConfirm] = React.useState(false);
  const [bulkDeleting, setBulkDeleting] = React.useState(false);""",
)

# G) wider admin window
patch(
    'const params = new URLSearchParams({ mode: "admin" });\n      if (q.trim()) params.set("q", q.trim());',
    'const params = new URLSearchParams({ mode: "admin" });\n      params.set("limit", "500"); // r68: أوسع نافذة للتنقيح الجماعي\n      if (q.trim()) params.set("q", q.trim());',
)

# G) clear selection when filters change
patch(
    "  React.useEffect(() => { fetchItems(); }, [fetchItems]);",
    """  React.useEffect(() => { fetchItems(); }, [fetchItems]);

  // r68: تغيير الفلاتر يبدأ تحديداً نظيفاً
  React.useEffect(() => { setSelectedIds(new Set()); }, [q, sourceId, itemType]);""",
)

# G) toggle helpers + bulk delete handler (after handleDelete)
patch(
    '    } catch { toast.error("فشل الحذف"); }\n    finally { setDeleting(false); }\n  }\n\n  async function handleReclassify(id: number) {',
    '''    } catch { toast.error("فشل الحذف"); }
    finally { setDeleting(false); }
  }

  // r68: الحذف الجماعي — تحديد متعدد ودفعة واحدة
  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const allVisibleSelected = items.length > 0 && items.every((i) => selectedIds.has(i.id));
  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size >= items.length ? new Set() : new Set(items.map((i) => i.id))));
  }

  async function handleBulkDelete() {
    const ids = items.filter((i) => selectedIds.has(i.id)).map((i) => i.id);
    if (ids.length === 0) { setBulkConfirm(false); return; }
    setBulkDeleting(true);
    try {
      const res = await fetch(`/api/telegram/items?ids=${ids.join(",")}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشل الحذف الجماعي"); return; }
      toast.success(data.message ?? `حُذف ${data.deleted} منشوراً`);
      setBulkConfirm(false);
      setSelectedIds(new Set());
      fetchItems();
    } catch { toast.error("فشل الحذف الجماعي"); }
    finally { setBulkDeleting(false); }
  }

  async function handleReclassify(id: number) {''',
)

# G) toolbar after the count line (programmatic: after the <p> that ends the count text)
p_close = "      </p>\n\n      {editItem && ("
if src.count(p_close) != 1:
    print(f"FAIL: count </p> anchor found {src.count(p_close)}x")
    sys.exit(1)
toolbar = """      </p>

      {/* r68: شريط التحديد والحذف الجماعي */}
      {items.length > 0 && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} className="accent-primary" />
            تحديد الكل ({items.length})
          </label>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-destructive">{selectedIds.size} محدد</span>
              <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>إلغاء التحديد</Button>
              <Button variant="destructive" size="sm" onClick={() => setBulkConfirm(true)}>
                <Trash2 className="w-4 h-4 ml-1" />حذف المحدد
              </Button>
            </div>
          )}
        </div>
      )}

      {editItem && ("""
src = src.replace(p_close, toolbar, 1)
applied += 1

# G) per-item checkbox (before the featured star)
patch(
    '{i.isFeatured && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}',
    '''<input
                      type="checkbox"
                      checked={selectedIds.has(i.id)}
                      onChange={() => toggleSelect(i.id)}
                      className="accent-primary shrink-0"
                      aria-label="تحديد المنشور"
                    />
                    {i.isFeatured && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}''',
)

# G) bulk confirm dialog before the loading branch
patch(
    '      {loading ? (\n        <div className="text-center py-4"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div>\n      ) : items.length === 0 ? (',
    '''      {/* r68: تأكيد الحذف الجماعي */}
      {bulkConfirm && (
        <Dialog open onOpenChange={() => setBulkConfirm(false)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="text-destructive flex items-center gap-2"><Trash2 className="w-5 h-5" />حذف جماعي</DialogTitle></DialogHeader>
            <p className="text-sm">
              حذف <strong>{items.filter((i) => selectedIds.has(i.id)).length}</strong> منشوراً محدداً نهائياً من المكتبة؟
              يبقى الأصل في تيليجرام — ويمكن استيراده مجدداً بإعادة نشره.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              نصيحة: فعّل الفلاتر أعلاه (قناة/نوع/بحث) ثم «تحديد الكل» لتنظيف دفعة كاملة من المنشورات المصنّفة خطأ.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBulkConfirm(false)}>إلغاء</Button>
              <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting}>
                {bulkDeleting && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حذف نهائياً
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {loading ? (
        <div className="text-center py-4"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div>
      ) : items.length === 0 ? (''',
)

io.open(PATH, "w", encoding="utf-8").write(src)
print(f"OK — {applied} patches applied. {orig_len} → {len(src)} chars")
