"use client";

import * as React from "react";
import {
  Users,
  Layers,
  BookOpen,
  Upload,
  Cloud,
  Plus,
  TestTube2,
  CheckCircle2,
  XCircle,
  Loader2,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { canAccessDevSettings } from "@/lib/auth/permissions";
import { toast } from "sonner";

interface Cohort {
  id: number;
  groupName: string;
  subGroup: string;
}

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

      <Tabs defaultValue="cohorts">
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-6 gap-1">
          <TabsTrigger value="cohorts" className="text-xs">
            <Layers className="w-3.5 h-3.5 ml-1" />
            الأفواج
          </TabsTrigger>
          <TabsTrigger value="modules" className="text-xs">
            <BookOpen className="w-3.5 h-3.5 ml-1" />
            المقررات
          </TabsTrigger>
          <TabsTrigger value="users" className="text-xs">
            <Users className="w-3.5 h-3.5 ml-1" />
            المستخدمون
          </TabsTrigger>
          <TabsTrigger value="content" className="text-xs">
            <Upload className="w-3.5 h-3.5 ml-1" />
            المحتوى
          </TabsTrigger>
          <TabsTrigger value="cloud" className="text-xs">
            <Cloud className="w-3.5 h-3.5 ml-1" />
            السحابة
          </TabsTrigger>
          {canAccessDevSettings(user ?? null) && (
            <TabsTrigger value="dev" className="text-xs">
              <KeyRound className="w-3.5 h-3.5 ml-1" />
              مطوّر
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="cohorts" className="mt-4">
          <CohortsManager />
        </TabsContent>
        <TabsContent value="modules" className="mt-4">
          <ModulesManager />
        </TabsContent>
        <TabsContent value="users" className="mt-4">
          <UsersManager />
        </TabsContent>
        <TabsContent value="content" className="mt-4">
          <ContentUploader />
        </TabsContent>
        <TabsContent value="cloud" className="mt-4">
          <CloudManager />
        </TabsContent>
        {canAccessDevSettings(user ?? null) && (
          <TabsContent value="dev" className="mt-4">
            <DevSettings />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// Fix A.2: Cohorts manager — create new cohorts dynamically
function CohortsManager() {
  const [cohorts, setCohorts] = React.useState<Cohort[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newSubGroup, setNewSubGroup] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const fetchCohorts = React.useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all cohorts for specialtyId=1 (will be dynamic based on user's specialty)
      const res = await fetch("/api/cohort?specialtyId=1", {
        cache: "no-store",
      });
      const data = await res.json();
      setCohorts(data.cohorts ?? []);
    } catch {
      toast.error("فشل تحميل قائمة الأفواج");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchCohorts();
  }, [fetchCohorts]);

  async function handleCreate() {
    if (!newName.trim()) {
      toast.error("اكتب اسم الفوج (مثال: الفوج 04)");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/cohort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          specialtyId: 1,
          academicYearId: 1, // default; will be selectable in future
          groupName: newName.trim(),
          subGroup: newSubGroup.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "فشل الإنشاء");
        return;
      }
      toast.success(`تم إنشاء ${data.cohort.groupName} بنجاح`);
      setNewName("");
      setNewSubGroup("");
      setOpen(false);
      fetchCohorts();
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-sm">إدارة الأفواج</h3>
          <p className="text-xs text-muted-foreground">
            أنشئ وأدر أفواج تخصصك. كل فوج جديد يحصل على ID تلقائي.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 ml-1" />
              فوج جديد
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>إنشاء فوج جديد</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="cohortName">اسم الفوج</Label>
                <Input
                  id="cohortName"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="مثال: الفوج 04"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="subGroup">الفوج الفرعي (اختياري)</Label>
                <Input
                  id="subGroup"
                  value={newSubGroup}
                  onChange={(e) => setNewSubGroup(e.target.value)}
                  placeholder="مثال: الفوج الفرعي A"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
              >
                إلغاء
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? (
                  <Loader2 className="w-4 h-4 ml-1 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 ml-1" />
                )}
                إنشاء
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <Loader2 className="w-5 h-5 mx-auto animate-spin mb-2" />
          جاري التحميل...
        </div>
      ) : cohorts.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          لا توجد أفواج. أنشئ أول فوج.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {cohorts.map((c) => (
            <Card key={c.id} className="p-3">
              <div className="font-bold text-sm">{c.groupName}</div>
              {c.subGroup && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {c.subGroup}
                </div>
              )}
              <Badge variant="outline" className="mt-2 text-[10px]">
                ID: {c.id}
              </Badge>
            </Card>
          ))}
        </div>
      )}
    </Card>
  );
}

function ModulesManager() {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-bold text-sm">المقررات</h3>
          <p className="text-xs text-muted-foreground">
            إدارة مقررات التخصص (fix B.7)
          </p>
        </div>
        <Button size="sm">
          <Plus className="w-4 h-4 ml-1" />
          مقياس جديد
        </Button>
      </div>
      <div className="text-center py-8 text-sm text-muted-foreground">
        لا توجد مقررات. أضف أول مقياس لتبدأ.
      </div>
    </Card>
  );
}

function UsersManager() {
  return (
    <Card className="p-4">
      <h3 className="font-bold text-sm mb-1">المستخدمون</h3>
      <p className="text-xs text-muted-foreground mb-3">
        إدارة مستخدمي النظام وأدوارهم
      </p>
      <div className="text-center py-8 text-sm text-muted-foreground">
        سيتم عرض قائمة المستخدمين هنا.
      </div>
    </Card>
  );
}

