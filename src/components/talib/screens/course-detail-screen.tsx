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
 *   • الدروس والمحاضرات  ← telegram_items linked by module_id
 *   • الاختبارات         ← exams linked by module_id
 *   • الواجبات           ← assignments linked by module_id
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
  BookOpen, FlaskConical, CheckSquare, Send, Loader2, ExternalLink,
  FileText, ImageIcon, Video, Headphones, File, MessageSquare, LinkIcon,
  CalendarDays, Clock, MapPin, User, GraduationCap, AlertTriangle,
  RefreshCw, ChevronLeft, Star, Sparkles, Download, HardDrive,
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
import { PublishToLibraryDialog } from "@/components/talib/cloud/publish-dialog";
import { cn, formatBytes } from "@/lib/utils";

// Mirror of /api/telegram/items response (module-filtered)
interface TgItem {
  id: number;
  kind: string;
  titleAr: string;
  captionText: string;
  fileName: string;
  mimeType: string;
  fileId: string;
  sizeBytes: number;
  link: string;
  itemType: string;
  origin: string;
  postedBy: string;
  isFeatured: boolean;
  postedAt: string | null;
}

interface ExamItem {
  id: number;
  moduleId: number; // /api/exams returns it on both layers; was missing from this mirror (tsc error + cast hack)
  title: string;
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
}

