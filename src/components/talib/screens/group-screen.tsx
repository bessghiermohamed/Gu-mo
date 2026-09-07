"use client";

/**
 * Group screen — round 52 upgrade («قسم الفوج يحتاج ميزات إضافية منها
 * الواجبات»): كان قائمة أعضاء فقط. الآن ثلاثة تبويبات:
 *   • الأعضاء     — نفس القائمة السابقة + بطاقة ممثل الفوج
 *   • الواجبات    — واجبات التخصص مع تبديل الإنجاز (نفس مفتاح تخزين شاشة
 *                   الواجبات فيُنجز هنا فيُنجز هناك)
 *   • الإعلانات   — إعلانات النطاق (التخصص/السنة/الفوج) بعد ربط النطاق،
 *                   فتجد هنا ما يستهدف فوجك تحديداً
 */

import * as React from "react";
import {
  Users, UserCheck, GraduationCap, AlertTriangle,
  CheckSquare, Square, Megaphone, AlertCircle, Info, Calendar,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { useShell } from "@/app/app/page";
import { toast } from "sonner";

interface GroupMember {
  id: number;
  fullName: string;
  role: string;
  groupNumber: string;
}

interface GroupAssignment {
  id: number;
  title: string;
  description: string;
  dueDate: string;
  maxScore?: number;
  moduleName?: string;
  isCompleted?: boolean;
}

interface GroupAnnouncement {
  id: number;
  title: string;
  content: string;
  author: string;
  date: string;
  urgency: string;
  scopeLabel?: string;
}

const DONE_KEY = "talib-assignments-completed";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ar-DZ", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

function urgencyBadge(urgency: string) {
  switch (urgency) {
    case "عاجل": return { label: "عاجل", cls: "bg-red-500 text-white", icon: <AlertCircle className="w-3 h-3" /> };
    case "هام": return { label: "هام", cls: "bg-amber-500 text-white", icon: <Info className="w-3 h-3" /> };
    default: return { label: "عام", cls: "bg-primary text-primary-foreground", icon: <Megaphone className="w-3 h-3" /> };
  }
}

export function TalibGroupScreen() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { navigate } = useShell();
  const [members, setMembers] = React.useState<GroupMember[]>([]);
  const [loading, setLoading] = React.useState(true);

  const userGroup = user?.scopeCohortGroupId;
  const hasGroup = userGroup != null;

  React.useEffect(() => {
    if (!hasGroup) {
      // async settle — avoids the sync setState-in-effect lint error
      const t = setTimeout(() => setLoading(false), 0);
      return () => clearTimeout(t);
    }
    fetch(`/api/group/members?cohortId=${userGroup}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        setMembers(data.members ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [userGroup, hasGroup]);

  const representative = members.find((m) => m.role === "REPRESENTATIVE");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">{t("group.title")}</h1>
      </div>

      {!hasGroup ? (
        <Card className="p-5 bg-amber-500/10 border-amber-500/30">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-sm mb-1 text-amber-700 dark:text-amber-300">
                أنت مسجل بحالة (بدون فوج)
              </h3>
              <p className="text-xs text-amber-700/80 dark:text-amber-300/80 leading-relaxed">
                سيتم إلحاقك بفوجك الدراسي من قِبل ممثل الدفعة أو مشرف التخصص عبر
                لوحة الإدارة. يمكنك تصفح محتوى تخصصك الكامل حتى يتم إلحاقك. لتسريع
                العملية، أرسل طلب انضمام من زر «تصفح المجموعات والأفواج» بالأسفل.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                onClick={() => navigate("BROWSE_GROUPS")}
              >
                تصفح المجموعات والأفواج
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <Card className="p-5 bg-primary/5 border-primary/20">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <Users className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h2 className="font-black text-base">فوجك الدراسي</h2>
                <p className="text-xs text-muted-foreground">
                  {members.length} {t("group.members")}
                </p>
              </div>
            </div>
          </Card>

          {representative && (
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-secondary/15 text-secondary flex items-center justify-center shrink-0">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">ممثل الفوج</p>
                  <p className="font-bold text-sm">{representative.fullName}</p>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {t(`roles.${representative.role}`)}
                </Badge>
              </div>
            </Card>
          )}

          <Tabs defaultValue="members">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="members" className="data-[state=active]:font-bold text-xs">
                <Users className="w-3.5 h-3.5 ml-1" />الأعضاء
              </TabsTrigger>
              <TabsTrigger value="assignments" className="data-[state=active]:font-bold text-xs">
                <CheckSquare className="w-3.5 h-3.5 ml-1" />الواجبات
              </TabsTrigger>
              <TabsTrigger value="announcements" className="data-[state=active]:font-bold text-xs">
                <Megaphone className="w-3.5 h-3.5 ml-1" />الإعلانات
              </TabsTrigger>
            </TabsList>

            {/* ---- الأعضاء ---- */}
            <TabsContent value="members" className="mt-4">
              <Card className="p-4">
                <h3 className="font-bold text-sm mb-3">{t("group.members")}</h3>
                {loading ? (
                  <p className="text-sm text-muted-foreground text-center py-6">{t("common.loading")}</p>
                ) : members.length === 0 ? (
                  <div className="text-center py-6">
                    <GraduationCap className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-xs text-muted-foreground">{t("group.noMembers")}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {members.map((m) => (
                      <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0 text-xs font-bold">
                          {m.fullName.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{m.fullName}</p>
                          {m.role !== "STUDENT" && (
                            <Badge variant="secondary" className="text-xs mt-0.5">
                              {t(`roles.${m.role}`)}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </TabsContent>

            {/* ---- الواجبات (round 52) ---- */}
            <TabsContent value="assignments" className="mt-4">
              <GroupAssignmentsTab />
            </TabsContent>

            {/* ---- الإعلانات (round 52) ---- */}
            <TabsContent value="announcements" className="mt-4">
              <GroupAnnouncementsTab />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// الواجبات — same completion store as the assignments screen, so a
// student who ticks a assignment here sees it ticked there too.
// ---------------------------------------------------------------
function GroupAssignmentsTab() {
  const { t } = useI18n();
  const [assignments, setAssignments] = React.useState<GroupAssignment[]>([]);
  const [loading, setLoading] = React.useState(true);

  const fetchAssignments = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/assignments", { cache: "no-store" });
      const data = await res.json();
      let stored: Record<string, boolean> = {};
      try {
        stored = JSON.parse(localStorage.getItem(DONE_KEY) || "{}");
      } catch {
        // private mode — everything starts unchecked
      }
      setAssignments(
        (data.assignments ?? []).map((a: Record<string, unknown>) => ({
          id: Number(a.id),
          title: String(a.title ?? ""),
          description: String(a.description ?? ""),
          // both storage branches: Prisma camelCase / Supabase snake_case
          dueDate: String(a.dueDate ?? (a as { due_date?: string }).due_date ?? ""),
          maxScore: a.maxScore != null ? Number(a.maxScore) : (a as { max_score?: number }).max_score != null ? Number((a as { max_score?: number }).max_score) : undefined,
          moduleName:
            typeof a.moduleName === "string" ? a.moduleName
            : ((a as { module?: { name?: string } }).module?.name ?? undefined),
          isCompleted: !!stored[String(a.id)],
        }))
      );
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    // deferred kick-off — the fetcher flips loading synchronously, so it
    // must not run inside the effect body (setState-in-effect lint rule)
    const t = setTimeout(fetchAssignments, 0);
    return () => clearTimeout(t);
  }, [fetchAssignments]);

  function toggleComplete(id: number) {
    setAssignments((prev) => prev.map((a) => (a.id === id ? { ...a, isCompleted: !a.isCompleted } : a)));
    try {
      const stored = JSON.parse(localStorage.getItem(DONE_KEY) || "{}");
      const updated = { ...stored, [id]: !stored[id] };
      localStorage.setItem(DONE_KEY, JSON.stringify(updated));
      toast.success(updated[id] ? "تم الإنجاز" : "أُلغي الإنجاز");
    } catch {
      // private mode — UI state still flips for this session
    }
  }

  if (loading) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </Card>
    );
  }
  if (assignments.length === 0) {
    return (
      <Card className="p-8 text-center bg-muted/30 border-dashed">
        <CheckSquare className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <h3 className="font-bold text-sm mb-1">لا توجد واجبات بعد</h3>
        <p className="text-xs text-muted-foreground">
          واجبات تخصصك ستظهر هنا مع تواريخ التسليم — وتُنجز من نفس الزر.
        </p>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {assignments.map((a) => (
        <Card key={a.id} className="p-4">
          <div className="flex items-start gap-2.5">
            <button onClick={() => toggleComplete(a.id)} className="mt-0.5 shrink-0" aria-label="تبديل الإنجاز">
              {a.isCompleted ? (
                <CheckSquare className="w-5 h-5 text-emerald-600" />
              ) : (
                <Square className="w-5 h-5 text-muted-foreground" />
              )}
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className={`font-bold text-sm ${a.isCompleted ? "line-through text-muted-foreground" : ""}`}>
                  {a.title}
                </p>
                {a.maxScore != null && (
                  <Badge variant="outline" className="text-[10px] shrink-0">العلامة: {a.maxScore}</Badge>
                )}
              </div>
              {a.moduleName && (
                <p className="text-[11px] text-primary mb-0.5">📘 {a.moduleName}</p>
              )}
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                التسليم: {formatDate(a.dueDate || null)}
              </p>
              {a.description && (
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed line-clamp-2">{a.description}</p>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------
// الإعلانات — the server already scopes this list to the caller
// (specialty-wide + their year + their cohort), so what lands here is
// exactly «ما يستهدف فوجي وسنتي» plus the specialty-wide posts.
// ---------------------------------------------------------------
function GroupAnnouncementsTab() {
  const { t } = useI18n();
  const [announcements, setAnnouncements] = React.useState<GroupAnnouncement[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetch("/api/announcements", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setAnnouncements(d.announcements ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </Card>
    );
  }
  if (announcements.length === 0) {
    return (
      <Card className="p-8 text-center bg-muted/30 border-dashed">
        <Megaphone className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <h3 className="font-bold text-sm mb-1">لا توجد إعلانات بعد</h3>
        <p className="text-xs text-muted-foreground">
          الإعلانات العامة وإعلانات سنتك وفوجك ستظهر هنا عند نشرها.
        </p>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {announcements.map((ann) => {
        const cfg = urgencyBadge(ann.urgency);
        return (
          <Card key={ann.id} className="p-4 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Badge className={`${cfg.cls} gap-1 text-[10px]`}>
                {cfg.icon}
                {cfg.label}
              </Badge>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDate(ann.date || null)}
              </span>
            </div>
            <h3 className="font-bold text-sm">{ann.title}</h3>
            <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4">{ann.content}</p>
            <p className="text-[11px] text-muted-foreground pt-1.5 border-t border-border">
              {ann.author}
            </p>
          </Card>
        );
      })}
    </div>
  );
}
