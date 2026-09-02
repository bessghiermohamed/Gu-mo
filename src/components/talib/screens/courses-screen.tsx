"use client";

import * as React from "react";
import { BookOpen, Plus, Flag, Loader2, ChevronDown, Send, AlertTriangle, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { useShell, type CourseSummary } from "@/app/page";
import { canManageRoles } from "@/lib/auth/permissions";
import { toast } from "sonner";

interface Course extends CourseSummary {
  academicYearId: number;
}

export function TalibCoursesScreen() {
  const { t } = useI18n();
  const { navigate } = useShell();
  const [courses, setCourses] = React.useState<Course[]>([]);
  const [loading, setLoading] = React.useState(true);
  // fix (R12 data-layer audit): a failed request used to be swallowed and
  // rendered as "لا توجد مقاييس" — indistinguishable from truly empty data.
  const [loadError, setLoadError] = React.useState(false);

  const fetchCourses = React.useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch("/api/courses", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCourses(data.courses ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { fetchCourses(); }, [fetchCourses]);

  // fix أ.3: real semester filter (was guessing from course code strings!)
  const s1Courses = courses.filter((c) => c.semester === 1);
  const s2Courses = courses.filter((c) => c.semester === 2);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black mb-1">{t("courses.title")}</h1>
        <p className="text-sm text-muted-foreground">تصفّح مقرراتك حسب السداسي</p>
      </div>

      {/* round 7: بوابة دروس تيليجرام — المحتوى المرتبط بالمقاييس من القنوات */}
      <Card
        role="button"
        tabIndex={0}
        onClick={() => navigate("TELEGRAM")}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("TELEGRAM"); } }}
        className="p-3.5 cursor-pointer hover:border-primary/40 hover:shadow-md transition-all flex items-center gap-3 bg-primary/5 border-primary/20"
        aria-label="فتح دروس تيليجرام"
      >
        <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <Send className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm">دروس تيليجرام</p>
          <p className="text-xs text-muted-foreground">محاضرات وتمارين القنوات مرتبة حسب المقياس — انقر للتصفّح</p>
        </div>
        <ChevronDown className="w-4 h-4 text-muted-foreground -rotate-90 shrink-0" />
      </Card>

      <Tabs defaultValue="all">
        <TabsList className="grid w-full grid-cols-3">
          {/* fix M-3 (round 4): stronger active-tab visual anchor */}
          <TabsTrigger value="all" className="data-[state=active]:font-bold">الكل</TabsTrigger>
          <TabsTrigger value="s1" className="data-[state=active]:font-bold">{t("courses.semester1")}</TabsTrigger>
          <TabsTrigger value="s2" className="data-[state=active]:font-bold">{t("courses.semester2")}</TabsTrigger>
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

