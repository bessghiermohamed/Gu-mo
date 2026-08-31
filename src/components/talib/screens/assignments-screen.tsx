"use client";

import * as React from "react";
import {
  CheckSquare, Square, Plus, Flag, Loader2, Calendar, Pencil, Trash2, BookOpen,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { canManageRoles } from "@/lib/auth/permissions";
import { toast } from "sonner";

interface Assignment {
  id: number;
  title: string;
  description: string;
  dueDate: string;
  moduleName: string;
  moduleId?: number;
  isCompleted?: boolean;
}

// round 6: courses for the real course dropdown (was: decorative text field
// whose value was ignored — every assignment was silently attached to
// course #1 via a hardcoded moduleId: 1)
interface CourseOption {
  id: number; name: string; code: string;
}

export function TalibAssignmentsScreen() {
  const { t } = useI18n();
  const { user } = useAuth();
  const canManage = canManageRoles(user ?? null);
  const [assignments, setAssignments] = React.useState<Assignment[]>([]);
  const [loading, setLoading] = React.useState(true);
  // round 6: edit/delete state
  const [editAssignment, setEditAssignment] = React.useState<Assignment | null>(null);
  const [deleteAssignment, setDeleteAssignment] = React.useState<Assignment | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const fetchAssignments = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/assignments", { cache: "no-store" });
      const data = await res.json();
      const stored = JSON.parse(localStorage.getItem("talib-assignments-completed") || "{}");
      setAssignments((data.assignments ?? []).map((a: Assignment) => ({ ...a, isCompleted: !!stored[a.id] })));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { fetchAssignments(); }, [fetchAssignments]);

  function toggleComplete(id: number) {
    setAssignments((prev) => prev.map((a) => a.id === id ? { ...a, isCompleted: !a.isCompleted } : a));
    const stored = JSON.parse(localStorage.getItem("talib-assignments-completed") || "{}");
    const updated = { ...stored, [id]: !stored[id] };
    localStorage.setItem("talib-assignments-completed", JSON.stringify(updated));
    toast.success(updated[id] ? "تم الإنجاز ✅" : "أُلغي الإنجاز");
  }

  // round 6: delete an assignment (a wrong due date / title could never be
  // corrected or removed — the add button was the only operation)
  async function handleDelete() {
    if (!deleteAssignment) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/assignments?id=${deleteAssignment.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تم حذف الواجب");
      setDeleteAssignment(null);
      fetchAssignments();
    } catch { toast.error("فشل الحذف"); }
    finally { setDeleting(false); }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black mb-1">{t("nav.assignments")}</h1>
        <p className="text-sm text-muted-foreground">الواجبات والتكليفات الدراسية</p>
      </div>

      {canManage && <AddAssignmentDialog onCreated={fetchAssignments} />}

      {/* round 6: edit dialog */}
      {editAssignment && <EditAssignmentDialog assignment={editAssignment} onClose={() => setEditAssignment(null)} onSaved={() => { setEditAssignment(null); fetchAssignments(); }} />}

      {/* round 6: delete confirm */}
      {deleteAssignment && (
        <Dialog open onOpenChange={() => setDeleteAssignment(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="text-destructive flex items-center gap-2"><Trash2 className="w-5 h-5" />حذف واجب</DialogTitle></DialogHeader>
            <p className="text-sm">هل تريد حذف <strong>{deleteAssignment.title}</strong>؟ لا يمكن التراجع.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteAssignment(null)}>إلغاء</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>{deleting && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حذف نهائي</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {loading ? (
        <Card className="p-8 text-center">
          <Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        </Card>
      ) : assignments.length === 0 ? (
        <Card className="p-8 text-center bg-muted/30 border-dashed">
          <CheckSquare className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-bold text-sm mb-1">لا توجد واجبات حالياً</h3>
          <p className="text-xs text-muted-foreground">ستظهر الواجبات هنا عند نشرها من طرف الإدارة.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-start gap-3">
                <button onClick={() => toggleComplete(a.id)} className="mt-0.5 shrink-0" aria-label="تبديل الإنجاز">
                  {a.isCompleted ? <CheckSquare className="w-5 h-5 text-emerald-600" /> : <Square className="w-5 h-5 text-muted-foreground" />}
                </button>
                <div className="flex-1 min-w-0">
                  <h3 className={`font-bold text-sm ${a.isCompleted ? "line-through text-muted-foreground" : ""}`}>{a.title}</h3>
                  {a.description && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{a.description}</p>}
                  <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                    <Calendar className="w-3 h-3" /><span>التسليم: {a.dueDate}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {canManage && (
                    <>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setEditAssignment(a)} aria-label="تعديل الواجب">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 h-7 w-7 shrink-0" onClick={() => setDeleteAssignment(a)} aria-label="حذف الواجب">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                  <ReportAssignmentDialog title={a.title} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AddAssignmentDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  // round 6: real course selection — the old free-text "المقياس" field was
  // decorative: its value was sent as `moduleName` which the API ignores,
  // while a hardcoded `moduleId: 1` silently attached EVERY assignment to
  // course #1 (and failed with an FK error if that course didn't exist).
  const [courses, setCourses] = React.useState<CourseOption[]>([]);
  const [moduleId, setModuleId] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    fetch("/api/courses", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const list: CourseOption[] = data.courses ?? [];
        setCourses(list);
        if (list.length > 0) setModuleId(String(list[0].id));
      })
      .catch(() => setCourses([]));
  }, [open]);

  async function handleSave() {
    if (!title.trim()) { toast.error("اكتب عنوان الواجب"); return; }
    if (!moduleId) { toast.error("اختر المقياس — أضف مقاييس أولاً من شاشة المقررات"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/assignments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), moduleId: parseInt(moduleId), dueDate: dueDate || new Date().toISOString().split("T")[0], description: description.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشل الحفظ"); return; }
      toast.success("تمت إضافة الواجب بنجاح ✅");
      setOpen(false); setTitle(""); setDueDate(""); setDescription("");
      onCreated();
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full"><Plus className="w-4 h-4 ml-2" />+ واجب جديد</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>إضافة واجب / تكليف جديد 📝</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="course">المقياس</Label>
            {courses.length === 0 ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">لا توجد مقاييس بعد — أضف مقاييس أولاً من شاشة المقررات</p>
            ) : (
              <select id="course" value={moduleId} onChange={(e) => setModuleId(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                {courses.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
              </select>
            )}
          </div>
          <div className="space-y-1.5"><Label htmlFor="title">عنوان الواجب</Label><Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: تحليل قصيدة امرئ القيس" /></div>
          <div className="space-y-1.5"><Label htmlFor="due">تاريخ التسليم</Label><Input id="due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="desc">الوصف</Label><Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="تفاصيل الواجب..." rows={3} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// round 6: edit an existing assignment (fix the title/due date/description
// without deleting and re-adding — the add button was previously the only
// operation, so any mistake was permanent for every student).
function EditAssignmentDialog({ assignment, onClose, onSaved }: { assignment: Assignment; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = React.useState(assignment.title);
  const [dueDate, setDueDate] = React.useState(assignment.dueDate);
  const [description, setDescription] = React.useState(assignment.description);
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    if (!title.trim()) { toast.error("اكتب عنوان الواجب"); return; }
    if (!dueDate) { toast.error("اختر تاريخ التسليم"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/assignments", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: assignment.id, title: title.trim(), dueDate, description: description.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشل الحفظ"); return; }
      toast.success("تم تعديل الواجب ✅");
      onSaved();
    } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="w-5 h-5 text-primary" />تعديل الواجب</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5"><Label htmlFor="editTitle">عنوان الواجب</Label><Input id="editTitle" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="editDue">تاريخ التسليم</Label><Input id="editDue" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="editDesc">الوصف</Label><Textarea id="editDesc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حفظ التعديلات</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReportAssignmentDialog({ title }: { title: string }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function handleReport() {
    if (!reason.trim()) { toast.error("اكتب وصف المشكلة"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/issues", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemType: "واجب وتكليف", itemTitle: title, description: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشل الإرسال"); return; }
      toast.success("تم إرسال التبليغ بنجاح 🚩");
      setOpen(false); setReason("");
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-amber-600 shrink-0" aria-label="تبليغ عن مشكلة">
          <Flag className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>تبليغ عن خطأ في التكليف 🚩</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-xs text-muted-foreground">الواجب: <span className="font-bold">{title}</span></p>
          <div className="space-y-1.5"><Label htmlFor="reason">وصف المشكلة</Label><Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: تاريخ التسليم غير صحيح..." rows={3} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          <Button onClick={handleReport} disabled={saving}>{saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}إرسال التبليغ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
