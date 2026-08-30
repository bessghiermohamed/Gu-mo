"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { BookOpen, Plus, Flag, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { canManageRoles } from "@/lib/auth/permissions";
import { toast } from "sonner";

interface Course {
  id: number;
  name: string;
  code: string;
  coefficient: number;
  professorName: string;
  category: string;
  description: string;
}

export function TalibCoursesScreen() {
  const { t } = useI18n();
  const [courses, setCourses] = React.useState<Course[]>([]);
  const [loading, setLoading] = React.useState(true);

  const fetchCourses = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/courses", { cache: "no-store" });
      const data = await res.json();
      setCourses(data.courses ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { fetchCourses(); }, [fetchCourses]);

  const s1Courses = courses.filter((c) => c.code?.includes("S1") || c.description?.includes("سداسي 1"));
  const s2Courses = courses.filter((c) => c.code?.includes("S2") || c.description?.includes("سداسي 2"));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black mb-1">{t("courses.title")}</h1>
        <p className="text-sm text-muted-foreground">تصفّح مقرراتك حسب السداسي</p>
      </div>

      <Tabs defaultValue="all">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="all">الكل</TabsTrigger>
          <TabsTrigger value="s1">{t("courses.semester1")}</TabsTrigger>
          <TabsTrigger value="s2">{t("courses.semester2")}</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-4">
          <CoursesList courses={courses} loading={loading} onRefresh={fetchCourses} />
        </TabsContent>
        <TabsContent value="s1" className="mt-4">
          <CoursesList courses={s1Courses} loading={loading} onRefresh={fetchCourses} />
        </TabsContent>
        <TabsContent value="s2" className="mt-4">
          <CoursesList courses={s2Courses} loading={loading} onRefresh={fetchCourses} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CoursesList({ courses, loading, onRefresh }: { courses: Course[]; loading: boolean; onRefresh: () => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const canManage = canManageRoles(user ?? null);
  const [reportOpen, setReportOpen] = React.useState<number | null>(null);
  const [reportReason, setReportReason] = React.useState("");

  function handleReport(courseName: string) {
    if (!reportReason.trim()) { toast.error("اكتب وصف المشكلة"); return; }
    fetch("/api/issues", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemType: "مقياس", itemTitle: courseName, description: reportReason.trim() }),
    }).then((r) => r.json()).then((data) => {
      if (data.error) { toast.error(data.error); } else {
        toast.success("تم إرسال التبليغ بنجاح");
        setReportOpen(null); setReportReason("");
      }
    });
  }

  if (loading) {
    return (
      <Card className="p-8 text-center">
        <Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {courses.length === 0 ? (
        <Card className="p-8 text-center bg-muted/30 border-dashed">
          <BookOpen className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-bold text-sm mb-1">{t("courses.noCourses")}</h3>
          <p className="text-xs text-muted-foreground">سيتم تحميل مقرراتك تلقائياً بعد ربط ملفك بالتخصص والسنة.</p>
        </Card>
      ) : (
        courses.map((course) => (
          <Card key={course.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-sm">{course.name}</h3>
                  <Badge variant="outline" className="text-[10px]">{course.code}</Badge>
                </div>
                {course.professorName && <p className="text-xs text-muted-foreground">الأستاذ: {course.professorName}</p>}
                <div className="flex items-center gap-3 mt-2 text-[10px]">
                  <span className="text-muted-foreground">{t("courses.coefficient")}: {course.coefficient}</span>
                  <Badge variant="secondary" className="text-[10px]">{course.category}</Badge>
                </div>
              </div>
              <Dialog open={reportOpen === course.id} onOpenChange={(open) => { setReportOpen(open ? course.id : null); if (!open) setReportReason(""); }}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-amber-600 shrink-0" aria-label="تبليغ عن مشكلة">
                    <Flag className="w-4 h-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>تبليغ عن خطأ في المقياس 🚩</DialogTitle></DialogHeader>
                  <div className="space-y-3 py-2">
                    <p className="text-xs text-muted-foreground">المقياس: <span className="font-bold">{course.name}</span></p>
                    <div className="space-y-1.5"><Label htmlFor="reason">وصف المشكلة</Label><Input id="reason" value={reportReason} onChange={(e) => setReportReason(e.target.value)} placeholder="مثال: معلومات الأستاذ غير صحيحة..." /></div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setReportOpen(null)}>إلغاء</Button>
                    <Button onClick={() => handleReport(course.name)}>إرسال التبليغ</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </Card>
        ))
      )}
      {canManage && <AddModuleDialog onCreated={onRefresh} />}
    </div>
  );
}

function AddModuleDialog({ onCreated }: { onCreated: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [professor, setProfessor] = React.useState("");
  const [coefficient, setCoefficient] = React.useState("2");
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    if (!name.trim() || !code.trim()) { toast.error("الاسم والكود مطلوبان"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/courses", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), code: code.trim(), professorName: professor.trim(), coefficient: parseFloat(coefficient) || 2, specialtyId: user?.assignedSpecialtyId ?? 1, academicYearId: 1 }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشل الحفظ"); return; }
      toast.success("تمت إضافة المقياس بنجاح ✅");
      setOpen(false); setName(""); setCode(""); setProfessor(""); setCoefficient("2");
      onCreated();
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full mt-2"><Plus className="w-4 h-4 ml-2" />{t("courses.addCourse")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>إضافة مقياس دراسي جديد 📚</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5"><Label htmlFor="name">{t("courses.courseName")}</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: الأدب الجاهلي" /></div>
          <div className="space-y-1.5"><Label htmlFor="code">{t("courses.courseCode")}</Label><Input id="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="مثال: AR-LIT-101" /></div>
          <div className="space-y-1.5"><Label htmlFor="prof">الأستاذ</Label><Input id="prof" value={professor} onChange={(e) => setProfessor(e.target.value)} placeholder="اسم الأستاذ" /></div>
          <div className="space-y-1.5"><Label htmlFor="coef">المعامل</Label><Input id="coef" type="number" value={coefficient} onChange={(e) => setCoefficient(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Helper to avoid TypeScript error since we use t() in a nested component
function t(key: string): string {
  const map: Record<string, string> = { "courses.addCourse": "+ مقياس جديد", "courses.courseName": "اسم المقياس", "courses.courseCode": "رمز المقياس" };
  return map[key] ?? key;
}
