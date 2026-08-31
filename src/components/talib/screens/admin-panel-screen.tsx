"use client";

import * as React from "react";
import {
  Users, Layers, BookOpen, Upload, Cloud, Plus, TestTube2,
  CheckCircle2, XCircle, Loader2, FolderTree, UserPlus, Clock,
  Check, X, Building2, GraduationCap, Shield, Trash2, Route, CalendarDays,
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
import { canManageRoles, canCreateGroups, canCreateModules, canCreateCohorts } from "@/lib/auth/permissions";
import { toast } from "sonner";

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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black mb-1">{t("admin.title")}</h1>
        <p className="text-sm text-muted-foreground">
          إدارة المؤسسات، التخصصات، الملامح، الأفواج، المقررات، والمحتوى الأكاديمي
        </p>
      </div>

      <Tabs defaultValue="users">
        {/* fix أ.5: tabs used to squeeze into 4 columns on mobile, pushing
            "الطلبات" (join requests) off-screen. Now they wrap into rows so
            every tab is always visible and reachable. */}
        <TabsList className="flex flex-wrap gap-1 w-full">
          <TabsTrigger value="users" className="text-xs flex-1 min-w-24"><Users className="w-3.5 h-3.5 ml-1" />المستخدمون</TabsTrigger>
          <TabsTrigger value="structure" className="text-xs flex-1 min-w-24"><Building2 className="w-3.5 h-3.5 ml-1" />الهيكل</TabsTrigger>
          <TabsTrigger value="tracks" className="text-xs flex-1 min-w-24"><Route className="w-3.5 h-3.5 ml-1" />الملامح</TabsTrigger>
          <TabsTrigger value="years" className="text-xs flex-1 min-w-24"><CalendarDays className="w-3.5 h-3.5 ml-1" />السنوات</TabsTrigger>
          <TabsTrigger value="cohorts" className="text-xs flex-1 min-w-24"><Layers className="w-3.5 h-3.5 ml-1" />الأفواج</TabsTrigger>
          <TabsTrigger value="groups" className="text-xs flex-1 min-w-24"><FolderTree className="w-3.5 h-3.5 ml-1" />المجموعات</TabsTrigger>
          <TabsTrigger value="requests" className="text-xs flex-1 min-w-24"><UserPlus className="w-3.5 h-3.5 ml-1" />الطلبات</TabsTrigger>
          <TabsTrigger value="modules" className="text-xs flex-1 min-w-24"><BookOpen className="w-3.5 h-3.5 ml-1" />المقررات</TabsTrigger>
          <TabsTrigger value="content" className="text-xs flex-1 min-w-24"><Upload className="w-3.5 h-3.5 ml-1" />المحتوى</TabsTrigger>
          <TabsTrigger value="cloud" className="text-xs flex-1 min-w-24"><Cloud className="w-3.5 h-3.5 ml-1" />السحابة</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4"><UsersManager /></TabsContent>
        <TabsContent value="structure" className="mt-4"><StructureManager /></TabsContent>
        <TabsContent value="tracks" className="mt-4"><TracksManager /></TabsContent>
        <TabsContent value="years" className="mt-4"><YearsManager /></TabsContent>
        <TabsContent value="cohorts" className="mt-4"><CohortsManager /></TabsContent>
        <TabsContent value="groups" className="mt-4"><GroupsManager /></TabsContent>
        <TabsContent value="requests" className="mt-4"><JoinRequestsManager /></TabsContent>
        <TabsContent value="modules" className="mt-4"><ModulesManager /></TabsContent>
        <TabsContent value="content" className="mt-4"><ContentUploader /></TabsContent>
        <TabsContent value="cloud" className="mt-4"><CloudManager /></TabsContent>
      </Tabs>
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
                      <Badge variant="secondary" className="text-[10px]">{instCount}</Badge>
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
                              <Badge variant="outline" className="text-[10px]">{specUsers.length}</Badge>
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
                                      {u.yearName && <Badge variant="outline" className="text-[10px]">{u.yearName}</Badge>}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground mt-1 space-y-0.5">
                                      <div>📧 {u.email}</div>
                                      <div>🆔 {u.studentId}</div>
                                      {u.groupNumber && <div>👥 {u.groupNumber}</div>}
                                    </div>
                                  </div>
                                  <div className="flex gap-1 shrink-0">
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
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${c.color}`}>{c.label}</span>;
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
            <div>📧 {user.email}</div><div>🆔 {user.studentId}</div>
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
      toast.success("تمت إضافة المؤسسة ✅"); setOpen(false); setName(""); setType(""); setCity(""); fetchData();
    } finally { setSaving(false); }
  }
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div><h3 className="font-bold text-sm flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" />المؤسسات الجامعية</h3><p className="text-xs text-muted-foreground">المدارس العليا والجامعات</p></div>
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
      {loading ? <div className="text-center py-4"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {institutions.map((inst) => <Card key={inst.id} className="p-3"><div className="font-bold text-sm">{inst.nameAr}</div><div className="text-xs text-muted-foreground mt-1">{inst.type} • {inst.city}</div></Card>)}
        </div>
      )}
    </Card>
  );
}

function SpecialtiesPanel() {
  // fix أ.1: institution is a proper DROPDOWN (was a raw ID number input),
  // the list shows which institution each specialty belongs to, and the "+"
  // button is always visible even when the list is empty.
  const cascade = useCascade();
  const [specialties, setSpecialties] = React.useState<Spec[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(""); const [code, setCode] = React.useState("");
  const [faculty, setFaculty] = React.useState("");
  const [saving, setSaving] = React.useState(false);

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
      toast.success("تمت إضافة التخصص ✅ — أضف ملامحه من تبويب 'الملامح'");
      setOpen(false); setName(""); setCode(""); setFaculty(""); fetchData(cascade.instId);
    } finally { setSaving(false); }
  }

  const instName = (id: number) => cascade.institutions.find((i) => i.id === id)?.nameAr ?? "—";

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div><h3 className="font-bold text-sm flex items-center gap-2"><GraduationCap className="w-4 h-4 text-primary" />التخصصات</h3><p className="text-xs text-muted-foreground">التخصصات الأكاديمية لكل مؤسسة</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 ml-1" />تخصص</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>إضافة تخصص جديد 📚</DialogTitle></DialogHeader>
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
              <div className="font-bold text-sm">{sp.nameAr}</div>
              <div className="text-xs text-muted-foreground mt-1">{sp.code} {sp.faculty && `• ${sp.faculty}`}</div>
              <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1"><Building2 className="w-3 h-3" />{instName(sp.institutionId)}</div>
            </Card>
          ))}
        </div>
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
    if (ok) { toast.success(`تمت إضافة "${preset.code}" ✅`); fetchTracks(cascade.specId); }
  }

  async function handleCustom() {
    if (!customName.trim() || !customCode.trim()) { toast.error("اسم الملمح والكود مطلوبان"); return; }
    const ok = await addTrack(customName.trim(), customCode.trim().toUpperCase());
    if (ok) { toast.success("تمت إضافة الملمح ✅"); setCustomName(""); setCustomCode(""); setOpen(false); fetchTracks(cascade.specId); }
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
                  <Plus className="w-3.5 h-3.5 ml-1" />{p.code}{exists ? " ✓" : ""}
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
                  <div className="font-bold text-sm">{tr.trackNameAr}</div>
                  <div className="text-xs text-muted-foreground mt-1"><Badge variant="outline" className="text-[10px]">{tr.code}</Badge></div>
                </Card>
              ))}
            </div>
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
    if (ok) { toast.success(`تمت إضافة "${name}" ✅`); fetchYears(cascade.specId); }
  }

  async function handleCustom() {
    if (!customName.trim()) { toast.error("اكتب اسم السنة"); return; }
    const ok = await addYear(customName.trim(), parseInt(customSemester));
    if (ok) {
      toast.success("تمت إضافة السنة ✅");
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
                  <Plus className="w-3.5 h-3.5 ml-1" />{name}{exists ? " ✓" : ""}
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
                      <Badge variant="outline" className="mt-2 text-[10px]">ID: {y.id}</Badge>
                    </div>
                    <Button size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10 h-7 w-7" onClick={() => setDeleteYear(y)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
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
      toast.success("تم إنشاء الفوج داخل المجموعة ✅");
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
                <div><div className="font-bold text-sm">{c.groupName}</div>{c.subGroup && <div className="text-xs text-muted-foreground mt-0.5">{c.subGroup}</div>}<Badge variant="outline" className="mt-2 text-[10px]">ID: {c.id}</Badge></div>
                <Button size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10 h-7 w-7" onClick={() => setDeleteCohort(c)}><Trash2 className="w-3.5 h-3.5" /></Button>
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

  async function handleDelete(id: number) {
    if (!confirm("هل تريد حذف هذه المجموعة؟")) return;
    try {
      const res = await fetch(`/api/groups?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تم حذف المجموعة"); fetchGroups();
    } catch { toast.error("فشل الحذف"); }
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
                <Button size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10 h-7 w-7" onClick={() => handleDelete(g.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </Card>
          ))}
        </div>
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
                  <div className="text-[10px] text-muted-foreground mt-1">{new Date(req.createdAt).toLocaleString("ar")}</div>
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
// Modules Manager — fix: year + semester selectors
// (was hardcoded to year 1 / semester 1 — the exact cause
// of the "added to semester 1 but shows under All" bug)
// =====================================================
function ModulesManager() {
  const [courses, setCourses] = React.useState<Array<{ id: number; name: string; code: string; professorName: string; coefficient: number; semester: number }>>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(""); const [code, setCode] = React.useState("");
  const [professor, setProfessor] = React.useState(""); const [coefficient, setCoefficient] = React.useState("2");
  const [saving, setSaving] = React.useState(false);
  const [years, setYears] = React.useState<Year[]>([]);
  const [selYear, setSelYear] = React.useState<string>("");
  const [selSemester, setSelSemester] = React.useState("1");
  const { user } = useAuth();

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
      toast.success("تمت إضافة المقياس ✅"); setOpen(false); setName(""); setCode(""); setProfessor(""); fetchData();
    } finally { setSaving(false); }
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div><h3 className="font-bold text-sm flex items-center gap-2"><BookOpen className="w-4 h-4 text-primary" />المقاييس</h3><p className="text-xs text-muted-foreground">إدارة مقررات التخصص — حسب السنة والسداسي</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 ml-1" />مقياس</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>إضافة مقياس جديد 📚</DialogTitle></DialogHeader>
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
      {loading ? <div className="text-center py-4"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div> : courses.length === 0 ? (
        <div className="text-center py-4 text-sm text-muted-foreground">لا توجد مقاييس</div>
      ) : (
        <div className="space-y-2 max-h-[55vh] overflow-y-auto scrollbar-thin">
          {courses.map((c) => <Card key={c.id} className="p-3"><div className="font-bold text-sm">{c.name}</div><div className="text-xs text-muted-foreground mt-1">{c.code} • الأستاذ: {c.professorName || "—"} • المعامل: {c.coefficient} • {c.semester === 2 ? "السداسي الثاني" : "السداسي الأول"}</div></Card>)}
        </div>
      )}
    </Card>
  );
}

