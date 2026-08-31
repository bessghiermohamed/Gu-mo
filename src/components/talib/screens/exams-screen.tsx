"use client";

import * as React from "react";
import { FlaskConical, Calendar, Clock, MapPin, Plus, Loader2, Trash2, BookOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { canManageRoles } from "@/lib/auth/permissions";
import { toast } from "sonner";

// fix ج: the Exams screen was a static placeholder with no data, no API,
// and no button. Now it reads real exams scoped to the student's
// specialty + year, and supervisors can add/delete exams.

interface Exam {
  id: number;
  moduleId: number;
  moduleName: string;
  title: string;
  examDate: string;
  time: string;
  room: string;
  coefficient: number;
  isFinished: boolean;
}

interface Course {
  id: number;
  name: string;
  code: string;
}

export function TalibExamsScreen() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [exams, setExams] = React.useState<Exam[]>([]);
  const [loading, setLoading] = React.useState(true);
  const canManage = canManageRoles(user ?? null);

  const fetchExams = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/exams", { cache: "no-store" });
      const data = await res.json();
      setExams(data.exams ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  React.useEffect(() => { fetchExams(); }, [fetchExams]);

  const today = new Date().toISOString().split("T")[0];
  const upcoming = exams.filter((e) => !e.isFinished && e.examDate >= today);
  const finished = exams.filter((e) => e.isFinished || e.examDate < today);

  async function handleDelete(id: number) {
    if (!confirm("هل تريد حذف هذا الاختبار؟")) return;
    try {
      const res = await fetch(`/api/exams?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تم حذف الاختبار");
      fetchExams();
    } catch { toast.error("فشل الحذف"); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black mb-1">{t("exams.title")}</h1>
          <p className="text-sm text-muted-foreground">
            مواعيد الاختبارات والامتحانات القادمة
          </p>
        </div>
        {canManage && <AddExamDialog onCreated={fetchExams} />}
      </div>

      <Tabs defaultValue="upcoming">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upcoming">{t("exams.upcoming")} ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="finished">{t("exams.finished")} ({finished.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming" className="mt-4">
          <ExamsList exams={upcoming} loading={loading} canManage={canManage} onDelete={handleDelete} emptyText={t("exams.noExams")} />
        </TabsContent>
        <TabsContent value="finished" className="mt-4">
          <ExamsList exams={finished} loading={loading} canManage={canManage} onDelete={handleDelete} emptyText="لا توجد اختبارات منتهية" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ExamsList({ exams, loading, canManage, onDelete, emptyText }: {
  exams: Exam[]; loading: boolean; canManage: boolean; onDelete: (id: number) => void; emptyText: string;
}) {
  const { t } = useI18n();
  if (loading) {
    return (
      <Card className="p-8 text-center">
        <Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </Card>
    );
  }
  if (exams.length === 0) {
    return (
      <Card className="p-8 text-center bg-muted/30 border-dashed">
        <FlaskConical className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <h3 className="font-bold text-sm mb-1">{emptyText}</h3>
        <p className="text-xs text-muted-foreground">
          ستظهر مواعيد الاختبارات هنا عند نشرها من طرف الإدارة.
        </p>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {exams.map((exam) => (
        <Card key={exam.id} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="font-bold text-sm">{exam.title}</h3>
                <Badge variant="secondary" className="text-[10px]"><BookOpen className="w-3 h-3 ml-1" />{exam.moduleName}</Badge>
              </div>
              <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{exam.examDate}</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{exam.time}</span>
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{exam.room}</span>
                <span>المعامل: {exam.coefficient}</span>
              </div>
            </div>
            {canManage && (
              <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 shrink-0" onClick={() => onDelete(exam.id)} aria-label="حذف">
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

function AddExamDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [courses, setCourses] = React.useState<Course[]>([]);
  const [moduleId, setModuleId] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [examDate, setExamDate] = React.useState("");
  const [time, setTime] = React.useState("09:00");
  const [room, setRoom] = React.useState("");
  const [coefficient, setCoefficient] = React.useState("2");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    fetch("/api/courses", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const list: Course[] = data.courses ?? [];
        setCourses(list);
        if (list.length > 0) setModuleId(String(list[0].id));
      })
      .catch(() => setCourses([]));
  }, [open]);

  async function handleSave() {
    if (!moduleId) { toast.error("اختر المقياس"); return; }
    if (!title.trim()) { toast.error("اكتب عنوان الاختبار"); return; }
    if (!examDate) { toast.error("اختر التاريخ"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/exams", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moduleId: parseInt(moduleId), title: title.trim(), examDate,
          time, room: room.trim(), coefficient: parseFloat(coefficient) || 2,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشل الحفظ"); return; }
      toast.success("تمت إضافة الاختبار ✅");
      setOpen(false); setTitle(""); setExamDate(""); setTime("09:00"); setRoom("");
      onCreated();
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="w-4 h-4 ml-1" />اختبار</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>إضافة اختبار جديد 📝</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>المقياس</Label>
            {courses.length === 0 ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">لا توجد مقاييس بعد — أضف مقاييس أولاً من شاشة المقررات</p>
            ) : (
              <select value={moduleId} onChange={(e) => setModuleId(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                {courses.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
              </select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="examTitle">عنوان الاختبار</Label>
            <Input id="examTitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: امتحان منتصف السداسي" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="examDate">التاريخ</Label>
              <Input id="examDate" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="examTime">الوقت</Label>
              <Input id="examTime" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="examRoom">القاعة</Label>
              <Input id="examRoom" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="مثال: قاعة 12" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="examCoef">المعامل</Label>
              <Input id="examCoef" type="number" value={coefficient} onChange={(e) => setCoefficient(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