// Fix A.3: Content uploader with correct routing
function ContentUploader() {
  const [contentType, setContentType] = React.useState<
    "lecture" | "exam" | "announcement" | "assignment"
  >("lecture");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [uploading, setUploading] = React.useState(false);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("اكتب عنواناً");
      return;
    }
    setUploading(true);
    try {
      // Fix A.3: pass contentType explicitly — server routes to correct table
      const res = await fetch("/api/content/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentType,
          title: title.trim(),
          description: description.trim(),
          moduleId: 1, // default; will be selectable in future
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "فشل الرفع");
        return;
      }
      // Fix A.5: confirm cloud upload success, not vague "saved locally"
      if (data.cloudStatus === "uploaded") {
        toast.success("تم رفع المحتوى إلى السحابة بنجاح");
      } else if (data.cloudStatus === "pending") {
        toast.success("تم حفظ المحتوى محلياً. سيُرفع للسحابة قريباً.");
      } else {
        toast.error(`فشل الرفع للسحابة: ${data.errorMessage ?? "خطأ غير معروف"}`);
      }
      setTitle("");
      setDescription("");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="font-bold text-sm">رفع محتوى جديد</h3>
        <p className="text-xs text-muted-foreground">
          النوع يحدد الجدول الذي يُحفظ فيه المحتوى
        </p>
      </div>

      <form onSubmit={handleUpload} className="space-y-3">
        {/* Content type selector */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { key: "lecture", label: "محاضرة" },
            { key: "exam", label: "امتحان" },
            { key: "announcement", label: "إعلان" },
            { key: "assignment", label: "واجب" },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setContentType(opt.key as typeof contentType)}
              className={`py-2 rounded-lg text-xs font-bold border-2 transition-all ${
                contentType === opt.key
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="title">العنوان</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="عنوان المحتوى"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="desc">الوصف</Label>
          <Input
            id="desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="وصف مختصر"
          />
        </div>

        <Button type="submit" disabled={uploading} className="w-full">
          {uploading ? (
            <Loader2 className="w-4 h-4 ml-1 animate-spin" />
          ) : (
            <Upload className="w-4 h-4 ml-1" />
          )}
          رفع المحتوى
        </Button>
      </form>
    </Card>
  );
}

// Fix A.4: working connection test + fix A.6: no key display here
function CloudManager() {
  const [testing, setTesting] = React.useState(false);
  const [result, setResult] = React.useState<
    { ok: boolean; message: string } | null
  >(null);

  async function handleTest() {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch("/api/test-connection", { cache: "no-store" });
      const data = await res.json();
      setResult({ ok: data.ok, message: data.message });
      if (data.ok) {
        toast.success(data.message);
      } else {
        toast.error(data.message);
      }
    } catch (e) {
      const msg = `خطأ شبكة: ${(e as Error).message}`;
      setResult({ ok: false, message: msg });
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="font-bold text-sm">السحابة والمزامنة</h3>
        <p className="text-xs text-muted-foreground">
          اختبار الاتصال بقاعدة بيانات Supabase
        </p>
      </div>

      {/* Fix A.6: NO display of Supabase URL or Anon Key here. */}
      {/* Those are only in /dev-settings tab accessible to OWNER. */}

      <Button onClick={handleTest} disabled={testing} variant="outline" className="w-full">
        {testing ? (
          <Loader2 className="w-4 h-4 ml-1 animate-spin" />
        ) : (
          <TestTube2 className="w-4 h-4 ml-1" />
        )}
        اختبار الاتصال
      </Button>

      {result && (
        <div
          className={`rounded-lg p-3 flex items-start gap-2 ${
            result.ok
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {result.ok ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
          )}
          <span className="text-xs font-medium">{result.message}</span>
        </div>
      )}

      <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg flex items-start gap-2">
        <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          مفاتيح Supabase السرية لا تُعرض في هذه الشاشة. يمكن الوصول إليها فقط من
          تبويب «مطوّر» المتاح للمالك.
        </span>
      </div>
    </Card>
  );
}

// Fix A.6: Developer settings — OWNER only, masked keys
function DevSettings() {
  const [showKey, setShowKey] = React.useState(false);
  const [url, setUrl] = React.useState("");
  const [maskedKey, setMaskedKey] = React.useState("");

  React.useEffect(() => {
    // Read public env vars via API (not exposed client-side by default)
    fetch("/api/dev/env")
      .then((r) => r.json())
      .then((data) => {
        setUrl(data.url ?? "");
        setMaskedKey(data.maskedKey ?? "");
      })
      .catch(() => {
        setUrl("");
        setMaskedKey("غير متاح");
      });
  }, []);

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="font-bold text-sm flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-primary" />
          إعدادات المطوّر
        </h3>
        <p className="text-xs text-muted-foreground">
          متاحة فقط للمالك (OWNER)
        </p>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">
          Supabase URL:
        </div>
        <code className="block text-xs bg-muted p-2 rounded break-all">
          {url || "—"}
        </code>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            Supabase Anon Key:
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-6"
            onClick={() => setShowKey(!showKey)}
          >
            {showKey ? "إخفاء" : "إظهار"}
          </Button>
        </div>
        <code className="block text-xs bg-muted p-2 rounded break-all">
          {showKey ? maskedKey : "•".repeat(40)}
        </code>
        <p className="text-[10px] text-muted-foreground">
          ⚠️ المفتاح يُعرض مقنّعاً. ادفع خدمة Role Key من Supabase Dashboard لإجراء
          عمليات إدارية.
        </p>
      </div>

      <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 p-3 rounded-lg">
        ⚠️ هذه القيم حسّاسة. لا تشاركها مع أي شخص. بعد إكمال المشروع، دوّر المفاتيح.
      </div>
    </Card>
  );
}