// =====================================================
// Content Uploader
// =====================================================
function ContentUploader() {
  const [contentType, setContentType] = React.useState<"lecture" | "exam" | "announcement" | "assignment">("lecture");
  const [title, setTitle] = React.useState(""); const [description, setDescription] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { toast.error("اكتب عنواناً"); return; }
    setUploading(true);
    try {
      const res = await fetch("/api/content/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contentType, title: title.trim(), description: description.trim(), moduleId: 1 }) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تم رفع المحتوى بنجاح"); setTitle(""); setDescription("");
    } finally { setUploading(false); }
  }
  return (
    <Card className="p-4 space-y-3">
      <div><h3 className="font-bold text-sm flex items-center gap-2"><Upload className="w-4 h-4 text-primary" />رفع محتوى جديد</h3><p className="text-xs text-muted-foreground">النوع يحدد الجدول الذي يُحفظ فيه — للإعلانات والاختبارات استخدم الشاشات المخصصة لها</p></div>
      <form onSubmit={handleUpload} className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[{ k: "lecture", l: "محاضرة" }, { k: "exam", l: "امتحان" }, { k: "announcement", l: "إعلان" }, { k: "assignment", l: "واجب" }].map((o) => (
            <button key={o.k} type="button" onClick={() => setContentType(o.k as never)} className={`py-2 rounded-lg text-xs font-bold border-2 ${contentType === o.k ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"}`}>{o.l}</button>
          ))}
        </div>
        <div className="space-y-1.5"><Label>العنوان</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان المحتوى" /></div>
        <div className="space-y-1.5"><Label>الوصف</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="وصف مختصر" /></div>
        <Button type="submit" disabled={uploading} className="w-full">{uploading && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}<Upload className="w-4 h-4 ml-1" />رفع المحتوى</Button>
      </form>
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


