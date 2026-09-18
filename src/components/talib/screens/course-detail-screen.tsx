"use client";

/**
 * Course Detail (R12-02 · P0 — "the course→lecture→file spine does not exist")
 *
 * BEFORE: a course card expanded to a description and stopped. The student's
 * PRIMARY task — open my course, get its lectures/files/exams — was impossible
 * in the app (students routed around it via Telegram). The Courses tile even
 * promised "مقاييس ومحاضرات".
 *
 * NOW: every course card opens this screen — the product's new center of
 * gravity — assembling everything already linked to the module in the
 * database (all three sources carry the FKs needed, zero schema changes):
 *   • ملفات المقياس       ← library_references linked by module_id
 *   • الاختبارات          ← exams linked by module_id
 *   • الواجبات            ← assignments linked by module_id
 *
 * Round 93 (طلب المالك: «في قسم الدروس لا تظهر دروس تيليجرام»): the
 * Telegram lessons are REMOVED from the course screen entirely — the old
 * «الدروس» tab (telegram_items + its gateway buttons) is gone; the tab is
 * now «الملفات» holding only the supervisor/student-uploaded files. The
 * Telegram screen itself is untouched as its own section.
 *
 * Every section has explicit loading / error+retry / empty states — no more
 * "error === empty" (R12 data-layer audit).
 *
 * Round 39 — "there isn't a single button inside the course": every tab now
 * carries REAL actions. الدروس: inline image thumbnails + a visible «فتح»
 * button (the old ghost icon was invisible) + file size. المواد: the title
 * itself becomes the reference link + copy-link button + supervisor
 * edit/delete; a material without a URL honestly shows «بدون رابط» instead
 * of being dead words. الاختبارات: every student can push the exam into
 * their personal timetable (أضف إلى جدولي) and supervisors edit/delete in
 * place. الواجبات: done-toggle (shared storage key with the assignments
 * screen), full-details dialog, report-issue, supervisor edit/delete —
 * all without leaving the course.
 */

import * as React from "react";
import {
  BookOpen, FlaskConical, CheckSquare, Loader2, ExternalLink,
  FileText, ImageIcon, Video, Headphones, File, MessageSquare, LinkIcon,
  CalendarDays, Clock, MapPin, User, GraduationCap, AlertTriangle,
  RefreshCw, ChevronLeft, Download, HardDrive, CloudUpload,
  Pencil, Trash2, Copy, CalendarPlus, Eye, Square, Check, Flag,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useAuth } from "@/components/talib/auth-provider";
import { useShell, type CourseSummary } from "@/app/app/page";
import { canManageRoles } from "@/lib/auth/permissions";
import { PublishToLibraryDialog, NeedsSchemaCard } from "@/components/talib/cloud/publish-dialog";
import { cn, formatBytes } from "@/lib/utils";

// Mirror of /api/library response for THIS module (round 93 review state)
interface ExamItem {
  id: number;
  moduleId: number; // /api/exams returns it on both layers; was missing from this mirror (tsc error + cast hack)
  title: string;
  // round 93 — النوع المُسمّى: اختبار / اختبار قصير / عمل موجه
  kind?: string;
  examDate: string;
  time: string;
  room: string;
  coefficient: number;
  isFinished: boolean;
}

interface AssignmentItem {
  id: number;
  title: string;
  dueDate: string;
  description: string;
  maxScore: number;
}

// round 39 — assignment completion is stored client-side under the SAME key
// used by the standalone assignments screen, so a student who checks a
// assignment here sees it checked there too (one per-device state).
const DONE_KEY = "talib-assignments-completed";

// round 33 — المواد: library references scoped to THIS course
interface MaterialItem {
  id: number;
  title: string;
  author: string;
  category: string;
  description: string;
  fileFormat: string;
  downloadUrl: string;
  fileSize: number | null;
  driveFileId: string | null;
  // round 93 — review state (student uploads wait for the supervisor)
  reviewStatus?: string;
  uploaderId?: number | null;
}

function formatDateAr(raw: string): string {
  if (!raw) return "";
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString("ar-DZ", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return raw;
  }
}

// Shared state cards — the app-wide answer to silent failures
function SectionLoading() {
  return (
    <Card className="p-8 text-center">
      <Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground mb-2" />
      <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
    </Card>
  );
}

function SectionError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="p-6 text-center bg-red-500/5 border-red-500/30">
      <AlertTriangle className="w-8 h-8 mx-auto text-red-500 mb-2" />
      <p className="text-sm font-bold mb-1">تعذّر تحميل هذا القسم</p>
      <p className="text-xs text-muted-foreground mb-3">
        حدث خطأ أثناء الاتصال بالخادم — بياناتك لم تُفقد. أعد المحاولة.
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="w-3.5 h-3.5 ml-1" />إعادة المحاولة
      </Button>
    </Card>
  );
}

function SectionEmpty({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <Card className="p-8 text-center bg-muted/30 border-dashed">
      <div className="flex justify-center mb-3 text-muted-foreground">{icon}</div>
      <h3 className="font-bold text-sm mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground leading-relaxed">{hint}</p>
    </Card>
  );
}

