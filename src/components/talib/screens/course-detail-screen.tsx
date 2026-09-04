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
 */

import * as React from "react";
import {
  BookOpen, FlaskConical, CheckSquare, Send, Loader2, ExternalLink,
  FileText, ImageIcon, Video, Headphones, File, MessageSquare, LinkIcon,
  CalendarDays, Clock, MapPin, User, GraduationCap, AlertTriangle,
  RefreshCw, ChevronLeft, Star, Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { useShell, type CourseSummary } from "@/app/app/page";
import { cn } from "@/lib/utils";

// Mirror of /api/telegram/items response (module-filtered)
interface TgItem {
  id: number;
  kind: string;
  titleAr: string;
  captionText: string;
  fileName: string;
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
  const { t } = useI18n();
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

  const moduleId = course?.id;

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
        <div className="grid grid-cols-3 gap-3 text-center">
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

      {/* Content tabs */}
      <Tabs defaultValue="lessons">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="lessons" className="data-[state=active]:font-bold text-xs">
            <Send className="w-3.5 h-3.5 ml-1" />الدروس
          </TabsTrigger>
          <TabsTrigger value="exams" className="data-[state=active]:font-bold text-xs">
            <FlaskConical className="w-3.5 h-3.5 ml-1" />الاختبارات
          </TabsTrigger>
          <TabsTrigger value="assignments" className="data-[state=active]:font-bold text-xs">
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
                <Card key={item.id} className={cn("p-3.5", newLessonIds.has(item.id) && "border-primary/40")}>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      {kindIcon(item.kind)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-bold text-sm truncate">{item.titleAr || item.fileName || "منشور"}</p>
                        {newLessonIds.has(item.id) && (
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
                        aria-label="فتح المنشور الأصلي"
                      >
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </a>
                    )}
                  </div>
                </Card>
              ))}
              <Button variant="outline" className="w-full" onClick={() => navigate("TELEGRAM")}>
                <Send className="w-4 h-4 ml-1" />تصفّح دروس تيليجرام الكاملة
              </Button>
            </>
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
                <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />{e.examDate || "—"}</span>
                <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{e.time || "—"}</span>
                <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{e.room || "—"}</span>
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
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="font-bold text-sm">{a.title}</p>
                <Badge variant="outline" className="text-[10px] shrink-0">العلامة: {a.maxScore}</Badge>
              </div>
              {a.dueDate && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <CalendarDays className="w-3.5 h-3.5" />التسليم: {a.dueDate}
                </p>
              )}
              {a.description && (
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed line-clamp-3">{a.description}</p>
              )}
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