function kindIcon(kind: string, className = "w-4 h-4") {
  switch (kind) {
    case "pdf": return <FileText className={className} />;
    case "image": return <ImageIcon className={className} />;
    case "video": return <Video className={className} />;
    case "audio": return <Headphones className={className} />;
    case "doc": case "ppt": return <File className={className} />;
    case "text": return <MessageSquare className={className} />;
    case "link": return <LinkIcon className={className} />;
    default: return <File className={className} />;
  }
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

  // ---- الدروس (telegram items linked to this module) ----
  const [lessons, setLessons] = React.useState<TgItem[]>([]);
  const [lessonsState, setLessonsState] = React.useState<"loading" | "ok" | "error">("loading");
  const [lessonsTick, setLessonsTick] = React.useState(0);

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
  const { user } = useAuth();
  const [newLessonIds, setNewLessonIds] = React.useState<Set<number>>(new Set());
  const canManage = canManageRoles(user ?? null);

  // round 33 — المواد (library references linked to this module).
  // Owner request: "in the course materials I couldn't find a file upload
  // button" — this tab is exactly that: every course gets its own materials
  // list + a publish-from-Drive button for supervisors.
  const [materials, setMaterials] = React.useState<MaterialItem[]>([]);
  const [materialsState, setMaterialsState] = React.useState<"loading" | "ok" | "error">("loading");
  const [materialsNeedsSchema, setMaterialsNeedsSchema] = React.useState(false);
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
    setLessonsState("loading");
    fetch(`/api/telegram/items?moduleId=${moduleId}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!alive) return;
        const items: TgItem[] = d.items ?? [];
        setLessons(items);
        setLessonsState("ok");
        // mark what is new since the last visit, THEN advance the baseline
        const visitKey = `talib-course-visit-${user?.id ?? 0}-${moduleId}`;
        let lastVisit: string | null = null;
        try {
          lastVisit = localStorage.getItem(visitKey);
        } catch {
          // private mode — badges simply never show
        }
        const fresh = new Set<number>();
        if (lastVisit) {
          for (const it of items) {
            if (it.postedAt && String(it.postedAt) > lastVisit) fresh.add(it.id);
          }
        }
        setNewLessonIds(fresh);
        try {
          localStorage.setItem(visitKey, new Date().toISOString());
        } catch {
          // private mode — nothing to remember
        }
      })
      .catch(() => alive && setLessonsState("error"));
    return () => { alive = false; };
  }, [moduleId, lessonsTick, user?.id]);

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
      toast.success("تم حذف المادة من المقياس");
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

  const featured = lessons.filter((l) => l.isFeatured);
  const sortedLessons = [...lessons].sort((a, b) => {
    if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
    return (b.postedAt ?? "").localeCompare(a.postedAt ?? "");
  });

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
            <p className="text-[11px] text-muted-foreground mb-0.5">الدروس</p>
            <p className="text-lg font-black text-primary">
              {lessonsState === "loading" ? "…" : lessons.length}
            </p>
          </div>
          <div className="border-x border-border/70">
            <p className="text-[11px] text-muted-foreground mb-0.5">المواد</p>
            <p className="text-lg font-black text-primary">
              {materialsState === "loading" ? "…" : materials.length}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground mb-0.5">الاختبارات</p>
            <p className="text-lg font-black text-primary">
              {examsState === "loading" ? "…" : exams.length}
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

      {/* Description */}
      <Card className="p-4">
        <p className="text-xs font-bold text-muted-foreground mb-1.5">وصف المقياس</p>
        <p className="text-sm leading-relaxed">
          {course.description?.trim()
            || "لا يوجد وصف متاح لهذا المقياس بعد — يمكن للمشرفين إضافته لاحقاً."}
        </p>
      </Card>

      {/* Round 40 — the upload entry lives at the COURSE level, not buried
          in one tab: a supervisor opening ANY course sees the Drive upload
          immediately on every tab («some courses have no upload buttons»).
          Storage story in one line: the supervisor's own Drive becomes the
          shared space students download from — zero bytes on Supabase.
          Students never see this row (canManage gates it). */}
      {canManage && (
        <Card className="p-3 border-primary/25 bg-primary/5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-primary shrink-0" />
                رفع ملف لهذا المقياس
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                إلى Google Drive الخاص بك — مساحة مشتركة يحمّل منها الطلبة
                الملفات مباشرة، دون أن يُخزَّن شيء على السيرفر.
              </p>
            </div>
            <PublishToLibraryDialog
              onCreated={() => setMaterialsTick((n) => n + 1)}
              moduleId={course.id}
              defaultCategory="محاضرة"
              triggerLabel="رفع ملف (Drive)"
              triggerClassName="shrink-0"
            />
          </div>
        </Card>
      )}

      {/* Content tabs */}
      <Tabs defaultValue="lessons">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="lessons" className="data-[state=active]:font-bold text-xs px-1">
            <Send className="w-3.5 h-3.5 ml-1" />الدروس
          </TabsTrigger>
          <TabsTrigger value="materials" className="data-[state=active]:font-bold text-xs px-1">
            <FileText className="w-3.5 h-3.5 ml-1" />المواد
          </TabsTrigger>
          <TabsTrigger value="exams" className="data-[state=active]:font-bold text-xs px-1">
            <FlaskConical className="w-3.5 h-3.5 ml-1" />الاختبارات
          </TabsTrigger>
          <TabsTrigger value="assignments" className="data-[state=active]:font-bold text-xs px-1">
            <CheckSquare className="w-3.5 h-3.5 ml-1" />الواجبات
          </TabsTrigger>
        </TabsList>

        {/* ---- Lessons ---- */}
        <TabsContent value="lessons" className="mt-4 space-y-3">
          {lessonsState === "loading" && <SectionLoading />}
          {lessonsState === "error" && (
            <SectionError onRetry={() => setLessonsTick((n) => n + 1)} />
          )}
          {lessonsState === "ok" && sortedLessons.length === 0 && (
            <>
              <SectionEmpty
                icon={<GraduationCap className="w-10 h-10" />}
                title="لا توجد دروس منشورة لهذا المقياس بعد"
                hint="الدروس المنشورة في قنوات تيليجرام ومساحة الفوج ومرتبطة بهذا المقياس ستظهر هنا تلقائياً."
              />
              <Button variant="outline" className="w-full" onClick={() => navigate("TELEGRAM")}>
                <Send className="w-4 h-4 ml-1" />تصفّح دروس تيليجرام الكاملة
              </Button>
            </>
          )}
          {lessonsState === "ok" && sortedLessons.length > 0 && (
            <>
              {newLessonIds.size > 0 && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  {newLessonIds.size} درساً جديداً منذ آخر زيارة
                </p>
              )}
              {featured.length > 0 && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Star className="w-3 h-3 text-amber-500" />
                  {featured.length} درس مُميَّز من المشرفين
                </p>
              )}
              {sortedLessons.map((item) => (
                <LessonCard key={item.id} item={item} isNew={newLessonIds.has(item.id)} />
              ))}
              <Button variant="outline" className="w-full" onClick={() => navigate("TELEGRAM")}>
                <Send className="w-4 h-4 ml-1" />تصفّح دروس تيليجرام الكاملة
              </Button>
            </>
          )}
        </TabsContent>

        {/* ---- المواد (round 33) ---- */}
        <TabsContent value="materials" className="mt-4 space-y-3">
          {canManage && (
            <PublishToLibraryDialog
              onCreated={() => setMaterialsTick((n) => n + 1)}
              moduleId={course.id}
              defaultCategory="محاضرة"
              triggerLabel="إضافة مادة للمقياس"
            />
          )}

          {materialsState === "loading" && <SectionLoading />}
          {materialsState === "error" && (
            <SectionError onRetry={() => setMaterialsTick((n) => n + 1)} />
          )}
          {materialsState === "ok" && materialsNeedsSchema && (
            <Card className="p-4 border-amber-500/30 bg-amber-500/5">
              <p className="text-xs leading-relaxed">
                لربط المواد بهذا المقياس يحتاج عمود واحد في قاعدة البيانات
                (لمرة واحدة فقط). بعد إضافته تظهر المواد هنا تلقائياً — حتى
                ذلك الحين تُحفظ المواد الجديدة في المكتبة العامة.
              </p>
            </Card>
          )}
          {materialsState === "ok" && !materialsNeedsSchema && materials.length === 0 && (
            <SectionEmpty
              icon={<FileText className="w-10 h-10" />}
              title="لا توجد مواد مرفوعة لهذا المقياس بعد"
              hint={canManage
                ? "استخدم زر «رفع ملف (Drive)» أعلى الصفحة — يُحفظ الملف في حساب Drive الخاص بك ويصبح متاحاً لكل الطلبة للتنزيل المباشر."
                : "ستظهر محاضرات وملخصات هذا المقياس هنا عند رفعها من طرف المشرفين."}
            />
          )}
          {materialsState === "ok" && materials.length > 0 && (
            <div className="space-y-2">
              {materials.map((m) => (
                <Card key={m.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* round 39 — the title IS the reference: clickable
                            whenever a URL exists, not just dead words */}
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
                        <Badge variant="outline" className="text-xs">{m.fileFormat}</Badge>
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
                            onClick={() => copyMaterialLink(m.downloadUrl)}
                            aria-label="نسخ رابط المادة"
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        )}
                        {canManage && (
                          <>
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8"
                              onClick={() => setMaterialToEdit(m)}
                              aria-label="تعديل المادة"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10"
                              onClick={() => setMaterialToDelete(m)}
                              aria-label="حذف المادة"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---- Exams ---- */}
        <TabsContent value="exams" className="mt-4 space-y-3">
          {examsState === "loading" && <SectionLoading />}
          {examsState === "error" && (
            <SectionError onRetry={() => setExamsTick((n) => n + 1)} />
          )}
          {examsState === "ok" && exams.length === 0 && (
            <SectionEmpty
              icon={<FlaskConical className="w-10 h-10" />}
              title="لا توجد اختبارات مسجّلة لهذا المقياس"
              hint="عندما يضيف المشرف موعد اختبار لهذا المقياس سيظهر هنا وستصلك التفاصيل."
            />
          )}
          {examsState === "ok" && exams.length > 0 && exams.map((e) => (
            <Card key={e.id} className="p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="font-bold text-sm">{e.title}</p>
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
          {assignmentsState === "loading" && <SectionLoading />}
          {assignmentsState === "error" && (
            <SectionError onRetry={() => setAssignmentsTick((n) => n + 1)} />
          )}
          {assignmentsState === "ok" && assignments.length === 0 && (
            <SectionEmpty
              icon={<CheckSquare className="w-10 h-10" />}
              title="لا توجد واجبات مفتوحة لهذا المقياس"
              hint="عند تكليف واجب جديد بهذا المقياس سيظهر هنا مع تاريخ التسليم والعلامة القصوى."
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
                <Trash2 className="w-5 h-5" />حذف مادة من المقياس
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm">
              هل تريد حذف <strong>{materialToDelete.title}</strong> من مواد هذا المقياس؟
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

function LessonCard({ item, isNew }: { item: TgItem; isNew: boolean }) {
  const [imgError, setImgError] = React.useState(false);
  const isImage = item.kind === "image" && !!item.fileId;
  return (
    <Card className={cn("p-3.5", isNew && "border-primary/40")}>
      <div className="flex items-start gap-3">
        {/* معاينة مصغّرة للصور — كانت الدروس كلمات بلا هوية بصرية */}
        <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 flex items-center justify-center bg-muted">
          {isImage && !imgError ? (
            <img
              src={`/api/telegram/file?file_id=${encodeURIComponent(item.fileId)}`}
              alt={item.titleAr || "معاينة"}
              loading="lazy"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-primary">{kindIcon(item.kind, "w-5 h-5")}</div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="font-bold text-sm truncate">{item.titleAr || item.fileName || "منشور"}</p>
            {isNew && (
              <Badge className="text-[10px] bg-primary text-primary-foreground shrink-0">
                جديد
              </Badge>
            )}
            {item.isFeatured && <Star className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="outline" className="text-[10px]">{item.itemType}</Badge>
            {item.postedBy && (
              <span className="text-[11px] text-muted-foreground">{item.postedBy}</span>
            )}
            {item.postedAt && (
              <span className="text-[11px] text-muted-foreground">{formatDateAr(item.postedAt)}</span>
            )}
            {item.sizeBytes > 0 && (
              <span className="text-[11px] text-muted-foreground">{formatBytes(item.sizeBytes)}</span>
            )}
          </div>
          {item.captionText && (
            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">
              {item.captionText}
            </p>
          )}
        </div>
        {item.link && (
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0"
            aria-label={`فتح ${item.titleAr || "المنشور"} في تيليجرام`}
          >
            {/* round 39 — زر ظاهر بعنوان، بدل أيقونة شبح لا يلاحظها أحد */}
            <Button variant="outline" size="sm" className="h-8">
              <ExternalLink className="w-3.5 h-3.5 ml-1" />فتح
            </Button>
          </a>
        )}
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
