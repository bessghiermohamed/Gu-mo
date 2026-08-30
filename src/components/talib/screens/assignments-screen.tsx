"use client";

import * as React from "react";
import {
  CheckSquare, Square, Plus, Flag, Loader2, Calendar,
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
  isCompleted?: boolean;
}

export function TalibAssignmentsScreen() {
  const { t } = useI18n();
  const { user } = useAuth();
  const canManage = canManageRoles(user ?? null);
  const [assignments, setAssignments] = React.useState<Assignment[]>([]);
  const [loading, setLoading] = React.useState(true);

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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black mb-1">{t("nav.assignments")}</h1>
        <p className="text-sm text-muted-foreground">الواجبات والتكليفات الدراسية</p>
      </div>

      {canManage && <AddAssignmentDialog onCreated={fetchAssignments} />}

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
                <ReportAssignmentDialog title={a.title} />
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
  const [courseName, setCourseName] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    if (!title.trim()) { toast.error("اكتب عنوان الواجب"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/assignments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), moduleName: courseName.trim(), dueDate: dueDate || new Date().toISOString().split("T")[0], description: description.trim(), moduleId: 1 }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشل الحفظ"); return; }
      toast.success("تمت إضافة الواجب بنجاح ✅");
      setOpen(false); setTitle(""); setCourseName(""); setDueDate(""); setDescription("");
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
          <div className="space-y-1.5"><Label htmlFor="title">عنوان الواجب</Label><Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: تحليل قصيدة امرئ القيس" /></div>
          <div className="space-y-1.5"><Label htmlFor="course">المقياس</Label><Input id="course" value={courseName} onChange={(e) => setCourseName(e.target.value)} placeholder="مثال: الأدب الجاهلي" /></div>
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