function CoursesList({ courses, loading, loadError, onRefresh }: { courses: Course[]; loading: boolean; loadError: boolean; onRefresh: () => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { navigateToCourse } = useShell();
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

  // fix (R12): network failure is no longer disguised as an empty list
  if (loadError) {
    return (
      <div className="space-y-3">
        <Card className="p-8 text-center bg-red-500/5 border-red-500/30">
          <AlertTriangle className="w-10 h-10 mx-auto text-red-500 mb-3" />
          <h3 className="font-bold text-sm mb-1">تعذّر تحميل المقاييس</h3>
          <p className="text-xs text-muted-foreground mb-3">حدث خطأ أثناء الاتصال بالخادم — أعد المحاولة.</p>
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="w-3.5 h-3.5 ml-1" />إعادة المحاولة
          </Button>
        </Card>
        {canManage && <AddModuleDialog onCreated={onRefresh} />}
      </div>
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
        courses.map((course) => {
          return (
            <Card
              key={course.id}
              role="button"
              tabIndex={0}
              aria-label={`فتح تفاصيل ${course.name}`}
              // fix (R12-02/03, P0): the card used to expand IN PLACE to a
              // description and stop — a dead end. It now opens the course
              // detail screen: lessons, exams, assignments, description.
              onClick={() => navigateToCourse(course)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigateToCourse(course);
                }
              }}
              className="p-4 cursor-pointer transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-sm">{course.name}</h3>
                    {/* fix M-5 (round 4): empty codes rendered empty pill badges */}
                    {course.code && (
                      <Badge variant="outline" className="text-xs">{course.code}</Badge>
                    )}
                  </div>
                  {course.professorName && <p className="text-xs text-muted-foreground">الأستاذ: {course.professorName}</p>}
                  <div className="flex items-center gap-3 mt-2 text-xs">
                    <span className="text-muted-foreground">{t("courses.coefficient")}: {course.coefficient}</span>
                    {course.category && <Badge variant="secondary" className="text-xs">{course.category}</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Dialog open={reportOpen === course.id} onOpenChange={(open) => { setReportOpen(open ? course.id : null); if (!open) setReportReason(""); }}>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-amber-600 shrink-0"
                        aria-label="تبليغ عن مشكلة"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Flag className="w-4 h-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>تبليغ عن خطأ في المقياس</DialogTitle></DialogHeader>
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
                  <ChevronDown
                    aria-hidden
                    className="w-4 h-4 text-muted-foreground -rotate-90"
                  />
                </div>
              </div>
            </Card>
          );
        })
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
  const [semester, setSemester] = React.useState("1");
  const [years, setYears] = React.useState<Array<{ id: number; yearName: string }>>([]);
  const [yearId, setYearId] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    // fix (R12-37s): the dialog used to silently fetch years of specialty 1
    // when the caller had no specialty — creating courses in the WRONG scope.
    if (user?.assignedSpecialtyId == null) {
      setYears([]);
      return;
    }
    fetch(`/api/onboarding/years?specialtyId=${user.assignedSpecialtyId}`)
      .then((r) => r.json())
      .then((data) => {
        const l = data.years ?? [];
        setYears(l);
        const own = l.find((y: { id: number }) => y.id === user?.scopeAcademicYearId);
        setYearId(own ? String(own.id) : l.length > 0 ? String(l[0].id) : "");
      })
      .catch(() => setYears([]));
  }, [user, open]);

  async function handleSave() {
    if (!name.trim() || !code.trim()) { toast.error("الاسم والكود مطلوبان"); return; }
    if (!yearId) { toast.error("اختر السنة الدراسية"); return; }
    // fix (R12-37s): no silent `?? 1` — a missing specialty must STOP the
    // write, not corrupt another specialty's data.
    if (user?.assignedSpecialtyId == null) {
      toast.error("حسابك غير مرتبط بتخصص — لا يمكن إنشاء مقياس");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/courses", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), code: code.trim(), professorName: professor.trim(),
          coefficient: parseFloat(coefficient) || 2, semester: parseInt(semester),
          specialtyId: user.assignedSpecialtyId, academicYearId: parseInt(yearId),
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشل الحفظ"); return; }
      toast.success("تمت إضافة المقياس بنجاح");
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
        <DialogHeader><DialogTitle>إضافة مقياس دراسي جديد</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5"><Label htmlFor="year">السنة الدراسية</Label>
            <select id="year" value={yearId} onChange={(e) => setYearId(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
              <option value="">— اختر —</option>
              {years.map((y) => <option key={y.id} value={y.id}>{y.yearName}</option>)}
            </select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="semester">السداسي</Label>
            <select id="semester" value={semester} onChange={(e) => setSemester(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
              <option value="1">السداسي الأول</option>
              <option value="2">السداسي الثاني</option>
            </select>
          </div>
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
  const map: Record<string, string> = { "courses.addCourse": "مقياس جديد", "courses.courseName": "اسم المقياس", "courses.courseCode": "رمز المقياس" };
  return map[key] ?? key;
}
