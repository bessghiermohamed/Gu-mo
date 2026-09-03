"use client";

import * as React from "react";
import {
  Users, Layers, BookOpen, Cloud, Plus, TestTube2,
  CheckCircle2, XCircle, Loader2, FolderTree, UserPlus, Clock,
  Check, X, Building2, GraduationCap, Shield, Trash2, Route, CalendarDays, Pencil,
  Flag, AlertTriangle, CheckCheck, RotateCcw, Send, Eye, EyeOff, Star, Link2, Sparkles, Power,
  FlaskConical, RefreshCw, Zap, Database, ExternalLink, Mail, IdCard,
  Network, ChevronDown, ChevronLeft, Search, ArrowLeftRight, UserMinus, UserCog,
  LayoutDashboard, Inbox,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { canManageRoles, canCreateGroups, canCreateModules, canCreateCohorts, canAccessDevSettings } from "@/lib/auth/permissions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// =====================================================
// Shared types + cascade hook (fix أ.1/أ.2/ب)
// institution → specialty → track → year → group
// =====================================================
interface Inst { id: number; nameAr: string; type: string; city: string }
interface Spec { id: number; nameAr: string; code: string; faculty: string; institutionId: number }
interface Year { id: number; yearName: string }
interface Track { id: number; trackNameAr: string; code: string }
interface GroupRow { id: number; groupName: string; description: string }

const selectCls = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm";

function useCascade() {
  const [institutions, setInstitutions] = React.useState<Inst[]>([]);
  const [specialties, setSpecialties] = React.useState<Spec[]>([]);
  const [years, setYears] = React.useState<Year[]>([]);
  const [tracks, setTracks] = React.useState<Track[]>([]);
  const [groups, setGroups] = React.useState<GroupRow[]>([]);
  const [instId, setInstId] = React.useState<string>("");
  const [specId, setSpecId] = React.useState<string>("");
  const [yearId, setYearId] = React.useState<string>("");
  const [trackId, setTrackId] = React.useState<string>("");
  const [groupId, setGroupId] = React.useState<string>("");

  React.useEffect(() => {
    fetch("/api/institutions", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const list: Inst[] = data.institutions ?? [];
        setInstitutions(list);
        if (list.length > 0) setInstId(String(list[0].id));
      })
      .catch(() => setInstitutions([]));
  }, []);

  React.useEffect(() => {
    if (!instId) return;
    setSpecId(""); setYearId(""); setTrackId(""); setGroupId("");
    setSpecialties([]); setYears([]); setTracks([]); setGroups([]);
    fetch(`/api/specialties?institutionId=${instId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const list: Spec[] = data.specialties ?? [];
        setSpecialties(list);
        if (list.length > 0) setSpecId(String(list[0].id));
      })
      .catch(() => setSpecialties([]));
  }, [instId]);

  React.useEffect(() => {
    if (!specId) return;
    setYearId(""); setTrackId(""); setGroupId(""); setYears([]); setTracks([]); setGroups([]);
    Promise.all([
      fetch(`/api/onboarding/years?specialtyId=${specId}`).then((r) => r.json()),
      fetch(`/api/tracks?specialtyId=${specId}`).then((r) => r.json()),
    ])
      .then(([yearsData, tracksData]) => {
        const y: Year[] = yearsData.years ?? [];
        setYears(y);
        if (y.length > 0) setYearId(String(y[0].id));
        setTracks(tracksData.tracks ?? []);
      })
      .catch(() => { setYears([]); setTracks([]); });
  }, [specId]);

  React.useEffect(() => {
    if (!specId || !yearId) { setGroups([]); setGroupId(""); return; }
    setGroupId("");
    fetch(`/api/groups?specialtyId=${specId}&academicYearId=${yearId}${trackId ? `&trackId=${trackId}` : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setGroups(data.groups ?? []))
      .catch(() => setGroups([]));
  }, [specId, yearId, trackId]);

  return {
    institutions, specialties, years, tracks, groups,
    instId, setInstId, specId, setSpecId, yearId, setYearId,
    trackId, setTrackId, groupId, setGroupId,
  };
}

export function TalibAdminPanelScreen() {
  const { t } = useI18n();
  const { user } = useAuth();

  // fix (R12-06, P0): the permission helpers were imported but NEVER used —
  // all 13 tabs rendered for every supervisory role, including «السحابة»
  // (Supabase connection details — an OWNER-only tool per /api/dev/env's
  // canAccessDevSettings gate). Tab visibility is now bound to the SAME
  // helpers the APIs enforce.
  const isOwner = canAccessDevSettings(user ?? null);

  // فتح التبويب المطلوب مباشرة (مثلاً «تيليجرام» من شاشة دروس تيليجرام)
  // round 10 (review §16): اللوحة تفتح افتراضياً على «مركز التحكم» —
  // نظرة عامة منظمة حسب الأولوية بدل الترام في بطاقات متساوية.
  const [adminTab, setAdminTab] = React.useState<string>(() => {
    try {
      const wanted = sessionStorage.getItem("talib-admin-tab");
      sessionStorage.removeItem("talib-admin-tab");
      // never restore into a tab this role cannot see
      if (wanted === "cloud" && !canAccessDevSettings(user ?? null)) return "overview";
      return wanted ?? "overview";
    } catch {
      return "overview";
    }
  });

  // round 10 (review §16): إحصاءات مركز التحكم — طلبات معلّقة وتبليغات
  // مفتوحة + أعداد نطاق المتصل (feed للشارات والبطاقات).
  const [stats, setStats] = React.useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = React.useState(true);
  // fix (R12): a failed stats fetch used to be indistinguishable from
  // "zero pending items" — the overview showed a green ALL-CLEAR on error.
  const [statsError, setStatsError] = React.useState(false);
  const refreshStats = React.useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch("/api/admin/stats", { cache: "no-store" });
      if (res.ok) {
        setStats(await res.json());
        setStatsError(false);
      } else {
        setStatsError(true);
      }
    } catch {
      setStatsError(true);
    } finally {
      setStatsLoading(false);
    }
  }, []);
  React.useEffect(() => { refreshStats(); }, [refreshStats]);
  // re-sync whenever the supervisor lands back on the overview (counts
  // change after approve/reject/resolve actions in the other tabs)
  React.useEffect(() => {
    if (adminTab === "overview") refreshStats();
  }, [adminTab, refreshStats]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black mb-1">{t("admin.title")}</h1>
        <p className="text-sm text-muted-foreground">
          إدارة المؤسسات، التخصصات، الملامح، الأفواج، المقررات، والمحتوى الأكاديمي
        </p>
      </div>

      <Tabs value={adminTab} onValueChange={setAdminTab}>
        {/* fix أ.5: tabs used to squeeze into 4 columns on mobile, pushing
            "الطلبات" (join requests) off-screen. Now they wrap into rows so
            every tab is always visible and reachable.
            round 10 (review §16): «مركز التحكم» أولاً + شارات عدّاد على
            «الطلبات» و«التبليغات» حتى تُرى البنود المنتظرة دون فتح التبويب. */}
        <TabsList className="flex flex-wrap gap-1 w-full h-auto">
          <TabsTrigger value="overview" className="text-xs flex-1 min-w-24 data-[state=active]:font-bold"><LayoutDashboard className="w-3.5 h-3.5 ml-1" />مركز التحكم</TabsTrigger>
          <TabsTrigger value="users" className="text-xs flex-1 min-w-24"><Users className="w-3.5 h-3.5 ml-1" />المستخدمون</TabsTrigger>
          <TabsTrigger value="structure" className="text-xs flex-1 min-w-24"><Building2 className="w-3.5 h-3.5 ml-1" />الهيكل</TabsTrigger>
          <TabsTrigger value="tracks" className="text-xs flex-1 min-w-24"><Route className="w-3.5 h-3.5 ml-1" />الملامح</TabsTrigger>
          <TabsTrigger value="years" className="text-xs flex-1 min-w-24"><CalendarDays className="w-3.5 h-3.5 ml-1" />السنوات</TabsTrigger>
          <TabsTrigger value="cohorts" className="text-xs flex-1 min-w-24"><Layers className="w-3.5 h-3.5 ml-1" />الأفواج</TabsTrigger>
          <TabsTrigger value="groups" className="text-xs flex-1 min-w-24"><FolderTree className="w-3.5 h-3.5 ml-1" />المجموعات</TabsTrigger>
          <TabsTrigger value="requests" className="text-xs flex-1 min-w-24">
            <UserPlus className="w-3.5 h-3.5 ml-1" />الطلبات
            {stats != null && stats.pendingJoinRequests > 0 && (
              <span className="mr-1 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                {stats.pendingJoinRequests > 99 ? "99+" : stats.pendingJoinRequests}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="subordinates" className="text-xs flex-1 min-w-24"><Network className="w-3.5 h-3.5 ml-1" />المرؤوسون</TabsTrigger>
          <TabsTrigger value="modules" className="text-xs flex-1 min-w-24"><BookOpen className="w-3.5 h-3.5 ml-1" />المقررات</TabsTrigger>
          <TabsTrigger value="issues" className="text-xs flex-1 min-w-24">
            <Flag className="w-3.5 h-3.5 ml-1" />التبليغات
            {stats != null && stats.openReports > 0 && (
              <span className="mr-1 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                {stats.openReports > 99 ? "99+" : stats.openReports}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="telegram" className="text-xs flex-1 min-w-24"><Send className="w-3.5 h-3.5 ml-1" />تيليجرام</TabsTrigger>
          {isOwner && (
            <TabsTrigger value="cloud" className="text-xs flex-1 min-w-24"><Cloud className="w-3.5 h-3.5 ml-1" />السحابة</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <ControlCenterOverview
            stats={stats}
            loading={statsLoading}
            error={statsError && stats == null && !statsLoading}
            onRetry={refreshStats}
            onGoToTab={setAdminTab}
          />
        </TabsContent>
        <TabsContent value="users" className="mt-4"><UsersManager /></TabsContent>
        <TabsContent value="structure" className="mt-4"><StructureManager /></TabsContent>
        <TabsContent value="tracks" className="mt-4"><TracksManager /></TabsContent>
        <TabsContent value="years" className="mt-4"><YearsManager /></TabsContent>
        <TabsContent value="cohorts" className="mt-4"><CohortsManager /></TabsContent>
        <TabsContent value="groups" className="mt-4"><GroupsManager /></TabsContent>
        <TabsContent value="requests" className="mt-4 space-y-4"><DirectAssignmentCard /><JoinRequestsManager /></TabsContent>
        <TabsContent value="subordinates" className="mt-4"><SubordinatesManager /></TabsContent>
        <TabsContent value="modules" className="mt-4"><ModulesManager /></TabsContent>
        <TabsContent value="issues" className="mt-4"><IssuesManager /></TabsContent>
        <TabsContent value="telegram" className="mt-4"><TelegramManager /></TabsContent>
        {isOwner && (
          <TabsContent value="cloud" className="mt-4"><CloudManager /></TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// =====================================================
// Control Center Overview — round 10, review §16
//
// The dashboard is no longer 12 equal tabs with no landing point. It
// opens on a Control Center organized by the three zones the review
// demands:
//   1) يتطلب انتباهك — pending join requests + open reports (actionable)
//   2) معلومات — caller-scoped counts (students, subordinates, groups,
//      cohorts) — NOT global numbers a year-representative shouldn't see
//   3) إدارة — quick links into the management tabs
// States: loading skeleton, attention-empty ("all clear"), stat error
// tolerance (— placeholders).
// =====================================================
interface AdminStats {
  pendingJoinRequests: number;
  openReports: number;
  students: number;
  subordinates: number;
  groups: number;
  cohorts: number;
}

function StatTile({ icon: Icon, label, value, loading }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | null;
  loading: boolean;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40">
      <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-black leading-none tabular-nums">
          {loading ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : value ?? "—"}
        </p>
        <p className="text-[11px] text-muted-foreground mt-1 truncate">{label}</p>
      </div>
    </div>
  );
}

function ControlCenterOverview({ stats, loading, error, onRetry, onGoToTab }: {
  stats: AdminStats | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onGoToTab: (tab: string) => void;
}) {
  const attention = (stats?.pendingJoinRequests ?? 0) + (stats?.openReports ?? 0);

  return (
    <div className="space-y-4">
      {/* ---- Zone 1: يتطلب انتباهك ---- */}
      <section>
        <h2 className="text-sm font-black mb-2 flex items-center gap-2">
          <Inbox className="w-4 h-4 text-primary" />
          يتطلب انتباهك
        </h2>
        {loading && stats == null ? (
          <Card className="p-6 text-center">
            <Loader2 className="w-5 h-5 mx-auto animate-spin text-muted-foreground" />
          </Card>
        ) : error ? (
          // fix (R12): a failed stats fetch used to render the SAME green
          // "all clear" card as a genuine zero — a supervisor could miss
          // real waiting work forever. Failure now looks like failure.
          <Card className="p-4 bg-red-500/5 border-red-500/30 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/15 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-red-700 dark:text-red-300">تعذّر تحميل الإحصاءات</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                لا يمكن التأكد من وجود بنود منتظرة — أعد المحاولة قبل المتابعة
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RotateCcw className="w-3.5 h-3.5 ml-1" />إعادة المحاولة
            </Button>
          </Card>
        ) : attention === 0 ? (
          <Card className="p-4 bg-emerald-500/5 border-emerald-500/30 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">لا شيء ينتظر معالجتك</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                ستظهر هنا طلبات الانضمام الجديدة والتبليغات فور وصولها
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onGoToTab("requests")}
              className="text-right"
              aria-label="معالجة طلبات الانضمام"
            >
              <Card className="p-4 h-full bg-amber-500/5 border-amber-500/30 hover:border-amber-500/60 hover:shadow-md transition-all">
                <div className="flex items-center justify-between mb-2">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <span className="text-2xl font-black tabular-nums text-amber-600 dark:text-amber-400">
                    {stats?.pendingJoinRequests ?? 0}
                  </span>
                </div>
                <p className="text-sm font-bold">طلب انضمام معلّق</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  طلاب في انتظار موافقة أو رفض — تُوجَّه إليك حسب نطاق إشرافك
                </p>
                <span className="inline-flex items-center gap-1 mt-2 text-xs font-bold text-primary">
                  معالجة الطلبات<ChevronLeft className="w-3 h-3" />
                </span>
              </Card>
            </button>
            <button
              type="button"
              onClick={() => onGoToTab("issues")}
              className="text-right"
              aria-label="عرض التبليغات"
            >
              <Card className="p-4 h-full bg-red-500/5 border-red-500/30 hover:border-red-500/60 hover:shadow-md transition-all">
                <div className="flex items-center justify-between mb-2">
                  <div className="w-10 h-10 rounded-xl bg-red-500/15 text-red-600 dark:text-red-400 flex items-center justify-center">
                    <Flag className="w-5 h-5" />
                  </div>
                  <span className="text-2xl font-black tabular-nums text-red-600 dark:text-red-400">
                    {stats?.openReports ?? 0}
                  </span>
                </div>
                <p className="text-sm font-bold">تبليغ بانتظار المراجعة</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  مشاكل بلّغ عنها الطلاب من شاشتي المقررات والواجبات
                </p>
                <span className="inline-flex items-center gap-1 mt-2 text-xs font-bold text-primary">
                  عرض التبليغات<ChevronLeft className="w-3 h-3" />
                </span>
              </Card>
            </button>
          </div>
        )}
      </section>

      {/* ---- Zone 2: معلومات (نطاقك أنت) ---- */}
      <section>
        <h2 className="text-sm font-black mb-2 flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          معلومات — داخل نطاق إشرافك
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <StatTile icon={GraduationCap} label="طلبة" value={stats?.students ?? null} loading={loading} />
          <StatTile icon={Network} label="مشرفون تابعون" value={stats?.subordinates ?? null} loading={loading} />
          <StatTile icon={FolderTree} label="مجموعات" value={stats?.groups ?? null} loading={loading} />
          <StatTile icon={Layers} label="أفواج" value={stats?.cohorts ?? null} loading={loading} />
        </div>
      </section>

      {/* ---- Zone 3: إدارة ---- */}
      <section>
        <h2 className="text-sm font-black mb-2 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          الإدارة
        </h2>
        <Card className="p-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {([
              { tab: "users", label: "المستخدمون", icon: Users },
              { tab: "structure", label: "الهيكل", icon: Building2 },
              { tab: "tracks", label: "الملامح", icon: Route },
              { tab: "years", label: "السنوات", icon: CalendarDays },
              { tab: "cohorts", label: "الأفواج", icon: Layers },
              { tab: "groups", label: "المجموعات", icon: FolderTree },
              { tab: "subordinates", label: "المرؤوسون", icon: Network },
              { tab: "modules", label: "المقررات", icon: BookOpen },
              { tab: "telegram", label: "تيليجرام", icon: Send },
              { tab: "cloud", label: "السحابة", icon: Cloud },
            ] as const).map(({ tab, label, icon: Icon }) => (
              <button
                key={tab}
                type="button"
                onClick={() => onGoToTab(tab)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg border bg-background hover:border-primary/50 hover:bg-primary/5 transition-colors text-right"
              >
                <Icon className="w-4 h-4 text-primary shrink-0" />
                <span className="text-xs font-bold">{label}</span>
              </button>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}

// =====================================================
// Users Manager — fix د: grouped by institution → specialty (accordion)
// =====================================================
interface AppUserRow {
  id: number; fullName: string; email: string; studentId: string;
  role: string; specialtyName: string; yearName: string; groupNumber: string;
  assignedSpecialtyId: number; scopeCohortGroupId: number | null;
  scopeInstitutionId: number | null;
  representativeScope: string;
}

function UsersManager() {
  const [users, setUsers] = React.useState<AppUserRow[]>([]);
  const [institutions, setInstitutions] = React.useState<Inst[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [promoteUser, setPromoteUser] = React.useState<AppUserRow | null>(null);
  const [deleteUser, setDeleteUser] = React.useState<AppUserRow | null>(null);
  // round 9 (spec §4 — Method B): direct assignment dialog per student row
  const [assignUser, setAssignUser] = React.useState<AppUserRow | null>(null);

  const fetchUsers = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users", { cache: "no-store" });
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch { toast.error("فشل تحميل المستخدمين"); }
    finally { setLoading(false); }
  }, []);

  React.useEffect(() => {
    fetchUsers();
    fetch("/api/institutions", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setInstitutions(data.institutions ?? []))
      .catch(() => setInstitutions([]));
  }, [fetchUsers]);

  const filtered = users.filter((u) =>
    u.fullName.includes(search) || u.email.toLowerCase().includes(search.toLowerCase()) || u.studentId.includes(search)
  );

  // fix د: group users by institution → specialty
  const instName = (id: number | null) =>
    institutions.find((i) => i.id === id)?.nameAr ?? "بلا مؤسسة";
  const grouped = React.useMemo(() => {
    const map = new Map<string, Map<string, AppUserRow[]>>();
    for (const u of filtered) {
      const inst = instName(u.scopeInstitutionId);
      const spec = u.specialtyName || "بلا تخصص";
      if (!map.has(inst)) map.set(inst, new Map());
      const specMap = map.get(inst)!;
      if (!specMap.has(spec)) specMap.set(spec, []);
      specMap.get(spec)!.push(u);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "ar"));
  }, [filtered, institutions]);

  async function handleDelete(u: AppUserRow) {
    try {
      const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تم حذف المستخدم");
      setDeleteUser(null);
      fetchUsers();
    } catch { toast.error("فشل الحذف"); }
  }

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="font-bold text-sm flex items-center gap-2"><Users className="w-4 h-4 text-primary" />المستخدمون</h3>
        <p className="text-xs text-muted-foreground mt-1">مجمّعون حسب المؤسسة ← التخصص ({users.length} مستخدم)</p>
      </div>
      <Input placeholder="بحث بالاسم أو البريد أو الرقم التسلسلي..." value={search} onChange={(e) => setSearch(e.target.value)} />
      {loading ? (
        <div className="text-center py-8"><Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground mb-2" /><p className="text-sm text-muted-foreground">جاري التحميل...</p></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">لا يوجد مستخدمون مطابقون</div>
      ) : (
        <div className="max-h-[65vh] overflow-y-auto scrollbar-thin pr-1">
          <Accordion type="multiple" defaultValue={grouped.slice(0, 1).map(([inst]) => inst)}>
            {grouped.map(([inst, specMap]) => {
              const instCount = Array.from(specMap.values()).reduce((n, arr) => n + arr.length, 0);
              return (
                <AccordionItem key={inst} value={inst}>
                  <AccordionTrigger className="text-sm py-2 hover:no-underline">
                    <span className="flex items-center gap-2 font-bold">
                      <Building2 className="w-4 h-4 text-primary" />
                      {inst}
                      <Badge variant="secondary" className="text-xs">{instCount}</Badge>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <Accordion type="multiple">
                      {Array.from(specMap.entries()).map(([spec, specUsers]) => (
                        <AccordionItem key={spec} value={spec} className="border-none">
                          <AccordionTrigger className="text-xs py-1.5 hover:no-underline">
                            <span className="flex items-center gap-2 font-medium">
                              <GraduationCap className="w-3.5 h-3.5 text-muted-foreground" />
                              {spec}
                              <Badge variant="outline" className="text-xs">{specUsers.length}</Badge>
                            </span>
                          </AccordionTrigger>
                          <AccordionContent className="space-y-2 pb-2">
                            {specUsers.map((u) => (
                              <Card key={u.id} className="p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-bold text-sm">{u.fullName}</span>
                                      <RoleBadge role={u.role} />
                                      {u.yearName && <Badge variant="outline" className="text-xs">{u.yearName}</Badge>}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                                      <div className="flex items-center gap-1.5"><Mail className="w-3 h-3 shrink-0" />{u.email}</div>
                                      <div className="flex items-center gap-1.5"><IdCard className="w-3 h-3 shrink-0" />{u.studentId}</div>
                                      {u.groupNumber ? (
                                        <div className="flex items-center gap-1.5"><Users className="w-3 h-3 shrink-0" />{u.groupNumber}</div>
                                      ) : (
                                        <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400"><UserMinus className="w-3 h-3 shrink-0" />بلا فوج</div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex gap-1 shrink-0">
                                    {u.role === "STUDENT" && (
                                      <Button size="sm" variant="outline" onClick={() => setAssignUser(u)} title="إلحاق مباشر بفوج">
                                        <ArrowLeftRight className="w-3.5 h-3.5 ml-1" />إلحاق
                                      </Button>
                                    )}
                                    <Button size="sm" variant="outline" onClick={() => setPromoteUser(u)}>
                                      <Shield className="w-3.5 h-3.5 ml-1" />دور
                                    </Button>
                                    {u.role !== "OWNER" && (
                                      <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => setDeleteUser(u)}>
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </Card>
                            ))}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      )}
      {promoteUser && <PromoteDialog user={promoteUser} onClose={() => setPromoteUser(null)} onDone={() => { setPromoteUser(null); fetchUsers(); }} />}
      {assignUser && <AssignDialog user={assignUser} onClose={() => setAssignUser(null)} onDone={() => { setAssignUser(null); fetchUsers(); }} />}
      {deleteUser && (
        <Dialog open onOpenChange={() => setDeleteUser(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="text-destructive flex items-center gap-2"><Trash2 className="w-5 h-5" />حذف مستخدم</DialogTitle></DialogHeader>
            <p className="text-sm">هل تريد حذف <strong>{deleteUser.fullName}</strong> ({deleteUser.email})؟ لا يمكن التراجع.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteUser(null)}>إلغاء</Button>
              <Button variant="destructive" onClick={() => handleDelete(deleteUser)}>حذف نهائي</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

function RoleBadge({ role }: { role: string }) {
  const config: Record<string, { label: string; color: string }> = {
    OWNER: { label: "مالك", color: "bg-purple-500 text-white" },
    SPECIALTY_ADMIN: { label: "مشرف تخصص", color: "bg-blue-500 text-white" },
    REPRESENTATIVE: { label: "ممثل", color: "bg-amber-500 text-white" },
    STUDENT: { label: "طالب", color: "bg-gray-500 text-white" },
  };
  const c = config[role] ?? config.STUDENT;
  return <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${c.color}`}>{c.label}</span>;
}

function PromoteDialog({ user, onClose, onDone }: { user: AppUserRow; onClose: () => void; onDone: () => void }) {
  const [newRole, setNewRole] = React.useState(user.role);
  const [cohorts, setCohorts] = React.useState<Array<{ id: number; groupName: string }>>([]);
  const [scopeCohortId, setScopeCohortId] = React.useState(user.scopeCohortGroupId?.toString() ?? "");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    fetch(`/api/cohort?specialtyId=${user.assignedSpecialtyId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setCohorts(data.cohorts ?? []))
      .catch(() => setCohorts([]));
  }, [user.assignedSpecialtyId]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${user.id}/promote`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newRole,
          scope: {
            cohortId: scopeCohortId ? parseInt(scopeCohortId) : undefined,
            specialtyId: user.assignedSpecialtyId,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success(data.message ?? "تم تحديث الدور");
      onDone();
    } finally { setSaving(false); }
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>تعديل دور: {user.fullName}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="rounded-lg bg-muted/50 p-2 text-xs space-y-0.5">
            <div className="flex items-center gap-1.5"><Mail className="w-3 h-3 shrink-0" />{user.email}</div>
            <div className="flex items-center gap-1.5"><IdCard className="w-3 h-3 shrink-0" />{user.studentId}</div>
            <div>الدور الحالي: <RoleBadge role={user.role} /></div>
          </div>
          <div className="space-y-1.5">
            <Label>الدور الجديد</Label>
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className={selectCls}>
              <option value="STUDENT">طالب عادي</option>
              <option value="REPRESENTATIVE">ممثل الفوج</option>
              <option value="SPECIALTY_ADMIN">مشرف التخصص</option>
              {user.role === "OWNER" && <option value="OWNER">مالك</option>}
            </select>
          </div>
          {newRole === "REPRESENTATIVE" && (
            <div className="space-y-1.5">
              <Label>الفوج الذي سيُشرف عليه</Label>
              {cohorts.length === 0 ? (
                <p className="text-xs text-muted-foreground">لا توجد أفواج في تخصص هذا المستخدم — أنشئ أفواجاً أولاً.</p>
              ) : (
                <select value={scopeCohortId} onChange={(e) => setScopeCohortId(e.target.value)} className={selectCls}>
                  <option value="">— بدون فوج محدد —</option>
                  {cohorts.map((c) => <option key={c.id} value={c.id}>{c.groupName} (ID: {c.id})</option>)}
                </select>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حفظ الدور</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================
// Structure Manager — institutions + specialties (fix أ.1)
// =====================================================
function StructureManager() {
  return <div className="space-y-4"><InstitutionsPanel /><SpecialtiesPanel /></div>;
}

function InstitutionsPanel() {
  const [institutions, setInstitutions] = React.useState<Inst[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(""); const [type, setType] = React.useState(""); const [city, setCity] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const { user } = useAuth();
  const isOwner = user?.role === "OWNER";
  // round 6: edit/delete state
  const [editInst, setEditInst] = React.useState<Inst | null>(null);
  const [editName, setEditName] = React.useState(""); const [editType, setEditType] = React.useState(""); const [editCity, setEditCity] = React.useState("");
  const [editSaving, setEditSaving] = React.useState(false);
  const [deleteInst, setDeleteInst] = React.useState<Inst | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try { const res = await fetch("/api/institutions", { cache: "no-store" }); const data = await res.json(); setInstitutions(data.institutions ?? []); }
    catch { toast.error("فشل تحميل المؤسسات"); } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { fetchData(); }, [fetchData]);
  async function handleCreate() {
    if (!name.trim()) { toast.error("اسم المؤسسة مطلوب"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/institutions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nameAr: name.trim(), type: type.trim(), city: city.trim() }) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تمت إضافة المؤسسة"); setOpen(false); setName(""); setType(""); setCity(""); fetchData();
    } finally { setSaving(false); }
  }
  async function handleEditSave() {
    if (!editInst) return;
    if (!editName.trim()) { toast.error("اسم المؤسسة مطلوب"); return; }
    setEditSaving(true);
    try {
      const res = await fetch("/api/institutions", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editInst.id, nameAr: editName.trim(), type: editType.trim(), city: editCity.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تم تعديل المؤسسة");
      setEditInst(null);
      fetchData();
    } catch { toast.error("فشل الاتصال"); }
    finally { setEditSaving(false); }
  }
  async function handleDelete() {
    if (!deleteInst) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/institutions?id=${deleteInst.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setDeleteError(data.error); toast.error(data.error); return; }
      toast.success("تم حذف المؤسسة");
      setDeleteInst(null); setDeleteError(null);
      fetchData();
    } catch { toast.error("فشل الحذف"); }
    finally { setDeleting(false); }
  }
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div><h3 className="font-bold text-sm flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" />المؤسسات الجامعية</h3><p className="text-xs text-muted-foreground">المدارس العليا والجامعات{isOwner ? " — تعديل وحذف متاحان للمالك" : ""}</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 ml-1" />مؤسسة</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>إضافة مؤسسة جديدة 🏛️</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5"><Label>اسم المؤسسة</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: جامعة الجزائر 3" /></div>
              <div className="space-y-1.5"><Label>النوع</Label><Input value={type} onChange={(e) => setType(e.target.value)} placeholder="مثال: جامعة / مدرسة عليا" /></div>
              <div className="space-y-1.5"><Label>المدينة</Label><Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="مثال: الجزائر" /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button onClick={handleCreate} disabled={saving}>{saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}إنشاء</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* round 6: edit dialog (OWNER only) */}
      {editInst && (
        <Dialog open onOpenChange={() => setEditInst(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="w-5 h-5 text-primary" />تعديل المؤسسة</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5"><Label>اسم المؤسسة</Label><Input value={editName} onChange={(e) => setEditName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>النوع</Label><Input value={editType} onChange={(e) => setEditType(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>المدينة</Label><Input value={editCity} onChange={(e) => setEditCity(e.target.value)} /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setEditInst(null)}>إلغاء</Button><Button onClick={handleEditSave} disabled={editSaving}>{editSaving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حفظ التعديلات</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* round 6: delete confirm — blocked while specialties exist (server guard) */}
      {deleteInst && (
        <Dialog open onOpenChange={() => { setDeleteInst(null); setDeleteError(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle className="text-destructive flex items-center gap-2"><Trash2 className="w-5 h-5" />حذف مؤسسة</DialogTitle></DialogHeader>
            <p className="text-sm">هل تريد حذف <strong>{deleteInst.nameAr}</strong>؟</p>
            <p className="text-xs text-muted-foreground">حذف مؤسسة يحذف كل تخصصاتها وكل ما تحتها (سنوات، مجموعات، مقاييس، نقاط). الحذف محظور ما دامت تحوي تخصصات.</p>
            {deleteError && <div className="rounded-lg bg-destructive/10 text-destructive text-xs p-3 mt-1">{deleteError}</div>}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDeleteInst(null); setDeleteError(null); }}>إلغاء</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>{deleting && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حذف نهائي</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {loading ? <div className="text-center py-4"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {institutions.map((inst) => (
            <Card key={inst.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-sm">{inst.nameAr}</div>
                  <div className="text-xs text-muted-foreground mt-1">{inst.type} • {inst.city}</div>
                </div>
                {isOwner && (
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditName(inst.nameAr); setEditType(inst.type); setEditCity(inst.city); setEditInst(inst); }} aria-label="تعديل المؤسسة">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 h-8 w-8" onClick={() => { setDeleteInst(inst); setDeleteError(null); }} aria-label="حذف المؤسسة">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </Card>
  );
}

function SpecialtiesPanel() {
  // fix أ.1: institution is a proper DROPDOWN (was a raw ID number input),
  // the list shows which institution each specialty belongs to, and the "+"
  // button is always visible even when the list is empty.
  // round 6: + edit/delete (OWNER only, delete guarded server-side).
  const cascade = useCascade();
  const [specialties, setSpecialties] = React.useState<Spec[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(""); const [code, setCode] = React.useState("");
  const [faculty, setFaculty] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const { user } = useAuth();
  const isOwner = user?.role === "OWNER";
  // round 6: edit/delete state
  const [editSpec, setEditSpec] = React.useState<Spec | null>(null);
  const [editName, setEditName] = React.useState(""); const [editCode, setEditCode] = React.useState(""); const [editFaculty, setEditFaculty] = React.useState("");
  const [editSaving, setEditSaving] = React.useState(false);
  const [deleteSpec, setDeleteSpec] = React.useState<Spec | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const fetchData = React.useCallback(async (institutionId: string) => {
    setLoading(true);
    try {
      const url = institutionId ? `/api/specialties?institutionId=${institutionId}` : "/api/specialties";
      const res = await fetch(url, { cache: "no-store" }); const data = await res.json(); setSpecialties(data.specialties ?? []);
    }
    catch { toast.error("فشل تحميل التخصصات"); } finally { setLoading(false); }
  }, []);

  React.useEffect(() => { fetchData(cascade.instId); }, [fetchData, cascade.instId]);

  async function handleCreate() {
    if (!name.trim() || !code.trim()) { toast.error("الاسم والكود مطلوبان"); return; }
    if (!cascade.instId) { toast.error("اختر المؤسسة أولاً — أو أنشئ مؤسسة من تبويب الهيكل"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/specialties", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nameAr: name.trim(), code: code.trim(), institutionId: parseInt(cascade.instId), faculty: faculty.trim() }) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تمت إضافة التخصص — أضف ملامحه من تبويب 'الملامح'");
      setOpen(false); setName(""); setCode(""); setFaculty(""); fetchData(cascade.instId);
    } finally { setSaving(false); }
  }

  async function handleEditSave() {
    if (!editSpec) return;
    if (!editName.trim() || !editCode.trim()) { toast.error("الاسم والكود مطلوبان"); return; }
    setEditSaving(true);
    try {
      const res = await fetch("/api/specialties", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editSpec.id, nameAr: editName.trim(), code: editCode.trim(), faculty: editFaculty.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تم تعديل التخصص");
      setEditSpec(null);
      fetchData(cascade.instId);
    } catch { toast.error("فشل الاتصال"); }
    finally { setEditSaving(false); }
  }

  async function handleDelete() {
    if (!deleteSpec) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/specialties?id=${deleteSpec.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setDeleteError(data.error); toast.error(data.error); return; }
      toast.success("تم حذف التخصص");
      setDeleteSpec(null); setDeleteError(null);
      fetchData(cascade.instId);
    } catch { toast.error("فشل الحذف"); }
    finally { setDeleting(false); }
  }

  const instName = (id: number) => cascade.institutions.find((i) => i.id === id)?.nameAr ?? "—";

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div><h3 className="font-bold text-sm flex items-center gap-2"><GraduationCap className="w-4 h-4 text-primary" />التخصصات</h3><p className="text-xs text-muted-foreground">التخصصات الأكاديمية لكل مؤسسة</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 ml-1" />تخصص</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>إضافة تخصص جديد</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label>المؤسسة</Label>
                <select value={cascade.instId} onChange={(e) => cascade.setInstId(e.target.value)} className={selectCls}>
                  <option value="">— اختر المؤسسة —</option>
                  {cascade.institutions.map((i) => <option key={i.id} value={i.id}>{i.nameAr}</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><Label>اسم التخصص</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: اللغة الفرنسية" /></div>
              <div className="space-y-1.5"><Label>الكود</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="مثال: FR-LIT" /></div>
              <div className="space-y-1.5"><Label>القسم/الكلية</Label><Input value={faculty} onChange={(e) => setFaculty(e.target.value)} placeholder="مثال: قسم اللغات" /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button onClick={handleCreate} disabled={saving}>{saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}إنشاء</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="space-y-1.5">
        <Label>تصفية حسب المؤسسة</Label>
        <select value={cascade.instId} onChange={(e) => cascade.setInstId(e.target.value)} className={selectCls}>
          <option value="">كل المؤسسات</option>
          {cascade.institutions.map((i) => <option key={i.id} value={i.id}>{i.nameAr}</option>)}
        </select>
      </div>
      {loading ? <div className="text-center py-4"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div> : specialties.length === 0 ? (
        <div className="text-center py-4 text-sm text-muted-foreground">لا توجد تخصصات لهذه المؤسسة بعد — أضف واحداً بزر "تخصص"</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {specialties.map((sp) => (
            <Card key={sp.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-sm">{sp.nameAr}</div>
                  <div className="text-xs text-muted-foreground mt-1">{sp.code} {sp.faculty && `• ${sp.faculty}`}</div>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Building2 className="w-3 h-3" />{instName(sp.institutionId)}</div>
                </div>
                {isOwner && (
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditName(sp.nameAr); setEditCode(sp.code); setEditFaculty(sp.faculty); setEditSpec(sp); }} aria-label="تعديل التخصص">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 h-8 w-8" onClick={() => { setDeleteSpec(sp); setDeleteError(null); }} aria-label="حذف التخصص">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* round 6: edit dialog (OWNER only) */}
      {editSpec && (
        <Dialog open onOpenChange={() => setEditSpec(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="w-5 h-5 text-primary" />تعديل التخصص</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5"><Label>اسم التخصص</Label><Input value={editName} onChange={(e) => setEditName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>الكود</Label><Input value={editCode} onChange={(e) => setEditCode(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>القسم/الكلية</Label><Input value={editFaculty} onChange={(e) => setEditFaculty(e.target.value)} /></div>
              <p className="text-xs text-muted-foreground">المؤسسة: {instName(editSpec.institutionId)} (لا يمكن تغييرها بعد الإنشاء)</p>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setEditSpec(null)}>إلغاء</Button><Button onClick={handleEditSave} disabled={editSaving}>{editSaving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حفظ التعديلات</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* round 6: delete confirm — blocked while users/years/tracks/courses exist */}
      {deleteSpec && (
        <Dialog open onOpenChange={() => { setDeleteSpec(null); setDeleteError(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle className="text-destructive flex items-center gap-2"><Trash2 className="w-5 h-5" />حذف تخصص</DialogTitle></DialogHeader>
            <p className="text-sm">هل تريد حذف <strong>{deleteSpec.nameAr}</strong>؟</p>
            <p className="text-xs text-muted-foreground">الحذف محظور ما دام للتخصص مستخدمون أو سنوات أو ملامح أو مقاييس — حمايةً لبياناتهم ونقاطهم.</p>
            {deleteError && <div className="rounded-lg bg-destructive/10 text-destructive text-xs p-3 mt-1">{deleteError}</div>}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDeleteSpec(null); setDeleteError(null); }}>إلغاء</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>{deleting && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حذف نهائي</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

// =====================================================
// Tracks Manager — fix أ.2 (NEW)
// Adding a specialty is useless without tracks; here the supervisor picks a
// specialty then adds tracks — with 3 one-click presets (ابتدائي/متوسط/ثانوي)
// based on the research that tracks = target teaching level.
// =====================================================
const TRACK_PRESETS = [
  { trackNameAr: "أستاذ التعليم الابتدائي (PEP)", code: "PEP" },
  { trackNameAr: "أستاذ التعليم المتوسط (PEM)", code: "PEM" },
  { trackNameAr: "أستاذ التعليم الثانوي (PES)", code: "PES" },
];

function TracksManager() {
  const cascade = useCascade();
  const [tracks, setTracks] = React.useState<Track[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [customName, setCustomName] = React.useState(""); const [customCode, setCustomCode] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  // round 6: edit/delete state
  const [editTrack, setEditTrack] = React.useState<Track | null>(null);
  const [editTrackName, setEditTrackName] = React.useState(""); const [editTrackCode, setEditTrackCode] = React.useState("");
  const [editSaving, setEditSaving] = React.useState(false);
  const [deleteTrack, setDeleteTrack] = React.useState<Track | null>(null);
  const [deletingTrack, setDeletingTrack] = React.useState(false);

  const fetchTracks = React.useCallback(async (specialtyId: string) => {
    if (!specialtyId) { setTracks([]); setLoading(false); return; }
    setLoading(true);
    try { const res = await fetch(`/api/tracks?specialtyId=${specialtyId}`, { cache: "no-store" }); const data = await res.json(); setTracks(data.tracks ?? []); }
    catch { toast.error("فشل تحميل الملامح"); } finally { setLoading(false); }
  }, []);

  React.useEffect(() => { fetchTracks(cascade.specId); }, [fetchTracks, cascade.specId]);

  async function addTrack(trackNameAr: string, code: string) {
    if (!cascade.specId) { toast.error("اختر التخصص أولاً"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/tracks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specialtyId: parseInt(cascade.specId), trackNameAr, code }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return false; }
      return true;
    } finally { setSaving(false); }
  }

  async function handlePreset(preset: { trackNameAr: string; code: string }) {
    const ok = await addTrack(preset.trackNameAr, preset.code);
    if (ok) { toast.success(`تمت إضافة "${preset.code}"`); fetchTracks(cascade.specId); }
  }

  async function handleCustom() {
    if (!customName.trim() || !customCode.trim()) { toast.error("اسم الملمح والكود مطلوبان"); return; }
    const ok = await addTrack(customName.trim(), customCode.trim().toUpperCase());
    if (ok) { toast.success("تمت إضافة الملمح"); setCustomName(""); setCustomCode(""); setOpen(false); fetchTracks(cascade.specId); }
  }

  async function handleEditSave() {
    if (!editTrack) return;
    if (!editTrackName.trim() || !editTrackCode.trim()) { toast.error("اسم الملمح والكود مطلوبان"); return; }
    setEditSaving(true);
    try {
      const res = await fetch("/api/tracks", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editTrack.id, trackNameAr: editTrackName.trim(), code: editTrackCode.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تم تعديل الملمح");
      setEditTrack(null);
      fetchTracks(cascade.specId);
    } catch { toast.error("فشل الاتصال"); }
    finally { setEditSaving(false); }
  }

  async function handleDeleteTrack() {
    if (!deleteTrack) return;
    setDeletingTrack(true);
    try {
      const res = await fetch(`/api/tracks?id=${deleteTrack.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تم حذف الملمح");
      setDeleteTrack(null);
      fetchTracks(cascade.specId);
    } catch { toast.error("فشل الحذف"); }
    finally { setDeletingTrack(false); }
  }

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="font-bold text-sm flex items-center gap-2"><Route className="w-4 h-4 text-primary" />الملامح الأكاديمية</h3>
        <p className="text-xs text-muted-foreground mt-1">الملمح = المستوى التعليمي المستهدف (ابتدائي / متوسط / ثانوي)</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label>المؤسسة</Label>
          <select value={cascade.instId} onChange={(e) => cascade.setInstId(e.target.value)} className={selectCls}>
            <option value="">— اختر —</option>
            {cascade.institutions.map((i) => <option key={i.id} value={i.id}>{i.nameAr}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>التخصص</Label>
          <select value={cascade.specId} onChange={(e) => cascade.setSpecId(e.target.value)} className={selectCls}>
            <option value="">— اختر —</option>
            {cascade.specialties.map((s) => <option key={s.id} value={s.id}>{s.nameAr}</option>)}
          </select>
        </div>
      </div>

      {!cascade.specId ? (
        <div className="text-center py-6 text-sm text-muted-foreground">اختر مؤسسة وتخصصاً لعرض/إضافة الملامح</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {TRACK_PRESETS.map((p) => {
              const exists = tracks.some((t) => t.code === p.code);
              return (
                <Button key={p.code} size="sm" variant={exists ? "outline" : "secondary"} disabled={saving || exists} onClick={() => handlePreset(p)}>
                  <Plus className="w-3.5 h-3.5 ml-1" />{p.code}{exists ? <Check className="w-3.5 h-3.5 ml-1" /> : null}
                </Button>
              );
            })}
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button size="sm" variant="ghost"><Plus className="w-3.5 h-3.5 ml-1" />ملمح آخر...</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>إضافة ملمح مخصص</DialogTitle></DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="space-y-1.5"><Label>اسم الملمح</Label><Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="مثال: أستاذ التعليم الثانوي (تخصص رياضيات)" /></div>
                  <div className="space-y-1.5"><Label>الكود</Label><Input value={customCode} onChange={(e) => setCustomCode(e.target.value)} placeholder="مثال: PES-MATH" /></div>
                </div>
                <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button onClick={handleCustom} disabled={saving}>{saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}إضافة</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? <div className="text-center py-4"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div> : tracks.length === 0 ? (
            <div className="text-center py-4 text-sm text-muted-foreground">لا توجد ملامح لهذا التخصص — استخدم الأزرار السريعة أعلاه</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {tracks.map((tr) => (
                <Card key={tr.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-sm">{tr.trackNameAr}</div>
                      <div className="text-xs text-muted-foreground mt-1"><Badge variant="outline" className="text-xs">{tr.code}</Badge></div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditTrackName(tr.trackNameAr); setEditTrackCode(tr.code); setEditTrack(tr); }} aria-label="تعديل الملمح">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 h-8 w-8" onClick={() => setDeleteTrack(tr)} aria-label="حذف الملمح">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* round 6: edit dialog */}
          {editTrack && (
            <Dialog open onOpenChange={() => setEditTrack(null)}>
              <DialogContent>
                <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="w-5 h-5 text-primary" />تعديل الملمح</DialogTitle></DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="space-y-1.5"><Label>اسم الملمح</Label><Input value={editTrackName} onChange={(e) => setEditTrackName(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>الكود</Label><Input value={editTrackCode} onChange={(e) => setEditTrackCode(e.target.value)} /></div>
                </div>
                <DialogFooter><Button variant="outline" onClick={() => setEditTrack(null)}>إلغاء</Button><Button onClick={handleEditSave} disabled={editSaving}>{editSaving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حفظ التعديلات</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {/* round 6: delete confirm — DB-safe (SET NULL), warns about cohorts losing the link */}
          {deleteTrack && (
            <Dialog open onOpenChange={() => setDeleteTrack(null)}>
              <DialogContent>
                <DialogHeader><DialogTitle className="text-destructive flex items-center gap-2"><Trash2 className="w-5 h-5" />حذف ملمح</DialogTitle></DialogHeader>
                <p className="text-sm">هل تريد حذف <strong>{deleteTrack.trackNameAr}</strong>؟</p>
                <p className="text-xs text-muted-foreground">الأفواج المرتبطة بهذا الملمح ستبقى لكنها ستفقد ارتباطها به. لا تُحذف أي بيانات أخرى.</p>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDeleteTrack(null)}>إلغاء</Button>
                  <Button variant="destructive" onClick={handleDeleteTrack} disabled={deletingTrack}>{deletingTrack && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حذف</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </>
      )}
    </Card>
  );
}

// =====================================================
// Years Manager — NEW in round 3 (زر "السنوات")
// The admin previously had NO way to add study years: every year dropdown
// in the app (groups, cohorts, modules, onboarding) read a read-only list.
// A new specialty started with zero years → impossible to create groups or
// regiments. This tab adds years (quick presets 1..5 + custom) and lets the
// supervisor delete a year (blocked while groups/cohorts/modules exist).
// =====================================================
const YEAR_PRESETS = ["السنة الأولى", "السنة الثانية", "السنة الثالثة", "السنة الرابعة", "السنة الخامسة"];

interface YearRow extends Year { semester?: number }

function YearsManager() {
  const cascade = useCascade();
  const [years, setYears] = React.useState<YearRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [customName, setCustomName] = React.useState("");
  const [customSemester, setCustomSemester] = React.useState("1");
  const [saving, setSaving] = React.useState(false);
  const [deleteYear, setDeleteYear] = React.useState<YearRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  // round 5: edit dialog state (rename + semester)
  const [editYear, setEditYear] = React.useState<YearRow | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editSemester, setEditSemester] = React.useState("1");
  const [editSaving, setEditSaving] = React.useState(false);

  const fetchYears = React.useCallback(async (specialtyId: string) => {
    if (!specialtyId) { setYears([]); setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/years?specialtyId=${specialtyId}`, { cache: "no-store" });
      const data = await res.json();
      setYears(data.years ?? []);
    } catch { toast.error("فشل تحميل السنوات"); }
    finally { setLoading(false); }
  }, []);

  React.useEffect(() => { fetchYears(cascade.specId); }, [fetchYears, cascade.specId]);

  async function addYear(yearName: string, semester?: number) {
    if (!cascade.specId) { toast.error("اختر المؤسسة والتخصص أولاً"); return false; }
    setSaving(true);
    try {
      const res = await fetch("/api/years", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specialtyId: parseInt(cascade.specId), yearName, semester }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return false; }
      return true;
    } catch { toast.error("فشل الاتصال"); return false; }
    finally { setSaving(false); }
  }

  async function handlePreset(name: string) {
    const ok = await addYear(name);
    if (ok) { toast.success(`تمت إضافة "${name}"`); fetchYears(cascade.specId); }
  }

  async function handleCustom() {
    if (!customName.trim()) { toast.error("اكتب اسم السنة"); return; }
    const ok = await addYear(customName.trim(), parseInt(customSemester));
    if (ok) {
      toast.success("تمت إضافة السنة");
      setCustomName(""); setCustomSemester("1"); setOpen(false);
      fetchYears(cascade.specId);
    }
  }

  async function handleDelete(year: YearRow) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/years?id=${year.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تم حذف السنة");
      setDeleteYear(null);
      fetchYears(cascade.specId);
    } catch { toast.error("فشل الحذف"); }
    finally { setDeleting(false); }
  }

  function openEditYear(y: YearRow) {
    setEditName(y.yearName);
    setEditSemester(String(y.semester ?? 1));
    setEditYear(y);
  }

  async function handleEditSave() {
    if (!editYear) return;
    if (!editName.trim()) { toast.error("اكتب اسم السنة"); return; }
    setEditSaving(true);
    try {
      const res = await fetch("/api/years", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editYear.id, yearName: editName.trim(), semester: parseInt(editSemester) }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تم تعديل السنة");
      setEditYear(null);
      fetchYears(cascade.specId);
    } catch { toast.error("فشل الاتصال"); }
    finally { setEditSaving(false); }
  }

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="font-bold text-sm flex items-center gap-2"><CalendarDays className="w-4 h-4 text-primary" />السنوات الدراسية</h3>
        <p className="text-xs text-muted-foreground mt-1">أضف سنوات التخصص حتى تتمكن من إنشاء المجموعات والأفواج والمقاييس</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label>المؤسسة</Label>
          <select value={cascade.instId} onChange={(e) => cascade.setInstId(e.target.value)} className={selectCls}>
            <option value="">— اختر —</option>
            {cascade.institutions.map((i) => <option key={i.id} value={i.id}>{i.nameAr}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>التخصص</Label>
          <select value={cascade.specId} onChange={(e) => cascade.setSpecId(e.target.value)} className={selectCls}>
            <option value="">— اختر —</option>
            {cascade.specialties.map((s) => <option key={s.id} value={s.id}>{s.nameAr}</option>)}
          </select>
        </div>
      </div>

      {!cascade.specId ? (
        <div className="text-center py-6 text-sm text-muted-foreground">اختر مؤسسة وتخصصاً لعرض/إضافة السنوات</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {YEAR_PRESETS.map((name) => {
              const exists = years.some((y) => y.yearName === name);
              return (
                <Button key={name} size="sm" variant={exists ? "outline" : "secondary"} disabled={saving || exists} onClick={() => handlePreset(name)}>
                  <Plus className="w-3.5 h-3.5 ml-1" />{name}{exists ? <Check className="w-3.5 h-3.5 ml-1" /> : null}
                </Button>
              );
            })}
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button size="sm" variant="ghost"><Plus className="w-3.5 h-3.5 ml-1" />سنة أخرى...</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>إضافة سنة مخصصة</DialogTitle></DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="space-y-1.5"><Label>اسم السنة</Label><Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="مثال: السنة السادسة (تحضيري)" /></div>
                  <div className="space-y-1.5">
                    <Label>السداسي</Label>
                    <select value={customSemester} onChange={(e) => setCustomSemester(e.target.value)} className={selectCls}>
                      <option value="1">السداسي 1</option>
                      <option value="2">السداسي 2</option>
                    </select>
                  </div>
                </div>
                <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button onClick={handleCustom} disabled={saving}>{saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}إضافة</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? <div className="text-center py-4"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div> : years.length === 0 ? (
            <div className="text-center py-4 text-sm text-muted-foreground">لا توجد سنوات لهذا التخصص — استخدم الأزرار السريعة أعلاه</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {years.map((y) => (
                <Card key={y.id} className="p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-sm">{y.yearName}</div>
                      <Badge variant="outline" className="mt-2 text-xs">ID: {y.id}</Badge>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditYear(y)} aria-label="تعديل السنة">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10 h-8 w-8" onClick={() => setDeleteYear(y)} aria-label="حذف السنة">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {deleteYear && (
        <Dialog open onOpenChange={() => setDeleteYear(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="text-destructive flex items-center gap-2"><Trash2 className="w-5 h-5" />حذف سنة</DialogTitle></DialogHeader>
            <p className="text-sm">هل تريد حذف <strong>{deleteYear.yearName}</strong>؟ سيتم فصل الطلبة المرتبطين بها. لا يمكن الحذف إذا كانت تحتوي مجموعات أو أفواجاً أو مقاييس.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteYear(null)}>إلغاء</Button>
              <Button variant="destructive" onClick={() => handleDelete(deleteYear)} disabled={deleting}>{deleting && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حذف نهائي</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {editYear && (
        <Dialog open onOpenChange={() => setEditYear(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="w-5 h-5" />تعديل السنة</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5"><Label>اسم السنة</Label><Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="مثال: السنة الثالثة" /></div>
              <div className="space-y-1.5">
                <Label>السداسي</Label>
                <select value={editSemester} onChange={(e) => setEditSemester(e.target.value)} className={selectCls}>
                  <option value="1">السداسي 1</option>
                  <option value="2">السداسي 2</option>
                </select>
              </div>
              <p className="text-xs text-muted-foreground">التعديل آمن حتى لو كانت السنة تحتوي مجموعات وأفواجاً ومقاييس — لا تُفقد أي بيانات.</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditYear(null)}>إلغاء</Button>
              <Button onClick={handleEditSave} disabled={editSaving}>{editSaving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حفظ التعديل</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

// =====================================================
// Cohorts Manager — fix ب: cohort creation now asks for
// institution → specialty → track → year → GROUP → name.
// A cohort can no longer be created without a parent group.
// =====================================================
function CohortsManager() {
  const cascade = useCascade();
  const [cohorts, setCohorts] = React.useState<Array<{ id: number; groupName: string; subGroup: string; academicYearId: number; groupId: number | null }>>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [listInst, setListInst] = React.useState<string>("");
  const [listSpec, setListSpec] = React.useState<string>("");
  const [listYear, setYear] = React.useState<string>("");
  const [listSpecialties, setListSpecialties] = React.useState<Spec[]>([]);
  const [listYears, setListYears] = React.useState<Year[]>([]);
  const [deleteCohort, setDeleteCohort] = React.useState<{ id: number; groupName: string; subGroup: string } | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  // round 5: edit state (rename cohort)
  const [editCohort, setEditCohort] = React.useState<{ id: number; groupName: string; subGroup: string } | null>(null);
  const [editCohortName, setEditCohortName] = React.useState("");
  const [editSubGroup, setEditSubGroup] = React.useState("");
  const [editCohortSaving, setEditCohortSaving] = React.useState(false);

  // list filters (separate light cascade for browsing)
  React.useEffect(() => {
    if (!listInst) { setListSpecialties([]); return; }
    fetch(`/api/specialties?institutionId=${listInst}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => { const l: Spec[] = data.specialties ?? []; setListSpecialties(l); if (l.length > 0) setListSpec(String(l[0].id)); else setListSpec(""); })
      .catch(() => setListSpecialties([]));
  }, [listInst]);

  React.useEffect(() => {
    if (!listSpec) { setListYears([]); setYear(""); return; }
    fetch(`/api/onboarding/years?specialtyId=${listSpec}`)
      .then((r) => r.json())
      .then((data) => { const l: Year[] = data.years ?? []; setListYears(l); if (l.length > 0) setYear(String(l[0].id)); else setYear(""); })
      .catch(() => setListYears([]));
  }, [listSpec]);

  const fetchCohorts = React.useCallback(async () => {
    if (!listSpec || !listYear) { setCohorts([]); setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/cohort?specialtyId=${listSpec}&academicYearId=${listYear}`, { cache: "no-store" });
      const data = await res.json();
      setCohorts(data.cohorts ?? []);
    } catch { toast.error("فشل تحميل الأفواج"); } finally { setLoading(false); }
  }, [listSpec, listYear]);

  React.useEffect(() => { fetchCohorts(); }, [fetchCohorts]);

  async function handleCreate() {
    if (!newName.trim()) { toast.error("اكتب اسم الفوج"); return; }
    if (!cascade.specId || !cascade.yearId || !cascade.groupId) {
      toast.error("اختر المؤسسة والتخصص والسنة والمجموعة أولاً");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/cohort", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          specialtyId: parseInt(cascade.specId),
          academicYearId: parseInt(cascade.yearId),
          trackId: cascade.trackId ? parseInt(cascade.trackId) : undefined,
          groupId: parseInt(cascade.groupId),
          groupName: newName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تم إنشاء الفوج داخل المجموعة");
      setNewName(""); setOpen(false); fetchCohorts();
    } finally { setCreating(false); }
  }

  async function handleDelete(c: { id: number; groupName: string }) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/cohort?id=${c.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تم حذف الفوج");
      setDeleteCohort(null);
      fetchCohorts();
    } catch { toast.error("فشل الحذف"); }
    finally { setDeleting(false); }
  }

  function openEditCohort(c: { id: number; groupName: string; subGroup: string }) {
    setEditCohortName(c.groupName);
    setEditSubGroup(c.subGroup ?? "");
    setEditCohort(c);
  }

  async function handleEditCohortSave() {
    if (!editCohort) return;
    if (!editCohortName.trim()) { toast.error("اكتب اسم الفوج"); return; }
    setEditCohortSaving(true);
    try {
      const res = await fetch("/api/cohort", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editCohort.id, groupName: editCohortName.trim(), subGroup: editSubGroup.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تم تعديل الفوج");
      setEditCohort(null);
      fetchCohorts();
    } catch { toast.error("فشل الاتصال"); }
    finally { setEditCohortSaving(false); }
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div><h3 className="font-bold text-sm flex items-center gap-2"><Layers className="w-4 h-4 text-primary" />إدارة الأفواج</h3><p className="text-xs text-muted-foreground">الفوج يُنشأ دائماً داخل مجموعة</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 ml-1" />فوج جديد</Button></DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>إنشاء فوج جديد</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5"><Label>1. المؤسسة</Label>
                <select value={cascade.instId} onChange={(e) => cascade.setInstId(e.target.value)} className={selectCls}>
                  <option value="">— اختر —</option>
                  {cascade.institutions.map((i) => <option key={i.id} value={i.id}>{i.nameAr}</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><Label>2. التخصص</Label>
                <select value={cascade.specId} onChange={(e) => cascade.setSpecId(e.target.value)} className={selectCls}>
                  <option value="">— اختر —</option>
                  {cascade.specialties.map((s) => <option key={s.id} value={s.id}>{s.nameAr}</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><Label>3. الملمح (اختياري)</Label>
                <select value={cascade.trackId} onChange={(e) => cascade.setTrackId(e.target.value)} className={selectCls}>
                  <option value="">— بدون ملمح —</option>
                  {cascade.tracks.map((t) => <option key={t.id} value={t.id}>{t.trackNameAr}</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><Label>4. السنة الدراسية</Label>
                <select value={cascade.yearId} onChange={(e) => cascade.setYearId(e.target.value)} className={selectCls}>
                  <option value="">— اختر —</option>
                  {cascade.years.map((y) => <option key={y.id} value={y.id}>{y.yearName}</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><Label>5. المجموعة الأم</Label>
                {cascade.groups.length === 0 ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">لا توجد مجموعات لهذا الاختيار — أنشئ مجموعة أولاً من تبويب "المجموعات"</p>
                ) : (
                  <select value={cascade.groupId} onChange={(e) => cascade.setGroupId(e.target.value)} className={selectCls}>
                    <option value="">— اختر —</option>
                    {cascade.groups.map((g) => <option key={g.id} value={g.id}>{g.groupName}</option>)}
                  </select>
                )}
              </div>
              <div className="space-y-1.5"><Label>6. اسم الفوج</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="مثال: الفوج 04" /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button onClick={handleCreate} disabled={creating}>{creating && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}إنشاء</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="space-y-1.5">
          <Label>المؤسسة</Label>
          <select value={listInst} onChange={(e) => setListInst(e.target.value)} className={selectCls}>
            <option value="">— اختر —</option>
            {cascade.institutions.map((i) => <option key={i.id} value={i.id}>{i.nameAr}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>التخصص</Label>
          <select value={listSpec} onChange={(e) => setListSpec(e.target.value)} className={selectCls}>
            <option value="">— اختر —</option>
            {listSpecialties.map((s) => <option key={s.id} value={s.id}>{s.nameAr}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>السنة الدراسية</Label>
          <select value={listYear} onChange={(e) => setYear(e.target.value)} className={selectCls}>
            <option value="">— اختر —</option>
            {listYears.map((y) => <option key={y.id} value={y.id}>{y.yearName}</option>)}
          </select>
        </div>
      </div>

      {loading ? <div className="text-center py-4"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div> : !listSpec || !listYear ? (
        <div className="text-center py-4 text-sm text-muted-foreground">اختر مؤسسة وتخصصاً وسنة لعرض الأفواج</div>
      ) : cohorts.length === 0 ? (
        <div className="text-center py-4 text-sm text-muted-foreground">لا توجد أفواج في هذه السنة</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {cohorts.map((c) => (
            <Card key={c.id} className="p-3">
              <div className="flex items-start justify-between">
                <div><div className="font-bold text-sm">{c.groupName}</div>{c.subGroup && <div className="text-xs text-muted-foreground mt-0.5">{c.subGroup}</div>}<Badge variant="outline" className="mt-2 text-xs">ID: {c.id}</Badge></div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditCohort(c)} aria-label="تعديل الفوج"><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10 h-8 w-8" onClick={() => setDeleteCohort(c)} aria-label="حذف الفوج"><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {deleteCohort && (
        <Dialog open onOpenChange={() => setDeleteCohort(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="text-destructive flex items-center gap-2"><Trash2 className="w-5 h-5" />حذف فوج</DialogTitle></DialogHeader>
            <p className="text-sm">هل تريد حذف <strong>{deleteCohort.groupName}</strong>؟ سيُرفض الحذف إذا كان هناك طلبة ملحقون به.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteCohort(null)}>إلغاء</Button>
              <Button variant="destructive" onClick={() => handleDelete(deleteCohort)} disabled={deleting}>{deleting && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حذف نهائي</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {editCohort && (
        <Dialog open onOpenChange={() => setEditCohort(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="w-5 h-5" />تعديل الفوج</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5"><Label>اسم الفوج</Label><Input value={editCohortName} onChange={(e) => setEditCohortName(e.target.value)} placeholder="مثال: الفوج 04" /></div>
              <div className="space-y-1.5"><Label>القسم الفرعي (اختياري)</Label><Input value={editSubGroup} onChange={(e) => setEditSubGroup(e.target.value)} placeholder="مثال: الفرع ب" /></div>
              <p className="text-xs text-muted-foreground">يمكن تعديل الفوج حتى لو كان به طلبة ملحقون — الاسم فقط يتغير دون المساس بالبيانات.</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditCohort(null)}>إلغاء</Button>
              <Button onClick={handleEditCohortSave} disabled={editCohortSaving}>{editCohortSaving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حفظ التعديل</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

// =====================================================
// Groups Manager — fix ب: creation asks institution →
// specialty → year → track → name (was year-only!)
// =====================================================
function GroupsManager() {
  const cascade = useCascade();
  const [groups, setGroups] = React.useState<GroupRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [newName, setNewName] = React.useState(""); const [newDesc, setNewDesc] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [listYear, setListYear] = React.useState<string>("");
  // round 5: edit state + dialog-based delete (replaced native confirm())
  const [editGroup, setEditGroup] = React.useState<GroupRow | null>(null);
  const [editGroupName, setEditGroupName] = React.useState("");
  const [editGroupDesc, setEditGroupDesc] = React.useState("");
  const [editGroupSaving, setEditGroupSaving] = React.useState(false);
  const [deleteGroup, setDeleteGroup] = React.useState<GroupRow | null>(null);
  const [deletingGroup, setDeletingGroup] = React.useState(false);

  React.useEffect(() => { setListYear(cascade.yearId); }, [cascade.yearId]);

  const fetchGroups = React.useCallback(async () => {
    if (!cascade.specId || !listYear) { setGroups([]); setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/groups?specialtyId=${cascade.specId}&academicYearId=${listYear}`, { cache: "no-store" });
      const data = await res.json(); setGroups(data.groups ?? []);
    } catch { toast.error("فشل تحميل المجموعات"); } finally { setLoading(false); }
  }, [cascade.specId, listYear]);

  React.useEffect(() => { fetchGroups(); }, [fetchGroups]);

  async function handleCreate() {
    if (!newName.trim()) { toast.error("اكتب اسم المجموعة"); return; }
    if (!cascade.specId || !cascade.yearId) { toast.error("اختر المؤسسة والتخصص والسنة أولاً"); return; }
    setCreating(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          specialtyId: parseInt(cascade.specId),
          academicYearId: parseInt(cascade.yearId),
          trackId: cascade.trackId ? parseInt(cascade.trackId) : undefined,
          groupName: newName.trim(), description: newDesc.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تم إنشاء المجموعة"); setNewName(""); setNewDesc(""); setOpen(false); fetchGroups();
    } finally { setCreating(false); }
  }

  async function handleDelete(g: GroupRow) {
    setDeletingGroup(true);
    try {
      const res = await fetch(`/api/groups?id=${g.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تم حذف المجموعة");
      setDeleteGroup(null);
      fetchGroups();
    } catch { toast.error("فشل الحذف"); }
    finally { setDeletingGroup(false); }
  }

  function openEditGroup(g: GroupRow) {
    setEditGroupName(g.groupName);
    setEditGroupDesc(g.description ?? "");
    setEditGroup(g);
  }

  async function handleEditGroupSave() {
    if (!editGroup) return;
    if (!editGroupName.trim()) { toast.error("اكتب اسم المجموعة"); return; }
    setEditGroupSaving(true);
    try {
      const res = await fetch("/api/groups", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editGroup.id, groupName: editGroupName.trim(), description: editGroupDesc.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تم تعديل المجموعة");
      setEditGroup(null);
      fetchGroups();
    } catch { toast.error("فشل الاتصال"); }
    finally { setEditGroupSaving(false); }
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div><h3 className="font-bold text-sm flex items-center gap-2"><FolderTree className="w-4 h-4 text-primary" />إدارة المجموعات</h3><p className="text-xs text-muted-foreground">المجموعة تنتمي لمؤسسة+تخصص+سنة، وتحتوي عدة أفواج</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 ml-1" />مجموعة</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>إنشاء مجموعة جديدة</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5"><Label>1. المؤسسة</Label>
                <select value={cascade.instId} onChange={(e) => cascade.setInstId(e.target.value)} className={selectCls}>
                  <option value="">— اختر —</option>
                  {cascade.institutions.map((i) => <option key={i.id} value={i.id}>{i.nameAr}</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><Label>2. التخصص</Label>
                <select value={cascade.specId} onChange={(e) => cascade.setSpecId(e.target.value)} className={selectCls}>
                  <option value="">— اختر —</option>
                  {cascade.specialties.map((s) => <option key={s.id} value={s.id}>{s.nameAr}</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><Label>3. الملمح (اختياري)</Label>
                <select value={cascade.trackId} onChange={(e) => cascade.setTrackId(e.target.value)} className={selectCls}>
                  <option value="">— بدون ملمح —</option>
                  {cascade.tracks.map((t) => <option key={t.id} value={t.id}>{t.trackNameAr}</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><Label>4. السنة الدراسية</Label>
                <select value={cascade.yearId} onChange={(e) => cascade.setYearId(e.target.value)} className={selectCls}>
                  <option value="">— اختر —</option>
                  {cascade.years.map((y) => <option key={y.id} value={y.id}>{y.yearName}</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><Label>5. اسم المجموعة</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="مثال: المجموعة 3" /></div>
              <div className="space-y-1.5"><Label>الوصف</Label><Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="مثال: مجموعة مسائية" /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button onClick={handleCreate} disabled={creating}>{creating && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}إنشاء</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <div className="space-y-1.5"><Label>المؤسسة</Label>
          <select value={cascade.instId} onChange={(e) => cascade.setInstId(e.target.value)} className={selectCls}>
            <option value="">— اختر —</option>
            {cascade.institutions.map((i) => <option key={i.id} value={i.id}>{i.nameAr}</option>)}
          </select>
        </div>
        <div className="space-y-1.5"><Label>التخصص</Label>
          <select value={cascade.specId} onChange={(e) => cascade.setSpecId(e.target.value)} className={selectCls}>
            <option value="">— اختر —</option>
            {cascade.specialties.map((s) => <option key={s.id} value={s.id}>{s.nameAr}</option>)}
          </select>
        </div>
        <div className="space-y-1.5"><Label>السنة الدراسية</Label>
          <select value={listYear} onChange={(e) => setListYear(e.target.value)} className={selectCls}>
            <option value="">— اختر —</option>
            {cascade.years.map((y) => <option key={y.id} value={y.id}>{y.yearName}</option>)}
          </select>
        </div>
        <div className="space-y-1.5"><Label>الملمح (اختياري)</Label>
          <select value={cascade.trackId} onChange={(e) => cascade.setTrackId(e.target.value)} className={selectCls}>
            <option value="">— الكل —</option>
            {cascade.tracks.map((t) => <option key={t.id} value={t.id}>{t.code}</option>)}
          </select>
        </div>
      </div>

      {loading ? <div className="text-center py-4"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div> : !cascade.specId || !listYear ? (
        <div className="text-center py-4 text-sm text-muted-foreground">اختر مؤسسة وتخصصاً وسنة لعرض المجموعات</div>
      ) : groups.length === 0 ? (
        <div className="text-center py-4 text-sm text-muted-foreground">لا توجد مجموعات في هذه السنة</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {groups.map((g) => (
            <Card key={g.id} className="p-3">
              <div className="flex items-start justify-between">
                <div><div className="font-bold text-sm flex items-center gap-1"><FolderTree className="w-3.5 h-3.5 text-primary" />{g.groupName}</div>{g.description && <div className="text-xs text-muted-foreground mt-1">{g.description}</div>}</div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditGroup(g)} aria-label="تعديل المجموعة"><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10 h-8 w-8" onClick={() => setDeleteGroup(g)} aria-label="حذف المجموعة"><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {deleteGroup && (
        <Dialog open onOpenChange={() => setDeleteGroup(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="text-destructive flex items-center gap-2"><Trash2 className="w-5 h-5" />حذف مجموعة</DialogTitle></DialogHeader>
            <p className="text-sm">هل تريد حذف <strong>{deleteGroup.groupName}</strong>؟ سيُرفض الحذف إذا كانت تحتوي أفواجاً.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteGroup(null)}>إلغاء</Button>
              <Button variant="destructive" onClick={() => handleDelete(deleteGroup)} disabled={deletingGroup}>{deletingGroup && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حذف نهائي</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {editGroup && (
        <Dialog open onOpenChange={() => setEditGroup(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="w-5 h-5" />تعديل المجموعة</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5"><Label>اسم المجموعة</Label><Input value={editGroupName} onChange={(e) => setEditGroupName(e.target.value)} placeholder="مثال: المجموعة 3" /></div>
              <div className="space-y-1.5"><Label>الوصف</Label><Input value={editGroupDesc} onChange={(e) => setEditGroupDesc(e.target.value)} placeholder="مثال: مجموعة مسائية" /></div>
              <p className="text-xs text-muted-foreground">يمكن تعديل المجموعة حتى لو كانت تحتوي أفواجاً — الاسم والوصف فقط يتغيران.</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditGroup(null)}>إلغاء</Button>
              <Button onClick={handleEditGroupSave} disabled={editGroupSaving}>{editGroupSaving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حفظ التعديل</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

// =====================================================
// Join Requests Manager
// =====================================================
function JoinRequestsManager() {
  const [requests, setRequests] = React.useState<Array<{ id: number; requesterName: string; cohortName: string; message: string; createdAt: string }>>([]);
  const [loading, setLoading] = React.useState(true);
  const [actioning, setActioning] = React.useState<number | null>(null);
  const fetchRequests = React.useCallback(async () => {
    setLoading(true);
    try { const res = await fetch("/api/join-requests", { cache: "no-store" }); const data = await res.json(); setRequests(data.requests ?? []); }
    catch { toast.error("فشل تحميل الطلبات"); } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { fetchRequests(); }, [fetchRequests]);
  async function handleAction(id: number, action: "approve" | "reject") {
    setActioning(id);
    try {
      const res = await fetch(`/api/join-requests/${id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: "" }) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success(data.message); fetchRequests();
    } finally { setActioning(null); }
  }
  return (
    <Card className="p-4 space-y-3">
      <div><h3 className="font-bold text-sm flex items-center gap-2"><UserPlus className="w-4 h-4 text-primary" />طلبات الانضمام المعلّقة</h3><p className="text-xs text-muted-foreground mt-1">الطلبات يرسلها الطلاب من شاشة "تصفح المجموعات"</p></div>
      {loading ? <div className="text-center py-8"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div> : requests.length === 0 ? (
        <div className="text-center py-8"><CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2" /><p className="text-sm text-muted-foreground">لا توجد طلبات معلّقة</p></div>
      ) : (
        <div className="space-y-2">
          {requests.map((req) => (
            <Card key={req.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm">{req.requesterName}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">يريد الانضمام لـ: <strong>{req.cohortName}</strong></div>
                  {req.message && <div className="text-xs text-muted-foreground mt-1 italic">"{req.message}"</div>}
                  <div className="text-xs text-muted-foreground mt-1">{new Date(req.createdAt).toLocaleString("ar")}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700" onClick={() => handleAction(req.id, "approve")} disabled={actioning === req.id}>{actioning === req.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}</Button>
                  <Button size="sm" variant="destructive" className="h-8" onClick={() => handleAction(req.id, "reject")} disabled={actioning === req.id}><X className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Card>
  );
}

// =====================================================
// Modules Manager — round 6: edit + delete (the flagship fix).
// (Earlier fix: year + semester selectors — was hardcoded to year 1 /
// semester 1, the exact cause of the "added to semester 1 but shows
// under All" bug.)
// Before: an "add course" button existed but NO way to correct or remove a
// course — a typo in the name/code/professor was permanent for every
// student. Now each course row has edit (pencil) and delete (trash).
// Deletion is guarded server-side: blocked while exams/assignments/grades/
// lectures still reference the course (the message explains what to clear).
// =====================================================
interface CourseRow {
  id: number; name: string; code: string; professorName: string;
  coefficient: number; semester: number; academicYearId: number;
}

function ModulesManager() {
  const [courses, setCourses] = React.useState<CourseRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(""); const [code, setCode] = React.useState("");
  const [professor, setProfessor] = React.useState(""); const [coefficient, setCoefficient] = React.useState("2");
  const [saving, setSaving] = React.useState(false);
  const [years, setYears] = React.useState<Year[]>([]);
  const [selYear, setSelYear] = React.useState<string>("");
  const [selSemester, setSelSemester] = React.useState("1");
  const { user } = useAuth();
  // round 6: edit/delete state
  const [editCourse, setEditCourse] = React.useState<CourseRow | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editCode, setEditCode] = React.useState("");
  const [editProfessor, setEditProfessor] = React.useState("");
  const [editCoefficient, setEditCoefficient] = React.useState("2");
  const [editYear, setEditYear] = React.useState("");
  const [editSemester, setEditSemester] = React.useState("1");
  const [editSaving, setEditSaving] = React.useState(false);
  const [deleteCourse, setDeleteCourse] = React.useState<CourseRow | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    fetch(`/api/onboarding/years?specialtyId=${user?.assignedSpecialtyId ?? 1}`)
      .then((r) => r.json())
      .then((data) => {
        const l: Year[] = data.years ?? [];
        setYears(l);
        const own = l.find((y) => y.id === user?.scopeAcademicYearId);
        setSelYear(own ? String(own.id) : (l.length > 0 ? String(l[0].id) : ""));
      })
      .catch(() => setYears([]));
  }, [user]);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try { const res = await fetch("/api/courses", { cache: "no-store" }); const data = await res.json(); setCourses(data.courses ?? []); }
    catch {} finally { setLoading(false); }
  }, []);
  React.useEffect(() => { fetchData(); }, [fetchData]);

  async function handleCreate() {
    if (!name.trim() || !code.trim()) { toast.error("الاسم والكود مطلوبان"); return; }
    if (!selYear) { toast.error("اختر السنة الدراسية"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/courses", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), code: code.trim(), professorName: professor.trim(),
          coefficient: parseFloat(coefficient) || 2,
          specialtyId: user?.assignedSpecialtyId ?? 1,
          academicYearId: parseInt(selYear),
          semester: parseInt(selSemester),
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تمت إضافة المقياس"); setOpen(false); setName(""); setCode(""); setProfessor(""); fetchData();
    } finally { setSaving(false); }
  }

  function openEditCourse(c: CourseRow) {
    setEditName(c.name); setEditCode(c.code);
    setEditProfessor(c.professorName || "");
    setEditCoefficient(String(c.coefficient ?? 2));
    setEditYear(String(c.academicYearId ?? ""));
    setEditSemester(String(c.semester ?? 1));
    setEditCourse(c);
  }

  async function handleEditSave() {
    if (!editCourse) return;
    if (!editName.trim() || !editCode.trim()) { toast.error("الاسم والكود مطلوبان"); return; }
    setEditSaving(true);
    try {
      const res = await fetch("/api/courses", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editCourse.id, name: editName.trim(), code: editCode.trim(),
          professorName: editProfessor.trim(), coefficient: parseFloat(editCoefficient) || 2,
          semester: parseInt(editSemester),
          ...(editYear ? { academicYearId: parseInt(editYear) } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تم تعديل المقياس");
      setEditCourse(null);
      fetchData();
    } catch { toast.error("فشل الاتصال"); }
    finally { setEditSaving(false); }
  }

  async function handleDelete() {
    if (!deleteCourse) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/courses?id=${deleteCourse.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setDeleteError(data.error); toast.error(data.error); return; }
      toast.success("تم حذف المقياس");
      setDeleteCourse(null); setDeleteError(null);
      fetchData();
    } catch { toast.error("فشل الحذف"); }
    finally { setDeleting(false); }
  }

  const yearName = (id: number) => years.find((y) => y.id === id)?.yearName ?? "";

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div><h3 className="font-bold text-sm flex items-center gap-2"><BookOpen className="w-4 h-4 text-primary" />المقاييس</h3><p className="text-xs text-muted-foreground">إدارة مقررات التخصص — حسب السنة والسداسي (تعديل وحذف متاحان)</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 ml-1" />مقياس</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>إضافة مقياس جديد</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5"><Label>السنة الدراسية</Label>
                <select value={selYear} onChange={(e) => setSelYear(e.target.value)} className={selectCls}>
                  <option value="">— اختر —</option>
                  {years.map((y) => <option key={y.id} value={y.id}>{y.yearName}</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><Label>السداسي</Label>
                <select value={selSemester} onChange={(e) => setSelSemester(e.target.value)} className={selectCls}>
                  <option value="1">السداسي الأول</option>
                  <option value="2">السداسي الثاني</option>
                </select>
              </div>
              <div className="space-y-1.5"><Label>اسم المقياس</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: الأدب الجاهلي" /></div>
              <div className="space-y-1.5"><Label>الكود</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="مثال: AR-LIT-101" /></div>
              <div className="space-y-1.5"><Label>الأستاذ</Label><Input value={professor} onChange={(e) => setProfessor(e.target.value)} placeholder="اسم الأستاذ" /></div>
              <div className="space-y-1.5"><Label>المعامل</Label><Input type="number" value={coefficient} onChange={(e) => setCoefficient(e.target.value)} /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button onClick={handleCreate} disabled={saving}>{saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}إنشاء</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* round 6: edit dialog */}
      {editCourse && (
        <Dialog open onOpenChange={() => setEditCourse(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="w-5 h-5 text-primary" />تعديل المقياس</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5"><Label>اسم المقياس</Label><Input value={editName} onChange={(e) => setEditName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>الكود</Label><Input value={editCode} onChange={(e) => setEditCode(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>الأستاذ</Label><Input value={editProfessor} onChange={(e) => setEditProfessor(e.target.value)} placeholder="اسم الأستاذ" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5"><Label>المعامل</Label><Input type="number" value={editCoefficient} onChange={(e) => setEditCoefficient(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>السداسي</Label>
                  <select value={editSemester} onChange={(e) => setEditSemester(e.target.value)} className={selectCls}>
                    <option value="1">السداسي الأول</option>
                    <option value="2">السداسي الثاني</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5"><Label>السنة الدراسية</Label>
                <select value={editYear} onChange={(e) => setEditYear(e.target.value)} className={selectCls}>
                  <option value="">— بدون تغيير —</option>
                  {years.map((y) => <option key={y.id} value={y.id}>{y.yearName}</option>)}
                </select>
              </div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setEditCourse(null)}>إلغاء</Button><Button onClick={handleEditSave} disabled={editSaving}>{editSaving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حفظ التعديلات</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* round 6: delete confirm (guarded server-side — shows blocker message) */}
      {deleteCourse && (
        <Dialog open onOpenChange={() => { setDeleteCourse(null); setDeleteError(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle className="text-destructive flex items-center gap-2"><Trash2 className="w-5 h-5" />حذف مقياس</DialogTitle></DialogHeader>
            <p className="text-sm">هل تريد حذف <strong>{deleteCourse.name}</strong>؟</p>
            <p className="text-xs text-muted-foreground">الحذف محظور تلقائياً إذا كان المقياس مرتبطاً باختبارات أو واجبات أو نقاط أو محاضرات — حمايةً لبيانات الطلبة.</p>
            {deleteError && (
              <div className="rounded-lg bg-destructive/10 text-destructive text-xs p-3 mt-1">{deleteError}</div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDeleteCourse(null); setDeleteError(null); }}>إلغاء</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>{deleting && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حذف نهائي</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {loading ? <div className="text-center py-4"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div> : courses.length === 0 ? (
        <div className="text-center py-4 text-sm text-muted-foreground">لا توجد مقاييس</div>
      ) : (
        <div className="space-y-2 max-h-[55vh] overflow-y-auto scrollbar-thin">
          {courses.map((c) => (
            <Card key={c.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-sm">{c.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">{c.code} • الأستاذ: {c.professorName || "—"} • المعامل: {c.coefficient} • {c.semester === 2 ? "السداسي الثاني" : "السداسي الأول"}{yearName(c.academicYearId) ? ` • ${yearName(c.academicYearId)}` : ""}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditCourse(c)} aria-label="تعديل المقياس">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 h-8 w-8" onClick={() => { setDeleteCourse(c); setDeleteError(null); }} aria-label="حذف المقياس">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Card>
  );
}

// =====================================================
// Issues Manager (التبليغات) — round 6, closes the feedback loop.
// Students could report problems (POST /api/issues from the courses and
// assignments screens) but NO supervisor could ever SEE the reports —
// they vanished into the database. This manager lists them, lets the
// supervisor mark them resolved/reopen them, and delete spam.
// (It replaces the old "المحتوى" tab whose upload form posted to a
// non-existent /api/content/upload route and always failed with 404.)
// =====================================================
interface IssueReportRow {
  id: number; studentName: string; studentGroup: string; itemType: string;
  itemTitle: string; description: string; date: string; status: string;
}

function IssuesManager() {
  const [reports, setReports] = React.useState<IssueReportRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<number | null>(null);
  const [deleteReport, setDeleteReport] = React.useState<IssueReportRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const fetchReports = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/issues", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشل تحميل التبليغات"); return; }
      setReports(data.reports ?? []);
    } catch { toast.error("فشل تحميل التبليغات"); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { fetchReports(); }, [fetchReports]);

  async function toggleStatus(r: IssueReportRow) {
    const next = r.status === "تم الحل" ? "قيد المراجعة" : "تم الحل";
    setBusyId(r.id);
    try {
      const res = await fetch("/api/issues", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id, status: next }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success(next === "تم الحل" ? "تم حل التبليغ" : "أُعيد فتح التبليغ");
      fetchReports();
    } catch { toast.error("فشل الاتصال"); }
    finally { setBusyId(null); }
  }

  async function handleDelete() {
    if (!deleteReport) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/issues?id=${deleteReport.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تم حذف التبليغ");
      setDeleteReport(null);
      fetchReports();
    } catch { toast.error("فشل الحذف"); }
    finally { setDeleting(false); }
  }

  const pending = reports.filter((r) => r.status !== "تم الحل").length;

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="font-bold text-sm flex items-center gap-2"><Flag className="w-4 h-4 text-primary" />تبليغات الطلبة</h3>
        <p className="text-xs text-muted-foreground mt-1">
          مشاكل يبلّغ عنها الطلبة من شاشتي المقررات والواجبات — {pending} قيد المراجعة من أصل {reports.length}
        </p>
      </div>

      {deleteReport && (
        <Dialog open onOpenChange={() => setDeleteReport(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="text-destructive flex items-center gap-2"><Trash2 className="w-5 h-5" />حذف تبليغ</DialogTitle></DialogHeader>
            <p className="text-sm">هل تريد حذف تبليغ <strong>{deleteReport.itemTitle}</strong> المُرسل من {deleteReport.studentName}؟</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteReport(null)}>إلغاء</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>{deleting && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حذف</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {loading ? (
        <div className="text-center py-8"><Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground" /></div>
      ) : reports.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground flex flex-col items-center gap-2">
          <CheckCheck className="w-8 h-8 text-emerald-600" />
          <span>لا توجد تبليغات — عندما يبلّغ طالب عن مشكلة ستظهر هنا</span>
        </div>
      ) : (
        <div className="space-y-2 max-h-[65vh] overflow-y-auto scrollbar-thin">
          {reports.map((r) => {
            const resolved = r.status === "تم الحل";
            return (
              <Card key={r.id} className={`p-3 ${resolved ? "opacity-60" : "border-amber-500/30"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <AlertTriangle className={`w-4 h-4 shrink-0 ${resolved ? "text-muted-foreground" : "text-amber-500"}`} />
                      <span className="font-bold text-sm">{r.itemTitle}</span>
                      <Badge variant={resolved ? "secondary" : "outline"} className={`text-xs ${resolved ? "" : "border-amber-500/50 text-amber-600"}`}>
                        {resolved ? "تم الحل" : "قيد المراجعة"}
                      </Badge>
                      <Badge variant="outline" className="text-xs">{r.itemType}</Badge>
                    </div>
                    {r.description && <p className="text-xs text-muted-foreground mt-1.5 whitespace-pre-wrap">{r.description}</p>}
                    <p className="text-xs text-muted-foreground mt-2">{r.studentName} • {r.date}</p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 text-emerald-600 hover:bg-emerald-500/10"
                      onClick={() => toggleStatus(r)} disabled={busyId === r.id}
                      aria-label={resolved ? "إعادة فتح التبليغ" : "وضع علامة تم الحل"}
                      title={resolved ? "إعادة فتح التبليغ" : "وضع علامة تم الحل"}
                    >
                      {busyId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : resolved ? <RotateCcw className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 h-8 w-8" onClick={() => setDeleteReport(r)} aria-label="حذف التبليغ">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// =====================================================
// Cloud Manager (test connection)
// =====================================================
function CloudManager() {
  const [testing, setTesting] = React.useState(false);
  const [result, setResult] = React.useState<{ ok: boolean; message: string } | null>(null);
  async function handleTest() {
    setTesting(true); setResult(null);
    try {
      const res = await fetch("/api/test-connection", { cache: "no-store" });
      const data = await res.json();
      setResult({ ok: data.ok, message: data.message });
      if (data.ok) toast.success(data.message); else toast.error(data.message);
    } catch (e) { setResult({ ok: false, message: `خطأ: ${(e as Error).message}` }); }
    finally { setTesting(false); }
  }
  return (
    <Card className="p-4 space-y-3">
      <div><h3 className="font-bold text-sm flex items-center gap-2"><Cloud className="w-4 h-4 text-primary" />السحابة والمزامنة</h3><p className="text-xs text-muted-foreground">اختبار الاتصال بـ Supabase</p></div>
      <Button onClick={handleTest} disabled={testing} variant="outline" className="w-full">{testing ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <TestTube2 className="w-4 h-4 ml-1" />}اختبار الاتصال</Button>
      {result && (
        <div className={`rounded-lg p-3 flex items-start gap-2 ${result.ok ? "bg-emerald-500/10 text-emerald-700" : "bg-destructive/10 text-destructive"}`}>
          {result.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />}
          <span className="text-xs font-medium">{result.message}</span>
        </div>
      )}
      <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg flex items-start gap-2"><Shield className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>مفاتيح Supabase محفوظة بأمان في متغيرات البيئة.</span></div>
    </Card>
  );
}

// =====================================================
// Telegram Manager (تيليجرام) — round 7
//
// إدارة ميزة "دروس تيليجرام": ربط القنوات/مجموعات الأفواج بالبوت،
// تفعيل الويبهوك، وتنقيح المنشورات المستوردة (تصنيف/إخفاء/تثبيت/
// إعادة ربط/حذف). القاعدة الذهبية من الجولة 6 مطبقة من اليوم الأول:
// كل كيان له إنشاء + تعديل + حذف — لا كيان "نصف مزود".
// =====================================================
interface TgSourceRow {
  id: number;
  tgChannelId: string;
  tgUsername: string;
  titleAr: string;
  sourceType: string;
  kind: string;
  yearId: number | null;
  semester: number | null;
  moduleId: number | null;
  moduleName: string | null;
  cohortId: number | null;
  cohortName: string | null;
  isActive: boolean;
  lastUpdateId: number;
  itemCount: number;
}

interface TgItemAdminRow {
  id: number;
  titleAr: string;
  kind: string;
  itemType: string;
  moduleId: number | null;
  moduleName: string | null;
  sourceTitle: string | null;
  sourceUsername: string | null;
  origin: string;
  postedBy: string;
  link: string;
  isHidden: boolean;
  isFeatured: boolean;
  aiClassified: boolean;
  postedAt: string | null;
}

interface TgCourseRow { id: number; name: string; semester: number; academicYearId: number }
interface TgCohortRow { id: number; groupName: string; academicYearId: number }

const TG_TYPES_ADMIN = ["محاضرة", "أعمال موجهة TD", "تمارين", "امتحان", "ملخص", "كتاب", "إعلان", "عام"];

function TelegramManager() {
  return (
    <div className="space-y-4">
      <TgStatusCard />
      <Card className="p-4">
        <Tabs defaultValue="sources">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="sources" className="text-xs data-[state=active]:font-bold">القنوات والأربطة</TabsTrigger>
            <TabsTrigger value="posts" className="text-xs data-[state=active]:font-bold">تنقيح المنشورات</TabsTrigger>
          </TabsList>
          <TabsContent value="sources" className="mt-4"><TgSourcesManager /></TabsContent>
          <TabsContent value="posts" className="mt-4"><TgItemsManager /></TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}

// -----------------------------------------------------
// حالة الربط (البوت/السر/الويبهوك/Gemini/الجداول) + فحص ذاتي
// -----------------------------------------------------
interface TgStatus {
  botConfigured: boolean;
  botTokenValid: boolean;
  botUsername: string;
  botFirstName: string;
  webhookSecretConfigured: boolean;
  geminiConfigured: boolean;
  geminiModel: string;
  tablesReady: boolean;
  isVercel: boolean;
  webhook: { url: string; pendingUpdateCount: number; lastErrorMessage: string } | null;
}

interface GeminiTestResult {
  configured: boolean;
  aiClassified: boolean;
  itemType: string;
  model: string;
  models: string[];
  message: string;
}

/** يحسب «الخطوة التالية» المطلوبة بالضبط من حالة الربط الحالية */
function tgNextStep(s: TgStatus | null): string {
  if (!s) return "جارٍ قراءة الحالة…";
  if (!s.botConfigured) return "١) أضف TELEGRAM_BOT_TOKEN في Vercel (Settings ← Environment Variables) ثم Redeploy";
  if (!s.botTokenValid) return "التوكن موجود لكن تيليجرام يرفضه — انسخه كاملاً من @BotFather، حدّثه في Vercel ثم Redeploy";
  if (!s.webhookSecretConfigured) return "٢) أضف TELEGRAM_WEBHOOK_SECRET (أي نص عشوائي طويل) في Vercel ثم Redeploy";
  if (!s.tablesReady) return "٣) نفّذ ملف download/supabase_telegram.sql في محرر SQL داخل Supabase";
  if (!s.webhook?.url) return "٤) اضغط «تفعيل الربط» بالأسفل";
  return "كل شيء مضبوط — انشر منشوراً جديداً في قناة مربوطة، أو جرّب «اختبار الاستيراد» من قائمة القنوات";
}

const GEMINI_SAMPLE_UI = "امتحان محلول في التحليل الرياضي — السنة الأولى جامعي";

function TgStatusCard() {
  const [status, setStatus] = React.useState<TgStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [activating, setActivating] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [geminiResult, setGeminiResult] = React.useState<GeminiTestResult | null>(null);

  const fetchStatus = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/telegram/setup", { cache: "no-store" });
      if (res.ok) setStatus(await res.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { fetchStatus(); }, [fetchStatus]);

  async function handleActivate() {
    setActivating(true);
    try {
      const res = await fetch("/api/telegram/setup", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success(data.message);
      fetchStatus();
    } catch { toast.error("فشل الاتصال"); }
    finally { setActivating(false); }
  }

  async function handleTestGemini() {
    setTesting(true);
    setGeminiResult(null);
    try {
      const res = await fetch("/api/telegram/setup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test-gemini" }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      setGeminiResult(data as GeminiTestResult);
      if (data.aiClassified) toast.success("Gemini يعمل");
      else toast.info(data.message);
    } catch { toast.error("فشل الاتصال"); }
    finally { setTesting(false); }
  }

  if (loading) {
    return <Card className="p-4"><div className="text-center py-2"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div></Card>;
  }
  const botOk = status?.botTokenValid ?? false;
  const secretOk = status?.webhookSecretConfigured ?? false;
  const geminiOk = status?.geminiConfigured ?? false;
  const tablesOk = status?.tablesReady ?? false;
  const webhookUrl = status?.webhook?.url ?? "";
  const nextStep = tgNextStep(status);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-sm flex items-center gap-2"><Send className="w-4 h-4 text-primary" />حالة ربط تيليجرام</h3>
          <p className="text-xs text-muted-foreground mt-1">استيراد تلقائي للمنشورات الجديدة من القنوات المرتبطة</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStatus} disabled={loading}>
          <RotateCcw className="w-3.5 h-3.5" />تحديث
        </Button>
      </div>

      <div className="grid gap-2">
        <StatusLine
          ok={botOk}
          label="توكن البوت (TELEGRAM_BOT_TOKEN)"
          okText={status?.botUsername ? `مضبوط — البوت: @${status.botUsername}` : "مضبوط ومقبول من تيليجرام"}
          badText={
            status?.botConfigured
              ? "التوكن موجود لكن تيليجرام يرفضه — انسخه كاملاً من BotFather وحدّثه في Vercel ثم Redeploy"
              : "غير مضبوط — أنشئ بوتاً عبر @BotFather ثم أضف TELEGRAM_BOT_TOKEN في Vercel"
          }
        />
        <StatusLine ok={secretOk} label="سرّ الويبهوك (TELEGRAM_WEBHOOK_SECRET)" okText="مضبوط" badText="غير مضبوط — أضفه في Vercel (أي نص عشوائي طويل) — لا يعمل التفعيل بدونه" />
        <StatusLine
          ok={webhookUrl.length > 0}
          label="الويبهوك (استقبال المنشورات)"
          okText={`مفعّل: ${webhookUrl}`}
          badText="غير مفعّل — اضغط «تفعيل الربط» بعد ضبط التوكن والسر"
        />
        <StatusLine
          ok={geminiOk}
          label="التصنيف الذكي (GEMINI_API_KEY)"
          okText={`مضبوط — النموذج: ${status?.geminiModel ?? "gemini-2.5-flash"} (تصنيف + قراءة نص الصور)`}
          badText="غير مضبوط — يُستعمل التصنيف المحلي بالكلمات المفتاحية (يعمل بشكل كامل)"
        />
        <StatusLine
          ok={tablesOk}
          label="جداول تيليجرام في قاعدة البيانات"
          okText="منشأة وجاهزة"
          badText="غير منشأة — نفّذ download/supabase_telegram.sql في محرر SQL داخل Supabase"
        />
      </div>

      {status?.webhook?.lastErrorMessage ? (
        <div className="rounded-lg bg-destructive/10 text-destructive text-xs p-3">
          آخر خطأ من تيليجرام: {status.webhook.lastErrorMessage}
        </div>
      ) : null}

      {/* الخطوة التالية المطلوبة — أول ما يقرؤه المشرف */}
      <div className={`rounded-lg p-3 text-xs leading-relaxed border ${webhookUrl ? "bg-emerald-500/10 border-emerald-600/30 text-emerald-700 dark:text-emerald-300" : "bg-primary/10 border-primary/30 text-primary"}`}>
        <span className="font-bold">الخطوة التالية: </span>{nextStep}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Button onClick={handleActivate} disabled={activating || !botOk || !secretOk} className="w-full">
          {activating ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Power className="w-4 h-4 ml-1" />}
          تفعيل الربط
        </Button>
        <Button variant="outline" onClick={handleTestGemini} disabled={testing} className="w-full">
          {testing ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <FlaskConical className="w-4 h-4 ml-1" />}
          اختبار التصنيف الذكي
        </Button>
      </div>

      {geminiResult ? (
        <div className={`rounded-lg p-3 text-xs leading-relaxed border ${geminiResult.aiClassified ? "bg-emerald-500/10 border-emerald-600/30 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 border-amber-600/30 text-amber-700 dark:text-amber-300"}`}>
          <p className="font-bold flex items-center gap-1.5">
            {geminiResult.aiClassified ? <FlaskConical className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            نتيجة فحص Gemini
          </p>
          <p className="mt-1">{geminiResult.message}</p>
          {geminiResult.aiClassified ? (
            <p className="mt-1">العيّنة: «{GEMINI_SAMPLE_UI}» ← النوع: <strong>{geminiResult.itemType}</strong></p>
          ) : null}
          {geminiResult.models.length > 0 ? (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground mb-1">
                نماذج متاحة لمفتاحك (لتغيير النموذج: GEMINI_MODEL في Vercel):
              </p>
              <div className="flex flex-wrap gap-1">
                {geminiResult.models.slice(0, 10).map((m) => (
                  <span
                    key={m}
                    className={`text-xs font-mono px-1.5 py-0.5 rounded border ${m === geminiResult.model ? "bg-primary/15 border-primary/40 text-primary font-bold" : "bg-muted/40 border-border/60"}`}
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg leading-relaxed space-y-1">
        <p className="font-bold text-foreground/80">خطوات الربط الكاملة (مرة واحدة):</p>
        <p>١. في تيليجرام: كلم <span dir="ltr" className="font-mono">@BotFather</span> ← <span dir="ltr" className="font-mono">/newbot</span> ← انسخ التوكن (شكله <span dir="ltr" className="font-mono">123456:ABC-xyz…</span>).</p>
        <p>٢. في <a href="https://vercel.com/bessghiermohamed/Gu-mo/settings/environment-variables" target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-0.5">Vercel ← Environment Variables <ExternalLink className="w-3 h-3" /></a> أضف المتغيرات الثلاثة:
          <span dir="ltr" className="font-mono">TELEGRAM_BOT_TOKEN</span> و <span dir="ltr" className="font-mono">TELEGRAM_WEBHOOK_SECRET</span> (أي نص عشوائي طويل) و <span dir="ltr" className="font-mono">GEMINI_API_KEY</span> (اختياري — للتصنيف الذكي وقراءة نص الصور).
        </p>
        <p>٣. مهم: بعد إضافة أي متغير ← Vercel ← Deployments ← آخر نشر ← <strong>Redeploy</strong> حتى يُحمَّل.</p>
        <p>٤. في <strong>Supabase</strong> ← SQL Editor ← نفّذ محتوى ملف <span dir="ltr" className="font-mono">download/supabase_telegram.sql</span> (من مستودع GitHub).</p>
        <p>٥. أضف البوت «مشرفاً» في كل قناة تريد استيرادها (تكفي صلاحية قراءة المنشورات).</p>
        <p>٦. هنا: «ربط قناة» ← أدخل <span dir="ltr" className="font-mono">@اسم_القناة</span> ← «تفعيل الربط» ← «اختبار الاستيراد».</p>
        <p className="text-xs pt-1 border-t border-border/60">تُستورد المنشورات <strong>الجديدة فقط</strong> بعد الربط (اتفاقنا) — والمنشورات القديمة تبقى في تيليجرام كمرجع. الروابط المحفوظة تفتح الأصل مباشرة.</p>
      </div>
    </Card>
  );
}

function StatusLine({ ok, label, okText, badText }: { ok: boolean; label: string; okText: string; badText: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border/60 p-2.5">
      {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />}
      <div className="min-w-0">
        <p className="text-xs font-bold">{label}</p>
        <p className={cn("text-xs mt-0.5 leading-relaxed break-all", ok ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground")}>{ok ? okText : badText}</p>
      </div>
    </div>
  );
}

// -----------------------------------------------------
// إدارة المصادر (القنوات المرتبطة)
// -----------------------------------------------------
function TgSourcesManager() {
  const { user } = useAuth();
  const [sources, setSources] = React.useState<TgSourceRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [tablesReady, setTablesReady] = React.useState(true);

  // add dialog
  const [open, setOpen] = React.useState(false);
  const [handle, setHandle] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [sourceType, setSourceType] = React.useState("channel");
  const [yearId, setYearId] = React.useState("");
  const [semester, setSemester] = React.useState("");
  const [moduleId, setModuleId] = React.useState("");
  const [cohortId, setCohortId] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // edit dialog
  const [editSource, setEditSource] = React.useState<TgSourceRow | null>(null);
  const [editTitle, setEditTitle] = React.useState("");
  const [editModuleId, setEditModuleId] = React.useState("");
  const [editIsActive, setEditIsActive] = React.useState(true);
  const [editApply, setEditApply] = React.useState(false);
  const [editSaving, setEditSaving] = React.useState(false);

  // delete confirm
  const [deleteSource, setDeleteSource] = React.useState<TgSourceRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  // import test dialog (محاكاة منشور جديد للتأكد أن الخط كامل يعمل)
  const [testSource, setTestSource] = React.useState<TgSourceRow | null>(null);
  const [testText, setTestText] = React.useState("");
  const [testRunning, setTestRunning] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{
    ok: boolean;
    message: string;
    aiClassified?: boolean;
    item?: { title: string; itemType: string; kind: string; caption: string; link: string } | null;
  } | null>(null);

  // cascade data
  const [years, setYears] = React.useState<Year[]>([]);
  const [courses, setCourses] = React.useState<TgCourseRow[]>([]);
  const [cohorts, setCohorts] = React.useState<TgCohortRow[]>([]);

  React.useEffect(() => {
    fetch(`/api/onboarding/years?specialtyId=${user?.assignedSpecialtyId ?? 1}`)
      .then((r) => r.json()).then((data) => setYears(data.years ?? [])).catch(() => setYears([]));
    fetch("/api/courses", { cache: "no-store" })
      .then((r) => r.json()).then((data) => setCourses(data.courses ?? [])).catch(() => setCourses([]));
  }, [user]);

  React.useEffect(() => {
    if (!yearId) { setCohorts([]); return; }
    fetch(`/api/cohort?specialtyId=${user?.assignedSpecialtyId ?? 1}&academicYearId=${yearId}`)
      .then((r) => r.json()).then((data) => setCohorts(data.cohorts ?? [])).catch(() => setCohorts([]));
  }, [yearId, user]);

  const fetchSources = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/telegram/sources", { cache: "no-store" });
      const data = await res.json();
      setSources(data.sources ?? []);
      if (data.tablesReady === false) setTablesReady(false);
    } catch { setSources([]); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { fetchSources(); }, [fetchSources]);

  const yearCourses = courses.filter((c) => !yearId || String(c.academicYearId) === yearId);

  async function handleCreate() {
    if (!handle.trim()) { toast.error("أدخل رابط القناة أو @اسمها"); return; }
    if (sourceType === "group" && !cohortId) { toast.error("اختر الفوج المرتبط بالمساحة المشتركة"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/telegram/sources", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: handle.trim(), title: title.trim(), sourceType,
          ...(yearId ? { yearId: parseInt(yearId) } : {}),
          ...(semester ? { semester: parseInt(semester) } : {}),
          ...(sourceType === "channel" && moduleId ? { moduleId: parseInt(moduleId) } : {}),
          ...(sourceType === "group" && cohortId ? { cohortId: parseInt(cohortId) } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تم ربط القناة — تأكد أن البوت مشرف فيها ليستورد المنشورات الجديدة");
      setOpen(false); setHandle(""); setTitle(""); setModuleId(""); setCohortId(""); setSemester("");
      fetchSources();
    } catch { toast.error("فشل الاتصال"); }
    finally { setSaving(false); }
  }

  function openEdit(s: TgSourceRow) {
    setEditTitle(s.titleAr);
    setEditModuleId(s.moduleId ? String(s.moduleId) : "");
    setEditIsActive(s.isActive);
    setEditApply(false);
    setEditSource(s);
  }

  async function handleEditSave() {
    if (!editSource) return;
    setEditSaving(true);
    try {
      const res = await fetch("/api/telegram/sources", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editSource.id,
          titleAr: editTitle.trim(),
          ...(editSource.moduleId != null || editModuleId ? { moduleId: editModuleId ? parseInt(editModuleId) : null } : {}),
          isActive: editIsActive,
          applyToItems: editApply,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تم تعديل المصدر");
      setEditSource(null);
      fetchSources();
    } catch { toast.error("فشل الاتصال"); }
    finally { setEditSaving(false); }
  }

  async function handleToggleActive(s: TgSourceRow) {
    const res = await fetch("/api/telegram/sources", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, isActive: !s.isActive }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error); return; }
    toast.success(!s.isActive ? "تم استئناف الاستيراد" : "تم إيقاف الاستيراد مؤقتاً");
    fetchSources();
  }

  async function handleDelete() {
    if (!deleteSource) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/telegram/sources?id=${deleteSource.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setDeleteError(data.error); toast.error(data.error); return; }
      toast.success(data.message ?? "تم فك الربط");
      setDeleteSource(null); setDeleteError(null);
      fetchSources();
    } catch { toast.error("فشل الحذف"); }
    finally { setDeleting(false); }
  }

  async function handleRunTest() {
    if (!testSource) return;
    setTestRunning(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/telegram/setup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "simulate",
          sourceId: testSource.id,
          ...(testText.trim() ? { text: testText.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setTestResult({ ok: false, message: data.error ?? "فشل الفحص" }); return; }
      setTestResult(data);
      if (data.ok) toast.success("نجح الاستيراد التجريبي");
      else toast.error(data.message ?? "تعذّر الفحص");
      fetchSources();
    } catch { setTestResult({ ok: false, message: "فشل الاتصال" }); }
    finally { setTestRunning(false); }
  }

  if (!tablesReady) {
    return (
      <div className="rounded-lg bg-amber-500/10 text-amber-700 text-xs p-4 leading-relaxed">
        جداول تيليجرام غير منشأة بعد في Supabase. نفّذ الملف <span className="font-mono" dir="ltr">download/supabase_telegram.sql</span> في محرر SQL ثم أعد التحميل.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">
            كل قناة مرتبطة بمقياس (أو فوج للمساحة المشتركة) — منشوراتها الجديدة تُستورد وتُصنّف تلقائياً
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" shrink-0><Plus className="w-4 h-4 ml-1" />ربط قناة</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>ربط قناة/مجموعة تيليجرام</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label>رابط القناة أو @اسمها</Label>
                <Input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="https://t.me/channel_name أو @channel_name" dir="ltr" />
                <p className="text-xs text-muted-foreground">البوت يجب أن يكون مشرفاً في القناة قبل الربط.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>النوع</Label>
                  <select value={sourceType} onChange={(e) => setSourceType(e.target.value)} className={selectCls}>
                    <option value="channel">قناة (محتوى مقياس)</option>
                    <option value="group">مجموعة فوج (مساحة مشتركة)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>اسم للعرض (اختياري)</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="يُقرأ تلقائياً من تيليجرام" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>السنة الدراسية</Label>
                <select value={yearId} onChange={(e) => setYearId(e.target.value)} className={selectCls}>
                  <option value="">— بدون —</option>
                  {years.map((y) => <option key={y.id} value={y.id}>{y.yearName}</option>)}
                </select>
              </div>
              {sourceType === "channel" ? (
                <>
                  <div className="space-y-1.5">
                    <Label>السداسي (اختياري)</Label>
                    <select value={semester} onChange={(e) => setSemester(e.target.value)} className={selectCls}>
                      <option value="">— بدون —</option>
                      <option value="1">السداسي الأول</option>
                      <option value="2">السداسي الثاني</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>المقياس (تصنيف منشورات القناة)</Label>
                    <select value={moduleId} onChange={(e) => setModuleId(e.target.value)} className={selectCls}>
                      <option value="">— عام (بدون مقياس) —</option>
                      {yearCourses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </>
              ) : (
                <div className="space-y-1.5">
                  <Label>الفوج (أصحاب المساحة المشتركة)</Label>
                  <select value={cohortId} onChange={(e) => setCohortId(e.target.value)} className={selectCls}>
                    <option value="">— اختر الفوج —</option>
                    {cohorts.map((c) => <option key={c.id} value={c.id}>{c.groupName}</option>)}
                  </select>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
              <Button onClick={handleCreate} disabled={saving}>{saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}ربط</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* edit dialog */}
      {editSource && (
        <Dialog open onOpenChange={() => setEditSource(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="w-5 h-5 text-primary" />تعديل الربط</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label>اسم العرض</Label>
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>المقياس</Label>
                <select value={editModuleId} onChange={(e) => setEditModuleId(e.target.value)} className={selectCls}>
                  <option value="">— عام (بدون مقياس) —</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={editIsActive} onChange={(e) => setEditIsActive(e.target.checked)} className="accent-primary" />
                الاستيراد مفعّل
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={editApply} onChange={(e) => setEditApply(e.target.checked)} className="accent-primary" />
                تطبيق التغيير على المنشورات المستوردة الموجودة (إعادة تصنيفها للمقياس الجديد)
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditSource(null)}>إلغاء</Button>
              <Button onClick={handleEditSave} disabled={editSaving}>{editSaving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حفظ التعديلات</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* delete confirm */}
      {deleteSource && (
        <Dialog open onOpenChange={() => { setDeleteSource(null); setDeleteError(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle className="text-destructive flex items-center gap-2"><Trash2 className="w-5 h-5" />فك ربط القناة</DialogTitle></DialogHeader>
            <p className="text-sm">
              هل تريد فك ربط <strong>{deleteSource.titleAr}</strong>؟
              سيتم حذف <strong>{deleteSource.itemCount}</strong> منشوراً مستورداً منها نهائياً.
            </p>
            <p className="text-xs text-muted-foreground">الإضافات اليدوية للطلبة في مساحة الفوج لا تتأثر — فقط منشورات هذا المصدر.</p>
            {deleteError && <div className="rounded-lg bg-destructive/10 text-destructive text-xs p-3 mt-1">{deleteError}</div>}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDeleteSource(null); setDeleteError(null); }}>إلغاء</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>{deleting && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}فك الربط نهائياً</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* import test dialog — محاكاة منشور جديد كامل الخط دون نشر حقيقي */}
      {testSource && (
        <Dialog open onOpenChange={() => setTestSource(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Zap className="w-5 h-5 text-amber-600" />اختبار الاستيراد — {testSource.titleAr}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <p className="text-xs text-muted-foreground leading-relaxed">
                محاكاة منشور جديد كامل الخط (استقبال ← تصنيف ← قاعدة البيانات) دون الحاجة لنشر حقيقي في تيليجرام.
                يُنشأ منشور تجريبي ثم يُحذف تلقائياً — لن يراه الطلبة.
              </p>
              <div className="space-y-1.5">
                <Label>نص المنشور التجريبي (اختياري)</Label>
                <Input
                  value={testText}
                  onChange={(e) => setTestText(e.target.value)}
                  placeholder="افتراضياً: سلسلة تمارين محلولة رقم 3 — التحليل الرياضي"
                />
                <p className="text-xs text-muted-foreground">اكتب عيّنة مما تنشره عادة لترى كيف سيُصنّف (مثال: امتحان الفيزياء — الدورة العادية).</p>
              </div>
              {testResult ? (
                <div className={`rounded-lg p-3 text-xs leading-relaxed border ${testResult.ok ? "bg-emerald-500/10 border-emerald-600/30 text-emerald-700 dark:text-emerald-300" : "bg-destructive/10 border-destructive/30 text-destructive"}`}>
                  <p className="font-bold flex items-center gap-1.5">
                    {testResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    {testResult.ok ? "نجح الاستيراد التجريبي" : "تعذّر الفحص"}
                  </p>
                  <p className="mt-1">{testResult.message}</p>
                  {testResult.item ? (
                    <div className="mt-2 space-y-1 border-t border-border/40 pt-2">
                      <p>العنوان المستخرج: <strong>{testResult.item.title || "—"}</strong></p>
                      <p>
                        النوع: <strong>{testResult.item.itemType}</strong> — التصنيف:{" "}
                        <strong>{testResult.aiClassified ? "Gemini (ذكاء اصطناعي)" : "محلي بالكلمات المفتاحية"}</strong>
                      </p>
                      <p className="text-xs break-all" dir="ltr">{testResult.item.link}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTestSource(null)}>إغلاق</Button>
              <Button onClick={handleRunTest} disabled={testRunning}>
                {testRunning ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Zap className="w-4 h-4 ml-1" />}
                تشغيل الفحص
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {loading ? (
        <div className="text-center py-4"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div>
      ) : sources.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground flex flex-col items-center gap-2">
          <Send className="w-8 h-8" />
          <span>لا توجد قنوات مربوطة — ابدأ بزر «ربط قناة» بعد إضافة البوت مشرفاً فيها</span>
        </div>
      ) : (
        <div className="space-y-2 max-h-[55vh] overflow-y-auto scrollbar-thin">
          {sources.map((s) => (
            <Card key={s.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm">{s.titleAr}</span>
                    <Badge variant="outline" className={`text-xs ${s.sourceType === "group" ? "border-teal-500/50 text-teal-700" : ""}`}>
                      {s.sourceType === "group" ? "مجموعة فوج" : s.kind === "private" ? "قناة خاصة" : "قناة عامة"}
                    </Badge>
                    {!s.isActive && <Badge variant="secondary" className="text-xs">الاستيراد موقوف</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                    {s.tgUsername ? <span dir="ltr" className="font-mono">@{s.tgUsername}</span> : <span dir="ltr" className="font-mono">{s.tgChannelId}</span>}
                    <span>• {s.itemCount} منشوراً</span>
                    {s.moduleName ? <span>• المقياس: {s.moduleName}</span> : null}
                    {s.cohortName ? <span>• {s.cohortName}</span> : null}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setTestSource(s); setTestText(""); setTestResult(null); }}
                    aria-label="اختبار الاستيراد" title="اختبار الاستيراد — محاكاة منشور جديد">
                    <Zap className="w-3.5 h-3.5 text-amber-600" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleToggleActive(s)}
                    aria-label={s.isActive ? "إيقاف الاستيراد" : "استئناف الاستيراد"} title={s.isActive ? "إيقاف الاستيراد" : "استئناف الاستيراد"}>
                    <Power className={`w-3.5 h-3.5 ${s.isActive ? "text-emerald-600" : "text-muted-foreground"}`} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)} aria-label="تعديل الربط">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 h-8 w-8" onClick={() => { setDeleteSource(s); setDeleteError(null); }} aria-label="فك الربط">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------
// تنقيح المنشورات (تصنيف/إخفاء/تثبيت/إعادة ربط/حذف)
// -----------------------------------------------------
function TgItemsManager() {
  const [items, setItems] = React.useState<TgItemAdminRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState("");
  const [sourceId, setSourceId] = React.useState("");
  const [itemType, setItemType] = React.useState("");
  const [sources, setSources] = React.useState<TgSourceRow[]>([]);
  const [courses, setCourses] = React.useState<TgCourseRow[]>([]);
  const [busyId, setBusyId] = React.useState<number | null>(null);

  // edit dialog
  const [editItem, setEditItem] = React.useState<TgItemAdminRow | null>(null);
  const [editTitle, setEditTitle] = React.useState("");
  const [editType, setEditType] = React.useState("عام");
  const [editModuleId, setEditModuleId] = React.useState("");
  const [editSaving, setEditSaving] = React.useState(false);

  // delete confirm
  const [deleteItem, setDeleteItem] = React.useState<TgItemAdminRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/telegram/sources", { cache: "no-store" }).then((r) => r.json()).then((d) => setSources(d.sources ?? [])).catch(() => setSources([]));
    fetch("/api/courses", { cache: "no-store" }).then((r) => r.json()).then((d) => setCourses(d.courses ?? [])).catch(() => setCourses([]));
  }, []);

  const fetchItems = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ mode: "admin" });
      if (q.trim()) params.set("q", q.trim());
      if (sourceId) params.set("sourceId", sourceId);
      if (itemType) params.set("itemType", itemType);
      const res = await fetch(`/api/telegram/items?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشل تحميل المنشورات"); return; }
      setItems(data.items ?? []);
    } catch { toast.error("فشل تحميل المنشورات"); }
    finally { setLoading(false); }
  }, [q, sourceId, itemType]);
  React.useEffect(() => { fetchItems(); }, [fetchItems]);

  async function patchItem(id: number, patch: Record<string, unknown>, successMsg: string) {
    setBusyId(id);
    try {
      const res = await fetch("/api/telegram/items", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success(successMsg);
      fetchItems();
    } catch { toast.error("فشل الاتصال"); }
    finally { setBusyId(null); }
  }

  async function handleDelete() {
    if (!deleteItem) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/telegram/items?id=${deleteItem.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تم حذف المنشور");
      setDeleteItem(null);
      fetchItems();
    } catch { toast.error("فشل الحذف"); }
    finally { setDeleting(false); }
  }

  async function handleReclassify(id: number) {
    setBusyId(id);
    try {
      const res = await fetch("/api/telegram/items", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "reclassify" }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success(data.message ?? "أُعيد التصنيف");
      fetchItems();
    } catch { toast.error("فشل الاتصال"); }
    finally { setBusyId(null); }
  }

  function openEdit(i: TgItemAdminRow) {
    setEditTitle(i.titleAr);
    setEditType(i.itemType);
    setEditModuleId(i.moduleId ? String(i.moduleId) : "");
    setEditItem(i);
  }

  async function handleEditSave() {
    if (!editItem) return;
    if (!editTitle.trim()) { toast.error("العنوان مطلوب"); return; }
    setEditSaving(true);
    try {
      await patchItem(editItem.id, {
        titleAr: editTitle.trim(),
        itemType: editType,
        moduleId: editModuleId ? parseInt(editModuleId) : null,
      }, "تم تحديث المنشور");
      setEditItem(null);
    } finally { setEditSaving(false); }
  }

  const hiddenCount = items.filter((i) => i.isHidden).length;

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث…" className="flex-1 min-w-32" />
        <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className={`${selectCls} w-40`}>
          <option value="">كل القنوات</option>
          {sources.map((s) => <option key={s.id} value={s.id}>{s.titleAr}</option>)}
        </select>
        <select value={itemType} onChange={(e) => setItemType(e.target.value)} className={`${selectCls} w-36`}>
          <option value="">كل الأنواع</option>
          {TG_TYPES_ADMIN.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <p className="text-xs text-muted-foreground">
        {items.length} منشوراً{hiddenCount > 0 ? ` — ${hiddenCount} مخفي` : ""} — المصنّف آلياً يعلّمه ✦
      </p>

      {editItem && (
        <Dialog open onOpenChange={() => setEditItem(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="w-5 h-5 text-primary" />تنقيح المنشور</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label>العنوان</Label>
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>النوع الأكاديمي</Label>
                  <select value={editType} onChange={(e) => setEditType(e.target.value)} className={selectCls}>
                    {TG_TYPES_ADMIN.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>المقياس</Label>
                  <select value={editModuleId} onChange={(e) => setEditModuleId(e.target.value)} className={selectCls}>
                    <option value="">— عام —</option>
                    {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              {editItem.sourceTitle && (
                <p className="text-xs text-muted-foreground">المصدر: {editItem.sourceTitle}</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditItem(null)}>إلغاء</Button>
              <Button onClick={handleEditSave} disabled={editSaving}>{editSaving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حفظ</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {deleteItem && (
        <Dialog open onOpenChange={() => setDeleteItem(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="text-destructive flex items-center gap-2"><Trash2 className="w-5 h-5" />حذف منشور</DialogTitle></DialogHeader>
            <p className="text-sm">حذف <strong>{deleteItem.titleAr || deleteItem.link}</strong> من المكتبة؟ يبقى الأصل في تيليجرام — يمكن استيراده مجدداً بإعادة نشره.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteItem(null)}>إلغاء</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>{deleting && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حذف</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {loading ? (
        <div className="text-center py-4"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground">لا توجد منشورات — تُستورد تلقائياً فور نشرها في القنوات المرتبطة</div>
      ) : (
        <div className="space-y-2 max-h-[55vh] overflow-y-auto scrollbar-thin">
          {items.map((i) => (
            <Card key={i.id} className={`p-3 ${i.isHidden ? "opacity-55" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {i.isFeatured && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                    <span className="font-bold text-sm">{i.titleAr || i.link}</span>
                    <Badge variant="outline" className="text-xs">{i.itemType}</Badge>
                    {i.aiClassified && <span title="صُنِّف آلياً" className="text-xs text-muted-foreground"><Sparkles className="w-3 h-3" /></span>}
                    {i.isHidden && <Badge variant="secondary" className="text-xs">مخفي</Badge>}
                    {i.origin === "manual" && <Badge variant="outline" className="text-xs border-teal-500/50 text-teal-700">يدوي</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                    {i.sourceTitle ? <span>{i.sourceTitle}</span> : <span>إضافة: {i.postedBy || "—"}</span>}
                    {i.moduleName ? <span>• {i.moduleName}</span> : null}
                    <a href={i.link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-0.5" dir="ltr">
                      <Link2 className="w-3 h-3" />t.me
                    </a>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busyId === i.id}
                    onClick={() => handleReclassify(i.id)}
                    aria-label="إعادة تصنيف بالذكاء الاصطناعي" title="إعادة تصنيف بالذكاء الاصطناعي (Gemini) — يعيد العنوان والنوع ويستخرج نص الصورة">
                    {busyId === i.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-violet-500" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busyId === i.id}
                    onClick={() => patchItem(i.id, { isFeatured: !i.isFeatured }, i.isFeatured ? "أُلغى التثبيت" : "تم التثبيت في المقدمة ⭐")}
                    aria-label={i.isFeatured ? "إلغاء التثبيت" : "تثبيت في المقدمة"} title={i.isFeatured ? "إلغاء التثبيت" : "تثبيت في المقدمة"}>
                    <Star className={`w-3.5 h-3.5 ${i.isFeatured ? "text-amber-500 fill-amber-500" : ""}`} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busyId === i.id}
                    onClick={() => patchItem(i.id, { isHidden: !i.isHidden }, i.isHidden ? "أُظهر المنشور" : "أُخفي المنشور")}
                    aria-label={i.isHidden ? "إظهار" : "إخفاء"} title={i.isHidden ? "إظهار" : "إخفاء"}>
                    {i.isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(i)} aria-label="تنقيح">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 h-8 w-8" onClick={() => setDeleteItem(i)} aria-label="حذف">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// =====================================================
// round 9 — Direct assignment (spec §4, Method B)
// Both methods coexist: join requests (Method A) are never disabled
// by this flow. The destination list comes from /api/group/assignable,
// which is scope-filtered SERVER-SIDE (the rep only sees sub-groups
// inside their own scope — §6) AND student-filtered (system review
// §2: only sub-groups matching the STUDENT's own specialty/year/track
// are offered — enforced at the API layer, not hidden in the UI).
// =====================================================
interface AssignableCohort {
  id: number;
  nameAr: string;
  groupId: number | null;
  groupName: string;
  yearName: string;
  specialtyName: string;
}

function AssignDialog({ user, onClose, onDone }: { user: AppUserRow; onClose: () => void; onDone: () => void }) {
  const [cohorts, setCohorts] = React.useState<AssignableCohort[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");
  const [specialtyId, setSpecialtyId] = React.useState<string>("");
  const [groupId, setGroupId] = React.useState<string>("");
  const [cohortId, setCohortId] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);

  // system review §2: the destination list is filtered server-side to
  // the STUDENT's own academic scope (specialty/year/track) ∩ caller scope.
  React.useEffect(() => {
    setLoading(true);
    setLoadError("");
    fetch(`/api/group/assignable?studentId=${user.id}`, { cache: "no-store" })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) { setLoadError(data.error ?? "فشل تحميل الأفواج"); setCohorts([]); setLoading(false); return; }
        const list: AssignableCohort[] = data.cohorts ?? [];
        setCohorts(list);
        const specs = new Set(list.map((c) => c.specialtyName));
        if (specs.size === 1) setSpecialtyId(String(list[0]?.specialtyName ?? ""));
        setLoading(false);
      })
      .catch(() => { setLoadError("فشل الاتصال"); setLoading(false); });
  }, [user.id]);

  const specialtyOptions = React.useMemo(() => {
    const seen = new Map<string, AssignableCohort>();
    cohorts.forEach((c) => { if (!seen.has(c.specialtyName)) seen.set(c.specialtyName, c); });
    return Array.from(seen.values());
  }, [cohorts]);

  const groupOptions = React.useMemo(() => {
    const filtered = specialtyId ? cohorts.filter((c) => c.specialtyName === specialtyId) : cohorts;
    const seen = new Map<string, AssignableCohort>();
    filtered.forEach((c) => { if (c.groupName && !seen.has(c.groupName)) seen.set(c.groupName, c); });
    return Array.from(seen.values());
  }, [cohorts, specialtyId]);

  const filteredCohorts = React.useMemo(() => {
    let list = cohorts;
    if (specialtyId) list = list.filter((c) => c.specialtyName === specialtyId);
    if (groupId) list = list.filter((c) => c.groupName === groupId);
    return list;
  }, [cohorts, specialtyId, groupId]);

  const currentAssignment = user.groupNumber?.trim() || null;

  async function handleAssign() {
    if (!cohortId) { toast.error("اختر الفوج (المجموعة الفرعية)"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/group/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, cohortId: parseInt(cohortId) }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشل الإلحاق"); return; }
      toast.success(data.message ?? "تم الإلحاق");
      onDone();
    } catch { toast.error("فشل الاتصال"); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-primary" />
            {currentAssignment ? "نقل الطالب إلى فوج آخر" : "إلحاق مباشر بفوج"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="rounded-lg bg-muted/50 p-2 text-xs space-y-0.5">
            <div className="flex items-center gap-1.5"><Mail className="w-3 h-3 shrink-0" />{user.email}</div>
            <div className="flex items-center gap-1.5"><IdCard className="w-3 h-3 shrink-0" />{user.studentId}</div>
            <div className="flex items-center gap-1.5">
              <Users className="w-3 h-3 shrink-0" />
              الفوج الحالي: {currentAssignment ?? "بلا فوج"}
            </div>
            <div className="flex items-center gap-1.5">
              <GraduationCap className="w-3 h-3 shrink-0" />
              البيانات الأكاديمية: {user.specialtyName || "—"}
              {user.yearName ? ` — ${user.yearName}` : ""}
              <span className="text-muted-foreground">(الأفواج المعروضة مقيدة بها)</span>
            </div>
          </div>
          {currentAssignment && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <p>الطالب مسجل في فوج حالياً — هذه العملية تنقله (النقل بين الأفواج من صلاحيات الممثل/المشرف فقط).</p>
            </div>
          )}
          {loading ? (
            <div className="text-center py-6"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div>
          ) : loadError ? (
            <p className="text-xs text-destructive py-3 text-center">{loadError}</p>
          ) : cohorts.length === 0 ? (
            <div className="rounded-lg bg-muted/50 border border-border p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-bold text-foreground">لا توجد أفواج مطابقة لهذا الطالب</p>
              <p>
                الأفواج المعروضة مقيدة بالبيانات الأكاديمية للطالب
                (المؤسسة/التخصص/المسار/السنة)
                {user.yearName ? ` — ${user.specialtyName} / ${user.yearName}` : ""}.
                {!user.yearName ? " الطالب لم يحدد سنة دراسية بعد — أكمل ملفه الأكاديمي أولاً." : " أنشئ أفواجاً لسنة الطالب أو تحقق من ملفه الأكاديمي."}
              </p>
            </div>
          ) : (
            <>
              {specialtyOptions.length > 1 && (
                <div className="space-y-1.5">
                  <Label>التخصص</Label>
                  <select value={specialtyId} onChange={(e) => { setSpecialtyId(e.target.value); setGroupId(""); setCohortId(""); }} className={selectCls}>
                    <option value="">— الكل —</option>
                    {specialtyOptions.map((s) => <option key={s.specialtyName} value={s.specialtyName}>{s.specialtyName}</option>)}
                  </select>
                </div>
              )}
              {groupOptions.length > 1 && (
                <div className="space-y-1.5">
                  <Label>المجموعة</Label>
                  <select value={groupId} onChange={(e) => { setGroupId(e.target.value); setCohortId(""); }} className={selectCls}>
                    <option value="">— الكل —</option>
                    {groupOptions.map((g) => <option key={g.groupName} value={g.groupName}>{g.groupName}</option>)}
                  </select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>الفوج (المجموعة الفرعية)</Label>
                <select value={cohortId} onChange={(e) => setCohortId(e.target.value)} className={selectCls}>
                  <option value="">— اختر الفوج —</option>
                  {filteredCohorts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nameAr}{c.groupName ? ` — ${c.groupName}` : ""}{c.yearName ? ` — ${c.yearName}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleAssign} disabled={saving || !cohortId}>
            {saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}
            {currentAssignment ? "تنفيذ النقل" : "إلحاق الطالب"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Direct-assignment card (spec §4): search by name or serial number,
 * select the student, assign to a sub-group within the caller's scope.
 * The student pool is already scope-filtered by /api/users (§7).
 */
function DirectAssignmentCard() {
  const [users, setUsers] = React.useState<AppUserRow[]>([]);
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [assignUser, setAssignUser] = React.useState<AppUserRow | null>(null);

  React.useEffect(() => {
    fetch("/api/users", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => { setUsers(data.users ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const students = users.filter((u) => u.role === "STUDENT");
  const q = query.trim().toLowerCase();
  const matches = q
    ? students.filter(
        (u) =>
          u.fullName.toLowerCase().includes(q) ||
          u.studentId.toLowerCase().includes(q)
      )
    : [];

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="font-bold text-sm flex items-center gap-2">
          <ArrowLeftRight className="w-4 h-4 text-primary" />الإلحاق المباشر (بدون طلب)
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          ابحث عن طالب بالاسم أو الرقم التسلسلي وألحقه مباشرةً بفوج ضمن نطاقك — الطريقتان (الطلب والإلحاق) تعملان معاً
        </p>
      </div>
      <div className="relative">
        <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pr-9"
          placeholder="اسم الطالب أو رقمه التسلسلي..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {loading ? (
        <div className="text-center py-4"><Loader2 className="w-5 h-5 mx-auto animate-spin text-muted-foreground" /></div>
      ) : q && matches.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">لا يوجد طالب مطابق في نطاقك</p>
      ) : q ? (
        <div className="max-h-64 overflow-y-auto scrollbar-thin space-y-1.5">
          {matches.slice(0, 12).map((u) => (
            <button
              key={u.id}
              onClick={() => setAssignUser(u)}
              className="w-full text-right p-2.5 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="font-bold text-sm truncate">{u.fullName}</div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                  <span className="flex items-center gap-1"><IdCard className="w-3 h-3" />{u.studentId}</span>
                  <span className="flex items-center gap-1">{u.groupNumber ? <><Users className="w-3 h-3" />{u.groupNumber}</> : <><UserMinus className="w-3 h-3" />بلا فوج</>}</span>
                </div>
              </div>
              <Badge variant="secondary" className="text-xs shrink-0">إلحاق</Badge>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-1">اكتب للبحث — {students.length} طالب في نطاقك</p>
      )}
      {assignUser && (
        <AssignDialog
          user={assignUser}
          onClose={() => setAssignUser(null)}
          onDone={() => {
            setAssignUser(null);
            setQuery("");
            fetch("/api/users", { cache: "no-store" })
              .then((r) => r.json())
              .then((data) => setUsers(data.users ?? []))
              .catch(() => {});
          }}
        />
      )}
    </Card>
  );
}

// =====================================================
// round 9 — Subordinate Supervisors (spec §10/§11/§12)
// Expandable/collapsible tree of the supervisors working inside the
// caller's scope. Each node: name + current scope + Edit Scope + Remove.
// Empty state (§11): "لم تعيّن أحداً بعد." — never an empty tree.
// =====================================================
interface SupervisorNode {
  id: number;
  fullName: string;
  email: string;
  role: "REPRESENTATIVE" | "SPECIALTY_ADMIN" | "OWNER";
  scopeLabel: string;
  subordinates: SupervisorNode[];
}

function SubordinatesManager() {
  const [tree, setTree] = React.useState<SupervisorNode[]>([]);
  const [count, setCount] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [editUser, setEditUser] = React.useState<SupervisorNode | null>(null);
  const [removeUser, setRemoveUser] = React.useState<SupervisorNode | null>(null);

  const fetchTree = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users/subordinates", { cache: "no-store" });
      const data = await res.json();
      setTree(data.tree ?? []);
      setCount(data.subordinatesCount ?? 0);
    } catch { toast.error("فشل تحميل قائمة المرؤوسين"); }
    finally { setLoading(false); }
  }, []);

  React.useEffect(() => { fetchTree(); }, [fetchTree]);

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="font-bold text-sm flex items-center gap-2">
          <Network className="w-4 h-4 text-primary" />المشرفون المرؤوسون
          {count > 0 && <Badge variant="secondary" className="text-xs">{count}</Badge>}
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          المشرفون العاملون داخل نطاقك — يمكنك تعديل نطاق كل منهم أو إزالة دورهم
        </p>
      </div>
      {loading ? (
        <div className="text-center py-8"><Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground" /></div>
      ) : tree.length === 0 ? (
        <div className="text-center py-10">
          <UserCog className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="font-bold text-sm text-muted-foreground">لم تعيّن أحداً بعد.</p>
          <p className="text-xs text-muted-foreground/80 mt-1 max-w-xs mx-auto leading-relaxed">
            عيّن مشرفين من تبويب «المستخدمون» عبر زر «دور» — سيظهرون هنا في شجرة المرؤوسين.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {tree.map((node) => (
            <SupervisorTreeNode
              key={node.id}
              node={node}
              depth={0}
              onEdit={(n) => setEditUser(n)}
              onRemove={(n) => setRemoveUser(n)}
            />
          ))}
        </div>
      )}
      {editUser && (
        <ScopeEditDialog
          user={editUser}
          onClose={() => setEditUser(null)}
          onDone={() => { setEditUser(null); fetchTree(); }}
        />
      )}
      {removeUser && (
        <RemoveSupervisorDialog
          user={removeUser}
          onClose={() => setRemoveUser(null)}
          onDone={() => { setRemoveUser(null); fetchTree(); }}
        />
      )}
    </Card>
  );
}

function SupervisorTreeNode({
  node, depth, onEdit, onRemove,
}: {
  node: SupervisorNode;
  depth: number;
  onEdit: (n: SupervisorNode) => void;
  onRemove: (n: SupervisorNode) => void;
}) {
  const [open, setOpen] = React.useState(true);
  const hasChildren = node.subordinates.length > 0;
  return (
    <div style={depth > 0 ? { marginRight: depth * 16 } : undefined}>
      <Card className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            {hasChildren ? (
              <button
                onClick={() => setOpen((v) => !v)}
                className="mt-0.5 w-6 h-6 flex items-center justify-center rounded-md hover:bg-muted shrink-0"
                aria-label={open ? "طي" : "توسيع"}
              >
                {open ? <ChevronDown className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </button>
            ) : (
              <span className="mt-0.5 w-6 h-6 flex items-center justify-center shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
              </span>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="w-6 h-6 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                  {node.fullName.charAt(0)}
                </span>
                <span className="font-bold text-sm truncate">{node.fullName}</span>
                <RoleBadge role={node.role} />
                {hasChildren && <Badge variant="outline" className="text-xs">{node.subordinates.length} مرؤوسون</Badge>}
              </div>
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                <Shield className="w-3 h-3 shrink-0" />
                النطاق: <span className="font-medium text-foreground/80">{node.scopeLabel}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            <Button size="sm" variant="outline" className="h-8" onClick={() => onEdit(node)}>
              <Pencil className="w-3.5 h-3.5 ml-1" />تعديل النطاق
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-destructive hover:bg-destructive/10" onClick={() => onRemove(node)}>
              <UserMinus className="w-3.5 h-3.5 ml-1" />إزالة
            </Button>
          </div>
        </div>
        {hasChildren && open && (
          <div className="mt-2 space-y-1.5 border-r-2 border-border/60 pr-2">
            {node.subordinates.map((child) => (
              <SupervisorTreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                onEdit={onEdit}
                onRemove={onRemove}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/**
 * Edit Scope dialog (spec §10): choose the supervision level + entity.
 * Sends { newRole: same role, level, scope } to the promote endpoint,
 * which enforces scope containment server-side (§6).
 */
function ScopeEditDialog({ user, onClose, onDone }: { user: SupervisorNode; onClose: () => void; onDone: () => void }) {
  const cascade = useCascade();
  const [level, setLevel] = React.useState<"INSTITUTION" | "SPECIALTY" | "YEAR" | "GROUP" | "SUBGROUP">("SPECIALTY");
  const [cohorts, setCohorts] = React.useState<Array<{ id: number; groupName: string }>>([]);
  const [cohortId, setCohortId] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (level !== "SUBGROUP" || !cascade.specId) return;
    setCohorts([]);
    const params = new URLSearchParams({ specialtyId: cascade.specId });
    if (cascade.groupId) params.set("groupId", cascade.groupId);
    fetch(`/api/cohort?${params.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setCohorts(data.cohorts ?? []))
      .catch(() => setCohorts([]));
  }, [level, cascade.specId, cascade.groupId]);

  async function handleSave() {
    setSaving(true);
    try {
      const scope: Record<string, number | undefined> = {};
      if (level === "INSTITUTION") scope.institutionId = cascade.instId ? parseInt(cascade.instId) : undefined;
      if (level === "SPECIALTY") scope.specialtyId = cascade.specId ? parseInt(cascade.specId) : undefined;
      if (level === "YEAR") {
        scope.yearId = cascade.yearId ? parseInt(cascade.yearId) : undefined;
        scope.specialtyId = cascade.specId ? parseInt(cascade.specId) : undefined;
      }
      if (level === "GROUP") {
        scope.groupId = cascade.groupId ? parseInt(cascade.groupId) : undefined;
        scope.specialtyId = cascade.specId ? parseInt(cascade.specId) : undefined;
      }
      if (level === "SUBGROUP") {
        if (!cohortId) { toast.error("اختر الفوج"); setSaving(false); return; }
        scope.cohortId = parseInt(cohortId);
        scope.specialtyId = cascade.specId ? parseInt(cascade.specId) : undefined;
      }
      const res = await fetch(`/api/users/${user.id}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newRole: user.role, level, scope }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشل حفظ النطاق"); return; }
      toast.success(`تم تحديث نطاق ${user.fullName}`);
      onDone();
    } catch { toast.error("فشل الاتصال"); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Pencil className="w-5 h-5" />تعديل نطاق الإشراف</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="rounded-lg bg-muted/50 p-2 text-xs space-y-0.5">
            <div className="font-bold">{user.fullName}</div>
            <div>الدور: <RoleBadge role={user.role} /></div>
            <div>النطاق الحالي: <span className="font-medium">{user.scopeLabel}</span></div>
          </div>
          <div className="space-y-1.5">
            <Label>مستوى النطاق الجديد</Label>
            <select value={level} onChange={(e) => setLevel(e.target.value as typeof level)} className={selectCls}>
              <option value="INSTITUTION">مؤسسة كاملة</option>
              <option value="SPECIALTY">تخصص كامل</option>
              <option value="YEAR">سنة محددة</option>
              <option value="GROUP">مجموعة محددة</option>
              <option value="SUBGROUP">فوج محدد (مجموعة فرعية)</option>
            </select>
          </div>
          {level === "INSTITUTION" && (
            <div className="space-y-1.5">
              <Label>المؤسسة</Label>
              <select value={cascade.instId} onChange={(e) => cascade.setInstId(e.target.value)} className={selectCls}>
                <option value="">— اختر —</option>
                {cascade.institutions.map((i) => <option key={i.id} value={i.id}>{i.nameAr}</option>)}
              </select>
            </div>
          )}
          {(level === "SPECIALTY" || level === "YEAR" || level === "GROUP" || level === "SUBGROUP") && (
            <div className="space-y-1.5">
              <Label>المؤسسة ثم التخصص</Label>
              <select value={cascade.instId} onChange={(e) => cascade.setInstId(e.target.value)} className={selectCls}>
                <option value="">— المؤسسة —</option>
                {cascade.institutions.map((i) => <option key={i.id} value={i.id}>{i.nameAr}</option>)}
              </select>
              <select value={cascade.specId} onChange={(e) => cascade.setSpecId(e.target.value)} className={selectCls}>
                <option value="">— التخصص —</option>
                {cascade.specialties.map((s) => <option key={s.id} value={s.id}>{s.nameAr}</option>)}
              </select>
            </div>
          )}
          {level === "YEAR" && (
            <div className="space-y-1.5">
              <Label>السنة</Label>
              <select value={cascade.yearId} onChange={(e) => cascade.setYearId(e.target.value)} className={selectCls}>
                <option value="">— اختر —</option>
                {cascade.years.map((y) => <option key={y.id} value={y.id}>{y.yearName}</option>)}
              </select>
            </div>
          )}
          {(level === "GROUP" || level === "SUBGROUP") && (
            <div className="space-y-1.5">
              <Label>السنة ثم المجموعة</Label>
              <select value={cascade.yearId} onChange={(e) => cascade.setYearId(e.target.value)} className={selectCls}>
                <option value="">— السنة —</option>
                {cascade.years.map((y) => <option key={y.id} value={y.id}>{y.yearName}</option>)}
              </select>
              <select value={cascade.groupId} onChange={(e) => cascade.setGroupId(e.target.value)} className={selectCls}>
                <option value="">— المجموعة —</option>
                {cascade.groups.map((g) => <option key={g.id} value={g.id}>{g.groupName}</option>)}
              </select>
            </div>
          )}
          {level === "SUBGROUP" && (
            <div className="space-y-1.5">
              <Label>الفوج (المجموعة الفرعية)</Label>
              <select value={cohortId} onChange={(e) => setCohortId(e.target.value)} className={selectCls}>
                <option value="">— اختر —</option>
                {cohorts.map((c) => <option key={c.id} value={c.id}>{c.groupName}</option>)}
              </select>
            </div>
          )}
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-xs flex items-start gap-2">
            <Shield className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
            <p>لا يمكن تعيين نطاق أوسع من نطاقك الحالي — يتحقق الخادم من ذلك تلقائياً.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حفظ النطاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Remove supervisor (spec §12). No subordinates → the existing removal
 * flow (demote to STUDENT). Has subordinates → the 3-option warning
 * dialog: (1) remove only, subordinates stay under the caller,
 * (2) remove the supervisor AND all subordinates, (3) cancel.
 */
function RemoveSupervisorDialog({ user, onClose, onDone }: { user: SupervisorNode; onClose: () => void; onDone: () => void }) {
  const hasSubordinates = user.subordinates.length > 0;
  const [option, setOption] = React.useState<"keep" | "cascade" | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function handleRemove(opt: "keep" | "cascade") {
    setBusy(true);
    try {
      const res = await fetch(`/api/users/${user.id}/remove-supervisor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ option: opt }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشلت الإزالة"); return; }
      toast.success(data.message ?? "تمت الإزالة");
      onDone();
    } catch { toast.error("فشل الاتصال"); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-destructive flex items-center gap-2">
            <UserMinus className="w-5 h-5" />إزالة دور المشرف
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="rounded-lg bg-muted/50 p-2 text-xs space-y-0.5">
            <div className="font-bold">{user.fullName}</div>
            <div>الدور: <RoleBadge role={user.role} /></div>
            <div>النطاق: <span className="font-medium">{user.scopeLabel}</span></div>
          </div>
          {!hasSubordinates ? (
            <>
              <p className="text-sm">
                سيُزال دور الإشراف من <strong>{user.fullName}</strong> ويعود طالباً عادياً (يبقى حسابه — يمكن إعادة تعيينه لاحقاً).
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={onClose}>إلغاء</Button>
                <Button variant="destructive" onClick={() => handleRemove("keep")} disabled={busy}>
                  {busy && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}إزالة الدور
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <p>
                  هذا المشرف لديه <strong>{user.subordinates.length}</strong> مرؤوساً تحت نطاقه.
                  اختر أحد الخيارات الثلاثة قبل المتابعة:
                </p>
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => setOption("keep")}
                  className={`w-full text-right p-3 rounded-xl border-2 transition-all ${option === "keep" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                >
                  <div className="font-bold text-sm flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" />إزالة دوره فقط</div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    يبقى المرؤوسون مشرفين بنطاقاتهم الحالية وينتقلون تحت إشرافك المباشر.
                  </p>
                </button>
                <button
                  onClick={() => setOption("cascade")}
                  className={`w-full text-right p-3 rounded-xl border-2 transition-all ${option === "cascade" ? "border-destructive bg-destructive/5" : "border-border hover:border-destructive/50"}`}
                >
                  <div className="font-bold text-sm flex items-center gap-2"><XCircle className="w-4 h-4 text-destructive" />إزالته وكافة مرؤوسيه</div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    يُزال دور الإشراف عن المشرف وجميع المرؤوسين تحته (يعودون جميعاً طلاباً).
                  </p>
                </button>
                <button
                  onClick={onClose}
                  className="w-full text-right p-3 rounded-xl border-2 border-border hover:border-muted-foreground/40 transition-all"
                >
                  <div className="font-bold text-sm flex items-center gap-2"><X className="w-4 h-4 text-muted-foreground" />إلغاء العملية</div>
                  <p className="text-xs text-muted-foreground mt-1">لا تُجرى أي تغييرات.</p>
                </button>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={onClose}>إغلاق</Button>
                <Button
                  variant={option === "cascade" ? "destructive" : "default"}
                  disabled={!option || busy}
                  onClick={() => option && handleRemove(option)}
                >
                  {busy && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}
                  {option === "cascade" ? "إزالة الكل" : "تنفيذ الإزالة"}
                </Button>
              </DialogFooter>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}