export function TalibCourseDetailScreen({ course }: { course: CourseSummary | null }) {
  const { navigate, navigateBack } = useShell();

  // ---- الاختبارات ----
  const [exams, setExams] = React.useState<ExamItem[]>([]);
  const [examsState, setExamsState] = React.useState<"loading" | "ok" | "error">("loading");
  const [examsTick, setExamsTick] = React.useState(0);

  // ---- الواجبات ----
  const [assignments, setAssignments] = React.useState<AssignmentItem[]>([]);
  const [assignmentsState, setAssignmentsState] = React.useState<"loading" | "ok" | "error">("loading");
  const [assignmentsTick, setAssignmentsTick] = React.useState(0);

  // round 24 — "جديد" tracking: which lesson items arrived since THIS
  // user's last visit to this course. Key is per-user (the round-12
  // lesson: browser-global keys leak across accounts on shared devices).
  // round 93 — the Telegram-lessons view is gone from the course, so the
  // per-course visit baseline tracked those items and was removed with it.
  const { user } = useAuth();
  const canManage = canManageRoles(user ?? null);

  // round 33 — المواد (library references linked to this module).
  // Owner request: "in the course materials I couldn't find a file upload
  // button" — this tab is exactly that: every course gets its own materials
  // list + a publish-from-Drive button for supervisors.
  const [materials, setMaterials] = React.useState<MaterialItem[]>([]);
  const [materialsState, setMaterialsState] = React.useState<"loading" | "ok" | "error">("loading");
  const [materialsNeedsSchema, setMaterialsNeedsSchema] = React.useState(false);
  const [materialsSchemaSql, setMaterialsSchemaSql] = React.useState<string | null>(null);
  const [materialsTick, setMaterialsTick] = React.useState(0);

  // round 39 — in-course actions (edit/delete dialogs + schedule push)
  const [materialToEdit, setMaterialToEdit] = React.useState<MaterialItem | null>(null);
  const [materialToDelete, setMaterialToDelete] = React.useState<MaterialItem | null>(null);
  const [deletingMaterial, setDeletingMaterial] = React.useState(false);
  const [examToEdit, setExamToEdit] = React.useState<ExamItem | null>(null);
  const [examToDelete, setExamToDelete] = React.useState<ExamItem | null>(null);
  const [deletingExam, setDeletingExam] = React.useState(false);
  const [addedExamIds, setAddedExamIds] = React.useState<Set<number>>(new Set());
  const [addingExamId, setAddingExamId] = React.useState<number | null>(null);
  const [assignmentToEdit, setAssignmentToEdit] = React.useState<AssignmentItem | null>(null);
  const [assignmentToDelete, setAssignmentToDelete] = React.useState<AssignmentItem | null>(null);
  const [deletingAssignment, setDeletingAssignment] = React.useState(false);
  const [assignmentDetails, setAssignmentDetails] = React.useState<AssignmentItem | null>(null);
  const [doneAssignments, setDoneAssignments] = React.useState<Record<string, boolean>>({});

  const moduleId = course?.id;

  // round 39 — hydrate the shared done-state once per mount
  React.useEffect(() => {
    try {
      setDoneAssignments(JSON.parse(localStorage.getItem(DONE_KEY) || "{}"));
    } catch {
      // private mode — toggles still work, they just start unchecked
    }
  }, []);

  React.useEffect(() => {
    if (!moduleId) return;
    let alive = true;
    setExamsState("loading");
    fetch("/api/exams", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!alive) return;
        const all: ExamItem[] = d.exams ?? [];
        setExams(all.filter((e) => e.moduleId === moduleId || (e as { moduleId?: number }).moduleId === moduleId));
        setExamsState("ok");
      })
      .catch(() => alive && setExamsState("error"));
    return () => { alive = false; };
  }, [moduleId, examsTick]);

  React.useEffect(() => {
    if (!moduleId) return;
    let alive = true;
    setAssignmentsState("loading");
    fetch(`/api/assignments?moduleId=${moduleId}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!alive) return;
        setAssignments(d.assignments ?? []);
        setAssignmentsState("ok");
      })
      .catch(() => alive && setAssignmentsState("error"));
    return () => { alive = false; };
  }, [moduleId, assignmentsTick]);

  React.useEffect(() => {
    if (!moduleId) return;
    let alive = true;
    setMaterialsState("loading");
    fetch(`/api/library?moduleId=${moduleId}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!alive) return;
        setMaterials(d.items ?? []);
        setMaterialsNeedsSchema(Boolean(d.needsSchema));
        setMaterialsSchemaSql(typeof d.sql === "string" ? d.sql : null);
        setMaterialsState("ok");
      })
      .catch(() => alive && setMaterialsState("error"));
    return () => { alive = false; };
  }, [moduleId, materialsTick]);

  // ---- round 39 handlers ----

  function copyMaterialLink(url: string) {
    navigator.clipboard?.writeText(url).then(
      () => toast.success("تم نسخ رابط المادة"),
      () => toast.error("تعذّر نسخ الرابط")
    ).catch(() => toast.error("تعذّر نسخ الرابط"));
  }

  function toggleAssignmentDone(id: number) {
    const nextVal = !doneAssignments[String(id)];
    const next = { ...doneAssignments, [String(id)]: nextVal };
    setDoneAssignments(next);
    try {
      localStorage.setItem(DONE_KEY, JSON.stringify(next));
    } catch {
      // private mode — UI state still flips for this session
    }
    toast.success(nextVal ? "أُشير إلى إنجاز الواجب" : "أُلغي الإنجاز");
  }

  // Exams live on a specific DATE, the personal timetable is weekly — the
  // exam lands on its weekday (1=الأحد … 7=السبت) with the full date kept
  // in the notes so nothing is lost.
  async function addExamToSchedule(e: ExamItem) {
    setAddingExamId(e.id);
    try {
      const d = new Date(e.examDate);
      const dayOfWeek = Number.isNaN(d.getTime()) ? 1 : Math.min(7, d.getDay() + 1);
      const res = await fetch("/api/schedule/personal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dayOfWeek,
          startTime: e.time && e.time !== "—" ? e.time : "09:00",
          endTime: "",
          moduleName: course?.name ?? "",
          type: "امتحان",
          room: e.room && e.room !== "—" ? e.room : "",
          notes: `${e.title} — ${formatDateAr(e.examDate)}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشل الإضافة إلى الجدول"); return; }
      setAddedExamIds((prev) => new Set(prev).add(e.id));
      toast.success("أُضيف الاختبار إلى جدولك الشخصي — تجده في شاشة الجدول");
    } catch {
      toast.error("فشل الاتصال");
    } finally {
      setAddingExamId(null);
    }
  }

  async function handleDeleteMaterial() {
    if (!materialToDelete) return;
    setDeletingMaterial(true);
    try {
      const res = await fetch(`/api/library?id=${materialToDelete.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشل الحذف"); return; }
      toast.success("تم حذف الملف من المقياس");
      setMaterialToDelete(null);
      setMaterialsTick((n) => n + 1);
    } catch {
      toast.error("فشل الحذف");
    } finally {
      setDeletingMaterial(false);
    }
  }

  async function handleDeleteExam() {
    if (!examToDelete) return;
    setDeletingExam(true);
    try {
      const res = await fetch(`/api/exams?id=${examToDelete.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشل الحذف"); return; }
      toast.success("تم حذف الاختبار");
      setExamToDelete(null);
      setExamsTick((n) => n + 1);
    } catch {
      toast.error("فشل الحذف");
    } finally {
      setDeletingExam(false);
    }
  }

  async function handleDeleteAssignment() {
    if (!assignmentToDelete) return;
    setDeletingAssignment(true);
    try {
      const res = await fetch(`/api/assignments?id=${assignmentToDelete.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشل الحذف"); return; }
      toast.success("تم حذف الواجب");
      setAssignmentToDelete(null);
      setAssignmentsTick((n) => n + 1);
    } catch {
      toast.error("فشل الحذف");
    } finally {
      setDeletingAssignment(false);
    }
  }

  // Deep link with an expired/absent course context
  if (!course) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-black mb-1">تفاصيل المقياس</h1>
        </div>
        <SectionEmpty
          icon={<BookOpen className="w-10 h-10" />}
          title="لم يُحدَّد المقياس"
          hint="افتح المقياس من قائمة المقاييس لعرض دروسه واختباراته وواجباته."
        />
        <Button variant="outline" className="w-full" onClick={() => navigate("COURSES")}>
          الذهاب إلى المقاييس
        </Button>
      </div>
    );
  }

  // round 52 — ملفات هذا المقياس المرفوعة تُقسّم بحسب تصنيفها: ملف «واجب»
  // يظهر في تبويب الواجبات، وملف «اختبار» في تبويب الاختبارات، وكل ما عدا
  // ذلك يُقرأ من «ملفاتي» (المكتبة المصنّفة) — لم تعد هناك قائمة «مواد»
  // منفصلة داخل المقياس.
  // round 54 — طلب المالك: ملف «محاضرة/درس» يُرفع ويُعرض داخل تبويب
  // الملفات أيضاً، مطابقًا لتبويبَي الواجبات والاختبارات.
  const assignmentFiles = materials.filter((m) => m.category === "واجب");
  const examFiles = materials.filter((m) => m.category === "اختبار");
  const lectureFiles = materials.filter((m) => m.category === "محاضرة");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <button
          onClick={navigateBack}
          className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 mb-2"
        >
          <ChevronLeft className="w-3.5 h-3.5 rotate-180" />
          العودة إلى المقاييس
        </button>
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <BookOpen className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-black leading-tight">{course.name}</h1>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {course.code && <Badge variant="outline" className="text-xs">{course.code}</Badge>}
              {course.category && <Badge variant="secondary" className="text-xs">{course.category}</Badge>}
              <Badge variant="outline" className="text-xs">
                السداسي {course.semester === 2 ? "الثاني" : "الأول"}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Meta strip */}
      <Card className="p-4 bg-primary/5 border-primary/20">
        <div className="grid grid-cols-4 gap-3 text-center">
          <div>
            <p className="text-[11px] text-muted-foreground mb-0.5">المعامل</p>
            <p className="text-lg font-black text-primary">{course.coefficient}</p>
          </div>
          <div className="border-x border-border/70">
            <p className="text-[11px] text-muted-foreground mb-0.5">الملفات</p>
            <p className="text-lg font-black text-primary">
              {materialsState === "loading" ? "…" : lectureFiles.length}
            </p>
          </div>
          <div className="border-x border-border/70">
            <p className="text-[11px] text-muted-foreground mb-0.5">الواجبات</p>
            <p className="text-lg font-black text-primary">
              {assignmentsState === "loading" ? "…" : assignments.length + assignmentFiles.length}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground mb-0.5">الاختبارات</p>
            <p className="text-lg font-black text-primary">
              {examsState === "loading" ? "…" : exams.length + examFiles.length}
            </p>
          </div>
        </div>
        {course.professorName && (
          <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border/60 text-xs text-muted-foreground">
            <User className="w-3.5 h-3.5" />
            <span>الأستاذ: <span className="font-bold text-foreground">{course.professorName}</span></span>
          </div>
        )}
      </Card>

      {/* Description — r57 (owner: «المقاييس التي لا وصف لها لا تحتاج بطاقة
          الوصف»): the card renders ONLY when the course actually has a
          description. Courses without one no longer show a placeholder
          «لا يوجد وصف متاح…» card. */}
      {course.description?.trim() ? (
        <Card className="p-4">
          <p className="text-xs font-bold text-muted-foreground mb-1.5">وصف المقياس</p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{course.description.trim()}</p>
        </Card>
      ) : null}

      {/* Round 40 — the upload entry lives at the COURSE level, not buried
          in one tab. Round 93 (طلب المالك: «تمكين الطلبة من رفع الملفات
          لكن تتم مراجعتها من طرف المشرف أولاً»): the row is for EVERYONE
          now — supervisors publish directly, students submit for review. */}
      <Card className={cn("p-3 border", canManage ? "border-primary/25 bg-primary/5" : "border-amber-500/30 bg-amber-500/5")}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold flex items-center gap-1.5">
              <CloudUpload className={cn("w-3.5 h-3.5 shrink-0", canManage ? "text-primary" : "text-amber-600 dark:text-amber-300")} />
              {canManage ? "رفع ملف لهذا المقياس" : "ارفع ملفاً لهذا المقياس"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              {canManage
                ? "ارفع ملفاً من جهازك أو أضف رابطاً — يظهر لدى الطلبة في «ملفاتي» مصنّفاً، وملف الدرس داخل تبويب الملفات، وملف الواجب داخل تبويب الواجبات، وملف الاختبار داخل تبويب الاختبارات، دون أن يُخزَّن شيء على السيرفر."
                : "ارفع ملفاً من جهازك أو أضف رابطاً — يظهر للطلبة بعد موافقة المشرف عليه، وتجده أنت في «ملفاتي» وهي بانتظار المراجعة."}
            </p>
          </div>
          <PublishToLibraryDialog
            onCreated={() => setMaterialsTick((n) => n + 1)}
            moduleId={course.id}
            defaultCategory="محاضرة"
            triggerLabel="رفع ملف"
            triggerClassName="shrink-0"
            courseName={course.name}
          />
        </div>
      </Card>

      {/* Content tabs — round 52: تبويب «المواد» أُلغي (ملاحظة المالك:
          «الدروس موجودة للمقاييس، فلماذا قسم للمواد؟»). ملفات الواجب
          والاختبار تُعرض داخل تبويبيهما، وكل الملفات في «ملفاتي».
          Round 93 (طلب المالك: «في قسم الدروس لا تظهر دروس تيليجرام»):
          تبويب «الدروس» بمنشورات تيليجرام أُزيل كلياً — تبويب «الملفات»
          يعرض ملفات المقياس المرفوعة فقط، وشاشة تيليجرام مستقلة كما هي. */}
      <Tabs defaultValue="files">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="files" className="data-[state=active]:font-bold text-xs px-1">
            <FileText className="w-3.5 h-3.5 ml-1" />الملفات
          </TabsTrigger>
          <TabsTrigger value="exams" className="data-[state=active]:font-bold text-xs px-1">
            <FlaskConical className="w-3.5 h-3.5 ml-1" />الاختبارات
          </TabsTrigger>
          <TabsTrigger value="assignments" className="data-[state=active]:font-bold text-xs px-1">
            <CheckSquare className="w-3.5 h-3.5 ml-1" />الواجبات
          </TabsTrigger>
        </TabsList>

        {/* ---- Files (round 93: كانت «الدروس» بمنشورات تيليجرام — أُزالت) ---- */}
        <TabsContent value="files" className="mt-4 space-y-3">
          {materialsState === "error" && (
            <SectionError onRetry={() => setMaterialsTick((n) => n + 1)} />
          )}
          {materialsState === "ok" && lectureFiles.length > 0 && (
            <div className="space-y-2">
              {lectureFiles.map((m) => (
                <CourseFileCard
                  key={m.id} m={m} canManage={canManage}
                  onEdit={() => setMaterialToEdit(m)}
                  onDelete={() => setMaterialToDelete(m)}
                  onCopy={() => copyMaterialLink(m.downloadUrl)}
                />
              ))}
            </div>
          )}
          {materialsState === "ok" && lectureFiles.length === 0 && (
            <SectionEmpty
              icon={<GraduationCap className="w-10 h-10" />}
              title="لا توجد ملفات دروس لهذا المقياس بعد"
              hint="ملفات الدروس التي يرفعها المشرفون — والطلبة بعد موافقة المشرف — تظهر هنا، وتُقرأ أيضاً من «ملفاتي» في المكتبة المصنّفة."
            />
          )}
        </TabsContent>

        {/* ---- Exams ---- */}
        <TabsContent value="exams" className="mt-4 space-y-3">
          {/* round 52 — ملف اختبار يُرفع مباشرة من تبويبه */}
          {canManage && (
            <PublishToLibraryDialog
              onCreated={() => setMaterialsTick((n) => n + 1)}
              moduleId={course.id}
              defaultCategory="اختبار"
              triggerLabel="رفع ملف اختبار"
              courseName={course.name}
            />
          )}
          {materialsState === "error" && (
            <SectionError onRetry={() => setMaterialsTick((n) => n + 1)} />
          )}
          {materialsState === "ok" && examFiles.length > 0 && (
            <div className="space-y-2">
              {examFiles.map((m) => (
                <CourseFileCard
                  key={m.id} m={m} canManage={canManage}
                  onEdit={() => setMaterialToEdit(m)}
                  onDelete={() => setMaterialToDelete(m)}
                  onCopy={() => copyMaterialLink(m.downloadUrl)}
                />
              ))}
            </div>
          )}
          {examsState === "loading" && <SectionLoading />}
          {examsState === "error" && (
            <SectionError onRetry={() => setExamsTick((n) => n + 1)} />
          )}
          {examsState === "ok" && exams.length === 0 && examFiles.length === 0 && (
            <SectionEmpty
              icon={<FlaskConical className="w-10 h-10" />}
              title="لا توجد اختبارات مسجّلة لهذا المقياس"
              hint="عندما يضيف المشرف موعد اختبار أو يرفع ملف اختبار لهذا المقياس سيظهر هنا وستصلك التفاصيل."
            />
          )}
          {examsState === "ok" && exams.length > 0 && exams.map((e) => (
            <Card key={e.id} className="p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  <p className="font-bold text-sm">{e.title}</p>
                  {/* round 93 — النوع المُسمّى للظهرات غير «اختبار» */}
                  {e.kind && e.kind !== "اختبار" && (
                    <Badge className="text-[10px] bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-500/30 shrink-0">
                      {e.kind}
                    </Badge>
                  )}
                </div>
                {e.isFinished ? (
                  <Badge variant="secondary" className="text-[10px] shrink-0">انتهى</Badge>
                ) : (
                  <Badge className="text-[10px] shrink-0 bg-primary/10 text-primary border border-primary/20">قادم</Badge>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />{e.examDate ? formatDateAr(e.examDate) : "—"}</span>
                <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{e.time || "—"}</span>
                <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{e.room || "—"}</span>
              </div>
              {/* round 39 — real actions, not a dead card */}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/60 flex-wrap">
                <Button
                  size="sm" variant="outline" className="h-8"
                  disabled={!e.examDate || addedExamIds.has(e.id) || addingExamId === e.id}
                  onClick={() => addExamToSchedule(e)}
                >
                  {addingExamId === e.id ? (
                    <Loader2 className="w-3.5 h-3.5 ml-1 animate-spin" />
                  ) : addedExamIds.has(e.id) ? (
                    <Check className="w-3.5 h-3.5 ml-1 text-emerald-600" />
                  ) : (
                    <CalendarPlus className="w-3.5 h-3.5 ml-1" />
                  )}
                  {addedExamIds.has(e.id) ? "أُضيف إلى جدولي" : "أضف إلى جدولي"}
                </Button>
                {canManage && (
                  <div className="ms-auto flex items-center gap-0.5">
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8"
                      onClick={() => setExamToEdit(e)}
                      aria-label="تعديل الاختبار"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      onClick={() => setExamToDelete(e)}
                      aria-label="حذف الاختبار"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </TabsContent>

        {/* ---- Assignments ---- */}
        <TabsContent value="assignments" className="mt-4 space-y-3">
          {/* round 52 — ملف واجب يُرفع مباشرة من تبويبه */}
          {canManage && (
            <PublishToLibraryDialog
              onCreated={() => setMaterialsTick((n) => n + 1)}
              moduleId={course.id}
              defaultCategory="واجب"
              triggerLabel="رفع ملف واجب"
              courseName={course.name}
            />
          )}
          {materialsState === "error" && (
            <SectionError onRetry={() => setMaterialsTick((n) => n + 1)} />
          )}
          {materialsState === "ok" && assignmentFiles.length > 0 && (
            <div className="space-y-2">
              {assignmentFiles.map((m) => (
                <CourseFileCard
                  key={m.id} m={m} canManage={canManage}
                  onEdit={() => setMaterialToEdit(m)}
                  onDelete={() => setMaterialToDelete(m)}
                  onCopy={() => copyMaterialLink(m.downloadUrl)}
                />
              ))}
            </div>
          )}
          {assignmentsState === "loading" && <SectionLoading />}
          {assignmentsState === "error" && (
            <SectionError onRetry={() => setAssignmentsTick((n) => n + 1)} />
          )}
          {assignmentsState === "ok" && assignments.length === 0 && assignmentFiles.length === 0 && (
            <SectionEmpty
              icon={<CheckSquare className="w-10 h-10" />}
              title="لا توجد واجبات مفتوحة لهذا المقياس"
              hint="عند تكليف واجب جديد أو رفع ملف واجب لهذا المقياس سيظهر هنا مع تاريخ التسليم والعلامة القصوى."
            />
          )}
          {assignmentsState === "ok" && assignments.length > 0 && assignments.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-start gap-2.5">
                {/* round 39 — done-toggle shares the assignments screen key */}
                <button
                  onClick={() => toggleAssignmentDone(a.id)}
                  className="mt-0.5 shrink-0"
                  aria-label="تبديل الإنجاز"
                >
                  {doneAssignments[String(a.id)] ? (
                    <CheckSquare className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <Square className="w-5 h-5 text-muted-foreground" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className={cn(
                      "font-bold text-sm",
                      doneAssignments[String(a.id)] && "line-through text-muted-foreground"
                    )}>
                      {a.title}
                    </p>
                    <Badge variant="outline" className="text-[10px] shrink-0">العلامة: {a.maxScore}</Badge>
                  </div>
                  {a.dueDate && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <CalendarDays className="w-3.5 h-3.5" />التسليم: {formatDateAr(a.dueDate)}
                    </p>
                  )}
                  {a.description && (
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed line-clamp-3">{a.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/60 flex-wrap">
                    <Button
                      size="sm" variant="outline" className="h-8"
                      onClick={() => setAssignmentDetails(a)}
                    >
                      <Eye className="w-3.5 h-3.5 ml-1" />التفاصيل
                    </Button>
                    <ReportAssignmentDialog title={a.title} />
                    {canManage && (
                      <div className="ms-auto flex items-center gap-0.5">
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8"
                          onClick={() => setAssignmentToEdit(a)}
                          aria-label="تعديل الواجب"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          onClick={() => setAssignmentToDelete(a)}
                          aria-label="حذف الواجب"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      {/* ---- round 39 — dialogs (edit / delete / details) ---- */}
      {materialToEdit && (
        <EditMaterialDialog
          item={materialToEdit}
          onClose={() => setMaterialToEdit(null)}
          onSaved={() => { setMaterialToEdit(null); setMaterialsTick((n) => n + 1); }}
        />
      )}
      {materialToDelete && (
        <Dialog open onOpenChange={() => setMaterialToDelete(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2">
                <Trash2 className="w-5 h-5" />حذف ملف من المقياس
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm">
              هل تريد حذف <strong>{materialToDelete.title}</strong> من ملفات هذا المقياس؟
              سيختفي من قائمة كل الطلبة — لا يمكن التراجع.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMaterialToDelete(null)}>إلغاء</Button>
              <Button variant="destructive" onClick={handleDeleteMaterial} disabled={deletingMaterial}>
                {deletingMaterial && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حذف نهائي
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {examToEdit && (
        <EditExamDialog
          exam={examToEdit}
          onClose={() => setExamToEdit(null)}
          onSaved={() => { setExamToEdit(null); setExamsTick((n) => n + 1); }}
        />
      )}
      {examToDelete && (
        <Dialog open onOpenChange={() => setExamToDelete(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2">
                <Trash2 className="w-5 h-5" />حذف اختبار
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm">
              هل تريد حذف <strong>{examToDelete.title}</strong>؟ لا يمكن التراجع.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setExamToDelete(null)}>إلغاء</Button>
              <Button variant="destructive" onClick={handleDeleteExam} disabled={deletingExam}>
                {deletingExam && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حذف نهائي
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {assignmentToEdit && (
        <EditAssignmentDialog
          assignment={assignmentToEdit}
          onClose={() => setAssignmentToEdit(null)}
          onSaved={() => { setAssignmentToEdit(null); setAssignmentsTick((n) => n + 1); }}
        />
      )}
      {assignmentToDelete && (
        <Dialog open onOpenChange={() => setAssignmentToDelete(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2">
                <Trash2 className="w-5 h-5" />حذف واجب
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm">
              هل تريد حذف <strong>{assignmentToDelete.title}</strong>؟ لا يمكن التراجع.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignmentToDelete(null)}>إلغاء</Button>
              <Button variant="destructive" onClick={handleDeleteAssignment} disabled={deletingAssignment}>
                {deletingAssignment && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حذف نهائي
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {assignmentDetails && (
        <AssignmentDetailsDialog
          assignment={assignmentDetails}
          onClose={() => setAssignmentDetails(null)}
        />
      )}
    </div>
  );
}

// ---- round 39 components ----

// round 52 — بطاقة ملف مرفوع داخل المقياس (واجب/اختبار): عنوانه هو الرابط،
// مع تنزيل مباشر من Drive ونسخ الرابط وتعديل/حذف للمشرفين.
function CourseFileCard({ m, canManage, onEdit, onDelete, onCopy }: {
  m: MaterialItem;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {m.downloadUrl ? (
              <a
                href={m.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-sm text-primary hover:underline"
              >
                {m.title}
              </a>
            ) : (
              <h3 className="font-bold text-sm">{m.title}</h3>
            )}
            <Badge variant="secondary" className="text-xs">{m.category}</Badge>
            <Badge variant="outline" className="text-xs">{m.fileFormat}</Badge>
            {/* round 93 — حالة المراجعة للملفات المرفوعة من الطلبة */}
            {m.reviewStatus === "pending" && (
              <Badge className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                بانتظار مراجعة المشرف
              </Badge>
            )}
            {m.reviewStatus === "rejected" && (
              <Badge className="text-[10px] bg-red-500/15 text-red-600 dark:text-red-300 border border-red-500/30">
                لم تتم الموافقة
              </Badge>
            )}
            {m.fileSize != null && (
              <Badge variant="outline" className="text-xs">{formatBytes(m.fileSize)}</Badge>
            )}
            {m.driveFileId && (
              <Badge className="text-[10px] bg-primary/10 text-primary border border-primary/20">
                <HardDrive className="w-3 h-3 ml-1" />على Drive
              </Badge>
            )}
            {!m.downloadUrl && (
              <Badge variant="outline" className="text-xs text-muted-foreground">بدون رابط</Badge>
            )}
          </div>
          {m.description && (
            <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{m.description}</p>
          )}
          {m.author && (
            <p className="text-xs text-muted-foreground mt-2">بواسطة: {m.author}</p>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          {m.downloadUrl && (
            <a href={m.downloadUrl} target="_blank" rel="noopener noreferrer">
              {m.driveFileId ? (
                <Button size="sm" variant="outline" className="h-8"><Download className="w-3.5 h-3.5 ml-1" />تنزيل</Button>
              ) : (
                <Button size="sm" variant="outline" className="h-8"><ExternalLink className="w-3.5 h-3.5 ml-1" />فتح</Button>
              )}
            </a>
          )}
          <div className="flex items-center gap-0.5">
            {m.downloadUrl && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-primary"
                onClick={onCopy}
                aria-label="نسخ رابط الملف"
              >
                <Copy className="w-4 h-4" />
              </Button>
            )}
            {canManage && (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} aria-label="تعديل الملف">
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost" size="icon"
                  className="h-8 w-8 text-destructive hover:bg-destructive/10"
                  onClick={onDelete}
                  aria-label="حذف الملف"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

// edit a course material (fix a broken link / typo in place — mirrors the
// library screen's edit dialog, PATCH /api/library)
function EditMaterialDialog({ item, onClose, onSaved }: {
  item: MaterialItem; onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = React.useState(item.title);
  const [author, setAuthor] = React.useState(item.author);
  const [category, setCategory] = React.useState(item.category);
  const [fileFormat, setFileFormat] = React.useState(item.fileFormat);
  const [downloadUrl, setDownloadUrl] = React.useState(item.downloadUrl);
  const [description, setDescription] = React.useState(item.description);
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    if (!title.trim()) { toast.error("العنوان مطلوب"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/library", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          title: title.trim(), author: author.trim(), category: category.trim(),
          fileFormat: fileFormat.trim(), downloadUrl: downloadUrl.trim(),
          description: description.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشل الحفظ"); return; }
      toast.success("تم تعديل المادة");
      onSaved();
    } catch {
      toast.error("فشل الاتصال");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-primary" />تعديل مادة المقياس
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="editMatTitle">العنوان</Label>
            <Input id="editMatTitle" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="editMatAuthor">المؤلف / المُعد</Label>
              <Input id="editMatAuthor" value={author} onChange={(e) => setAuthor(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="editMatFormat">الصيغة</Label>
              <select
                id="editMatFormat" value={fileFormat}
                onChange={(e) => setFileFormat(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="PDF">PDF</option>
                <option value="DOCX">DOCX</option>
                <option value="PPTX">PPTX</option>
                <option value="صورة">صورة</option>
                <option value="رابط">رابط</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="editMatCategory">التصنيف</Label>
            <select
              id="editMatCategory" value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="محاضرة">محاضرة</option>
              <option value="ملخص">ملخص</option>
              <option value="سلسلة تمارين">سلسلة تمارين</option>
              <option value="كتاب مرجعي">كتاب مرجعي</option>
              <option value="محاضرة مصورة">محاضرة مصورة</option>
              <option value="أخرى">أخرى</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="editMatUrl">رابط الملف</Label>
            <Input
              id="editMatUrl" value={downloadUrl} dir="ltr"
              onChange={(e) => setDownloadUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="editMatDesc">وصف مختصر</Label>
            <Textarea id="editMatDesc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حفظ التعديلات
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// edit an exam from inside the course (module stays fixed — the supervisor
// is already in the course context; mirrors PATCH /api/exams)
function EditExamDialog({ exam, onClose, onSaved }: {
  exam: ExamItem; onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = React.useState(exam.title);
  const [examDate, setExamDate] = React.useState(exam.examDate);
  const [time, setTime] = React.useState(exam.time === "—" ? "09:00" : exam.time);
  const [room, setRoom] = React.useState(exam.room === "—" ? "" : exam.room);
  const [coefficient, setCoefficient] = React.useState(String(exam.coefficient));
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    if (!title.trim()) { toast.error("اكتب عنوان الاختبار"); return; }
    if (!examDate) { toast.error("اختر التاريخ"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/exams", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: exam.id, moduleId: exam.moduleId,
          title: title.trim(), examDate, time,
          room: room.trim(), coefficient: parseFloat(coefficient) || 2,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشل الحفظ"); return; }
      toast.success("تم تعديل الاختبار");
      onSaved();
    } catch {
      toast.error("فشل الاتصال");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-primary" />تعديل الاختبار
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="cdExamTitle">عنوان الاختبار</Label>
            <Input id="cdExamTitle" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="cdExamDate">التاريخ</Label>
              <Input id="cdExamDate" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cdExamTime">الوقت</Label>
              <Input id="cdExamTime" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="cdExamRoom">القاعة</Label>
              <Input id="cdExamRoom" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="مثال: قاعة 12" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cdExamCoef">المعامل</Label>
              <Input id="cdExamCoef" type="number" value={coefficient} onChange={(e) => setCoefficient(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حفظ التعديل
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// edit an assignment from inside the course (mirrors PATCH /api/assignments)
function EditAssignmentDialog({ assignment, onClose, onSaved }: {
  assignment: AssignmentItem; onClose: () => void; onSaved: () => void;
}) {
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
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: assignment.id, title: title.trim(), dueDate,
          description: description.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشل الحفظ"); return; }
      toast.success("تم تعديل الواجب");
      onSaved();
    } catch {
      toast.error("فشل الاتصال");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-primary" />تعديل الواجب
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="cdAsgTitle">عنوان الواجب</Label>
            <Input id="cdAsgTitle" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cdAsgDue">تاريخ التسليم</Label>
            <Input id="cdAsgDue" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cdAsgDesc">الوصف</Label>
            <Textarea id="cdAsgDesc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حفظ التعديل
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// full assignment details — the card clamps the description to 3 lines,
// long instructions were unreadable inside the course
function AssignmentDetailsDialog({ assignment, onClose }: {
  assignment: AssignmentItem; onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" />تفاصيل الواجب
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="font-bold text-sm">{assignment.title}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs">العلامة: {assignment.maxScore}</Badge>
            {assignment.dueDate && (
              <Badge variant="outline" className="text-xs gap-1">
                <CalendarDays className="w-3 h-3" />التسليم: {formatDateAr(assignment.dueDate)}
              </Badge>
            )}
          </div>
          {assignment.description ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap border-t border-border/60 pt-3">
              {assignment.description}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">لا يوجد وصف مفصّل لهذا الواجب.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// report a wrong assignment from inside the course (same /api/issues flow
// as the assignments screen)
function ReportAssignmentDialog({ title }: { title: string }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function handleReport() {
    if (!reason.trim()) { toast.error("اكتب وصف المشكلة"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemType: "واجب وتكليف", itemTitle: title, description: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشل الإرسال"); return; }
      toast.success("تم إرسال التبليغ بنجاح");
      setOpen(false);
      setReason("");
    } catch {
      toast.error("فشل الاتصال");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-amber-600">
          <Flag className="w-3.5 h-3.5 ml-1" />تبليغ
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>تبليغ عن خطأ في الواجب</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-xs text-muted-foreground">الواجب: <span className="font-bold">{title}</span></p>
          <div className="space-y-1.5">
            <Label htmlFor="cdReportReason">وصف المشكلة</Label>
            <Textarea
              id="cdReportReason" value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثال: تاريخ التسليم غير صحيح..." rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          <Button onClick={handleReport} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}إرسال التبليغ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
