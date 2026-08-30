"use client";

import * as React from "react";
import {
  Users, Layers, BookOpen, Upload, Cloud, Plus, TestTube2,
  CheckCircle2, XCircle, Loader2, FolderTree, UserPlus, Clock,
  Check, X, Building2, GraduationCap, Shield, Trash2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { canManageRoles, canCreateGroups, canCreateModules, canCreateCohorts } from "@/lib/auth/permissions";
import { toast } from "sonner";

export function TalibAdminPanelScreen() {
  const { t } = useI18n();
  const { user } = useAuth();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black mb-1">{t("admin.title")}</h1>
        <p className="text-sm text-muted-foreground">
          إدارة الأفواج، المقررات، والمحتوى الأكاديمي
        </p>
      </div>

      <Tabs defaultValue="users">
        <TabsList className="grid w-full grid-cols-4 md:grid-cols-8 gap-1 overflow-x-auto">
          <TabsTrigger value="users" className="text-xs"><Users className="w-3.5 h-3.5 ml-1" />المستخدمون</TabsTrigger>
          <TabsTrigger value="structure" className="text-xs"><Building2 className="w-3.5 h-3.5 ml-1" />الهيكل</TabsTrigger>
          <TabsTrigger value="cohorts" className="text-xs"><Layers className="w-3.5 h-3.5 ml-1" />الأفواج</TabsTrigger>
          <TabsTrigger value="groups" className="text-xs"><FolderTree className="w-3.5 h-3.5 ml-1" />المجموعات</TabsTrigger>
          <TabsTrigger value="requests" className="text-xs"><UserPlus className="w-3.5 h-3.5 ml-1" />الطلبات</TabsTrigger>
          <TabsTrigger value="modules" className="text-xs"><BookOpen className="w-3.5 h-3.5 ml-1" />المقررات</TabsTrigger>
          <TabsTrigger value="content" className="text-xs"><Upload className="w-3.5 h-3.5 ml-1" />المحتوى</TabsTrigger>
          <TabsTrigger value="cloud" className="text-xs"><Cloud className="w-3.5 h-3.5 ml-1" />السحابة</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4"><UsersManager /></TabsContent>
        <TabsContent value="structure" className="mt-4"><StructureManager /></TabsContent>
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
// Users Manager — full list + delete + promote
// =====================================================
interface AppUserRow {
  id: number; fullName: string; email: string; studentId: string;
  role: string; specialtyName: string; yearName: string; groupNumber: string;
  assignedSpecialtyId: number; scopeCohortGroupId: number | null;
  representativeScope: string;
}

function UsersManager() {
  const [users, setUsers] = React.useState<AppUserRow[]>([]);
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

  React.useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const filtered = users.filter((u) =>
    u.fullName.includes(search) || u.email.toLowerCase().includes(search.toLowerCase()) || u.studentId.includes(search)
  );

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
        <p className="text-xs text-muted-foreground mt-1">إدارة مستخدمي النظام وترقية الأدوار ({users.length} مستخدم)</p>
      </div>
      <Input placeholder="بحث بالاسم أو البريد أو الرقم التسلسلي..." value={search} onChange={(e) => setSearch(e.target.value)} />
      {loading ? (
        <div className="text-center py-8"><Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground mb-2" /><p className="text-sm text-muted-foreground">جاري التحميل...</p></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">لا يوجد مستخدمون مطابقون</div>
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto scrollbar-thin">
          {filtered.map((u) => (
            <Card key={u.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm">{u.fullName}</span>
                    <RoleBadge role={u.role} />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1 space-y-0.5">
                    <div>📧 {u.email}</div>
                    <div>🆔 {u.studentId}</div>
                    {u.specialtyName && <div>📚 {u.specialtyName}</div>}
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
  const [scopeCohortId, setScopeCohortId] = React.useState(user.scopeCohortGroupId?.toString() ?? "");
  const [saving, setSaving] = React.useState(false);
  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${user.id}/promote`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newRole, scope: { cohortId: scopeCohortId ? parseInt(scopeCohortId) : undefined, institutionId: 1, specialtyId: user.assignedSpecialtyId } }),
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
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
              <option value="STUDENT">طالب عادي</option>
              <option value="REPRESENTATIVE">ممثل الفوج</option>
              <option value="SPECIALTY_ADMIN">مشرف التخصص</option>
              {user.role === "OWNER" && <option value="OWNER">مالك</option>}
            </select>
          </div>
          {newRole === "REPRESENTATIVE" && (
            <div className="space-y-1.5">
              <Label>الفوج الذي سيُشرف عليه</Label>
              <Input type="number" value={scopeCohortId} onChange={(e) => setScopeCohortId(e.target.value)} placeholder="ID الفوج" />
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
// Structure Manager — institutions + specialties
// =====================================================
function StructureManager() {
  return <div className="space-y-4"><InstitutionsPanel /><SpecialtiesPanel /></div>;
}

function InstitutionsPanel() {
  const [institutions, setInstitutions] = React.useState<Array<{ id: number; nameAr: string; type: string; city: string }>>([]);
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
  const [specialties, setSpecialties] = React.useState<Array<{ id: number; nameAr: string; code: string; faculty: string }>>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(""); const [code, setCode] = React.useState("");
  const [institutionId, setInstitutionId] = React.useState("1"); const [faculty, setFaculty] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try { const res = await fetch("/api/specialties", { cache: "no-store" }); const data = await res.json(); setSpecialties(data.specialties ?? []); }
    catch { toast.error("فشل تحميل التخصصات"); } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { fetchData(); }, [fetchData]);
  async function handleCreate() {
    if (!name.trim() || !code.trim()) { toast.error("الاسم والكود مطلوبان"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/specialties", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nameAr: name.trim(), code: code.trim(), institutionId: parseInt(institutionId), faculty: faculty.trim() }) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تمت إضافة التخصص ✅"); setOpen(false); setName(""); setCode(""); setFaculty(""); fetchData();
    } finally { setSaving(false); }
  }
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div><h3 className="font-bold text-sm flex items-center gap-2"><GraduationCap className="w-4 h-4 text-primary" />التخصصات</h3><p className="text-xs text-muted-foreground">التخصصات الأكاديمية لكل مؤسسة</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 ml-1" />تخصص</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>إضافة تخصص جديد 📚</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5"><Label>اسم التخصص</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: اللغة الفرنسية" /></div>
              <div className="space-y-1.5"><Label>الكود</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="مثال: FR-LIT" /></div>
              <div className="space-y-1.5"><Label>القسم/الكلية</Label><Input value={faculty} onChange={(e) => setFaculty(e.target.value)} placeholder="مثال: قسم اللغات" /></div>
              <div className="space-y-1.5"><Label>المؤسسة (ID)</Label><Input type="number" value={institutionId} onChange={(e) => setInstitutionId(e.target.value)} /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button onClick={handleCreate} disabled={saving}>{saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}إنشاء</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {loading ? <div className="text-center py-4"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {specialties.map((sp) => <Card key={sp.id} className="p-3"><div className="font-bold text-sm">{sp.nameAr}</div><div className="text-xs text-muted-foreground mt-1">{sp.code} {sp.faculty && `• ${sp.faculty}`}</div></Card>)}
        </div>
      )}
    </Card>
  );
}

// =====================================================
// Cohorts Manager — with year selection + delete
// =====================================================
function CohortsManager() {
  const [cohorts, setCohorts] = React.useState<Array<{ id: number; groupName: string; subGroup: string; academicYearId: number }>>([]);
  const [years, setYears] = React.useState<Array<{ id: number; yearName: string }>>([]);
  const [selectedYear, setSelectedYear] = React.useState<number>(1);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const { user } = useAuth();

  const fetchYears = React.useCallback(async () => {
    try { const res = await fetch(`/api/onboarding/years?specialtyId=${user?.assignedSpecialtyId ?? 1}`); const data = await res.json(); setYears(data.years ?? []); } catch {}
  }, [user]);

  const fetchCohorts = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cohort?specialtyId=${user?.assignedSpecialtyId ?? 1}&academicYearId=${selectedYear}`, { cache: "no-store" });
      const data = await res.json();
      setCohorts(data.cohorts ?? []);
    } catch { toast.error("فشل تحميل الأفواج"); } finally { setLoading(false); }
  }, [user, selectedYear]);

  React.useEffect(() => { fetchYears(); }, [fetchYears]);
  React.useEffect(() => { fetchCohorts(); }, [fetchCohorts]);

  async function handleCreate() {
    if (!newName.trim()) { toast.error("اكتب اسم الفوج"); return; }
    setCreating(true);
    try {
      const res = await fetch("/api/cohort", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ specialtyId: user?.assignedSpecialtyId ?? 1, academicYearId: selectedYear, groupName: newName.trim() }) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تم إنشاء الفوج بنجاح"); setNewName(""); setOpen(false); fetchCohorts();
    } finally { setCreating(false); }
  }

  async function handleDelete(id: number) {
    if (!confirm("هل تريد حذف هذا الفوج؟")) return;
    try {
      const res = await fetch(`/api/cohort?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تم حذف الفوج"); fetchCohorts();
    } catch { toast.error("فشل الحذف"); }
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div><h3 className="font-bold text-sm flex items-center gap-2"><Layers className="w-4 h-4 text-primary" />إدارة الأفواج</h3><p className="text-xs text-muted-foreground">اختر السنة لعرض/إضافة أفواجها</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 ml-1" />فوج جديد</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>إنشاء فوج جديد</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5"><Label>السنة الدراسية</Label><select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">{years.map((y) => <option key={y.id} value={y.id}>{y.yearName}</option>)}</select></div>
              <div className="space-y-1.5"><Label>اسم الفوج</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="مثال: الفوج 04" /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button onClick={handleCreate} disabled={creating}>{creating && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}إنشاء</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="space-y-1.5">
        <Label>السنة الدراسية</Label>
        <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
          {years.map((y) => <option key={y.id} value={y.id}>{y.yearName}</option>)}
        </select>
      </div>
      {loading ? <div className="text-center py-4"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div> : cohorts.length === 0 ? (
        <div className="text-center py-4 text-sm text-muted-foreground">لا توجد أفواج في هذه السنة</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {cohorts.map((c) => (
            <Card key={c.id} className="p-3">
              <div className="flex items-start justify-between">
                <div><div className="font-bold text-sm">{c.groupName}</div>{c.subGroup && <div className="text-xs text-muted-foreground mt-0.5">{c.subGroup}</div>}<Badge variant="outline" className="mt-2 text-[10px]">ID: {c.id}</Badge></div>
                <Button size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10 h-7 w-7" onClick={() => handleDelete(c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Card>
  );
}

// =====================================================
// Groups Manager — with year selection + delete
// =====================================================
function GroupsManager() {
  const [groups, setGroups] = React.useState<Array<{ id: number; groupName: string; description: string }>>([]);
  const [years, setYears] = React.useState<Array<{ id: number; yearName: string }>>([]);
  const [selectedYear, setSelectedYear] = React.useState<number>(1);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [newName, setNewName] = React.useState(""); const [newDesc, setNewDesc] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const { user } = useAuth();

  const fetchYears = React.useCallback(async () => {
    try { const res = await fetch(`/api/onboarding/years?specialtyId=${user?.assignedSpecialtyId ?? 1}`); const data = await res.json(); setYears(data.years ?? []); } catch {}
  }, [user]);

  const fetchGroups = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/groups?specialtyId=${user?.assignedSpecialtyId ?? 1}&academicYearId=${selectedYear}`, { cache: "no-store" });
      const data = await res.json(); setGroups(data.groups ?? []);
    } catch { toast.error("فشل تحميل المجموعات"); } finally { setLoading(false); }
  }, [user, selectedYear]);

  React.useEffect(() => { fetchYears(); }, [fetchYears]);
  React.useEffect(() => { fetchGroups(); }, [fetchGroups]);

  async function handleCreate() {
    if (!newName.trim()) { toast.error("اكتب اسم المجموعة"); return; }
    setCreating(true);
    try {
      const res = await fetch("/api/groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ specialtyId: user?.assignedSpecialtyId ?? 1, academicYearId: selectedYear, groupName: newName.trim(), description: newDesc.trim() }) });
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
        <div><h3 className="font-bold text-sm flex items-center gap-2"><FolderTree className="w-4 h-4 text-primary" />إدارة المجموعات</h3><p className="text-xs text-muted-foreground">المجموعة تحتوي عدة أفواج</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 ml-1" />مجموعة</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>إنشاء مجموعة جديدة</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5"><Label>السنة الدراسية</Label><select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">{years.map((y) => <option key={y.id} value={y.id}>{y.yearName}</option>)}</select></div>
              <div className="space-y-1.5"><Label>اسم المجموعة</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="مثال: المجموعة 3" /></div>
              <div className="space-y-1.5"><Label>الوصف</Label><Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="مثال: مجموعة مسائية" /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button onClick={handleCreate} disabled={creating}>{creating && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}إنشاء</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="space-y-1.5">
        <Label>السنة الدراسية</Label>
        <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
          {years.map((y) => <option key={y.id} value={y.id}>{y.yearName}</option>)}
        </select>
      </div>
      {loading ? <div className="text-center py-4"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div> : groups.length === 0 ? (
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
      <div><h3 className="font-bold text-sm flex items-center gap-2"><UserPlus className="w-4 h-4 text-primary" />طلبات الانضمام المعلّقة</h3><p className="text-xs text-muted-foreground mt-1">الطلبات يرسلها الطلاب</p></div>
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
// Modules Manager
// =====================================================
function ModulesManager() {
  const [courses, setCourses] = React.useState<Array<{ id: number; name: string; code: string; professorName: string; coefficient: number }>>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(""); const [code, setCode] = React.useState("");
  const [professor, setProfessor] = React.useState(""); const [coefficient, setCoefficient] = React.useState("2");
  const [saving, setSaving] = React.useState(false);
  const { user } = useAuth();
  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try { const res = await fetch("/api/courses", { cache: "no-store" }); const data = await res.json(); setCourses(data.courses ?? []); }
    catch {} finally { setLoading(false); }
  }, []);
  React.useEffect(() => { fetchData(); }, [fetchData]);
  async function handleCreate() {
    if (!name.trim() || !code.trim()) { toast.error("الاسم والكود مطلوبان"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/courses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), code: code.trim(), professorName: professor.trim(), coefficient: parseFloat(coefficient) || 2, specialtyId: user?.assignedSpecialtyId ?? 1, academicYearId: 1 }) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تمت إضافة المقياس ✅"); setOpen(false); setName(""); setCode(""); setProfessor(""); fetchData();
    } finally { setSaving(false); }
  }
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div><h3 className="font-bold text-sm flex items-center gap-2"><BookOpen className="w-4 h-4 text-primary" />المقاييس</h3><p className="text-xs text-muted-foreground">إدارة مقررات التخصص</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 ml-1" />مقياس</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>إضافة مقياس جديد 📚</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
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
        <div className="space-y-2">
          {courses.map((c) => <Card key={c.id} className="p-3"><div className="font-bold text-sm">{c.name}</div><div className="text-xs text-muted-foreground mt-1">{c.code} • الأستاذ: {c.professorName || "—"} • المعامل: {c.coefficient}</div></Card>)}
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
      <div><h3 className="font-bold text-sm flex items-center gap-2"><Upload className="w-4 h-4 text-primary" />رفع محتوى جديد</h3><p className="text-xs text-muted-foreground">النوع يحدد الجدول الذي يُحفظ فيه</p></div>
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
