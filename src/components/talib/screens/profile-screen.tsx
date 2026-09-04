"use client";

import * as React from "react";
import {
  Mail, IdCard, Building, BookOpen, Users, Shield, LogOut,
  ChevronLeft, Trash2, AlertTriangle, Loader2, UserPlus, Layers,
  Calendar, FolderTree, Flag, Settings,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { useShell } from "@/app/page";
import { toast } from "sonner";

interface Props {
  onSignOut: () => void;
}

export function TalibProfileScreen({ onSignOut }: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { navigate } = useShell();

  const [profileDetails, setProfileDetails] = React.useState<{
    institution: string;
    specialtyName: string;
    trackName: string;
    yearName: string;
    groupName: string;
    cohortName: string;
  } | null>(null);

  React.useEffect(() => {
    if (!user) return;
    fetch("/api/profile/details", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data.profile) setProfileDetails(data.profile);
      })
      .catch(() => {});
  }, [user]);

  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteConfirm, setDeleteConfirm] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);

  async function handleDeleteAccount() {
    if (deleteConfirm !== t("common.appName")) {
      toast.error(`اكتب "${t("common.appName")}" للتأكيد`);
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/auth/delete", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "فشل الحذف");
        return;
      }
      toast.success("تم حذف حسابك بنجاح");
      setDeleteOpen(false);
      onSignOut();
    } finally {
      setDeleting(false);
    }
  }

  if (!user) return null;

  const roleLabel = t(`roles.${user.role}`);
  const cohortDisplay = profileDetails?.cohortName
    ? profileDetails.cohortName
    : user.scopeCohortGroupId
    ? `فوج #${user.scopeCohortGroupId}`
    : "بلا فوج (قيد الإلحاق)";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black mb-1">{t("nav.profile")}</h1>
        <p className="text-sm text-muted-foreground">معلوماتك الشخصية والأكاديمية</p>
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0 select-none"
            aria-hidden="true"
          >
            <span className="text-2xl font-black leading-none">
              {user.fullName
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w.charAt(0))
                .join(" ")}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-lg truncate">{user.fullName}</h2>
            <p className="text-sm text-muted-foreground truncate">{user.email}</p>
            <Badge variant="secondary" className="mt-1">
              <Shield className="w-3 h-3 ml-1" />
              {roleLabel}
            </Badge>
          </div>
        </div>
      </Card>

      <Card className="p-2 divide-y divide-border">
        <InfoRow icon={<IdCard className="w-4 h-4" />} label="الرقم التسلسلي" value={user.studentId} />
        <InfoRow icon={<Building className="w-4 h-4" />} label="المؤسسة" value={profileDetails?.institution ?? "—"} />
        <InfoRow icon={<BookOpen className="w-4 h-4" />} label="التخصص" value={profileDetails?.specialtyName ?? "—"} />
        <InfoRow icon={<Layers className="w-4 h-4" />} label="الملمح" value={profileDetails?.trackName ?? "—"} />
        <InfoRow icon={<Calendar className="w-4 h-4" />} label="السنة" value={profileDetails?.yearName ?? "—"} />
        <InfoRow icon={<FolderTree className="w-4 h-4" />} label="المجموعة" value={profileDetails?.groupName ?? "—"} />
        <InfoRow icon={<Users className="w-4 h-4" />} label="الفوج" value={cohortDisplay} highlight={cohortDisplay.startsWith("بلا فوج")} />
      </Card>

      {/* round 26: notification preferences moved to the settings screen
          (gear icon). A link stays here for discoverability. */}
      <div className="space-y-2">
        {user.scopeCohortGroupId == null && (
          <Button
            variant="outline"
            className="w-full justify-between"
            onClick={() => navigate("BROWSE_GROUPS")}
          >
            <span className="flex items-center">
              <UserPlus className="w-4 h-4 ml-2" />
              تصفح المجموعات والأفواج
            </span>
            <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
          </Button>
        )}

        <Button
          variant="outline"
          className="w-full justify-between"
          onClick={() => navigate("ANNOUNCEMENTS")}
        >
          <span className="flex items-center">
            <Mail className="w-4 h-4 ml-2" />
            الإعلانات
          </span>
          <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
        </Button>

        {/* round 11 (review §14): التبليغ كان محتجزاً خلف أيقونات علم صغيرة
            في شاشتي المقررات والواجبات — بلا مدخل واضح. الآن لكل مستخدم —
            ومن بينهم الطالب العادي — زر «الإبلاغ عن مشكلة» واضح هنا، مع زر
            «إرسال التبليغ» الظاهر دائماً. */}
        <ReportIssueDialog />

        <Button
          variant="outline"
          className="w-full justify-between"
          onClick={() => navigate("SETTINGS")}
        >
          <span className="flex items-center">
            <Settings className="w-4 h-4 ml-2" />
            الإعدادات
          </span>
          <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
        </Button>

        <Button variant="outline" className="w-full" onClick={onSignOut}>
          <LogOut className="w-4 h-4 ml-2" />
          تسجيل الخروج
        </Button>
      </div>

      <Card className="p-4 border-destructive/30 bg-destructive/5">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-destructive/15 text-destructive flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-sm mb-1 text-destructive">منطقة الخطر</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              حذف الحساب إجراء لا يمكن التراجع عنه. سيتم حذف جميع بياناتك (جلساتك،
              طلبات الانضمام، إشعاراتك المقروءة، سجلات رفع المحتوى).
            </p>
            {user.role === "OWNER" && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                المالك: لا يمكن حذف حسابك إلا إذا كان هناك مالك آخر.
              </p>
            )}
          </div>
        </div>
        <Button
          variant="destructive"
          className="w-full"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="w-4 h-4 ml-2" />
          حذف حسابي نهائياً
        </Button>
      </Card>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              تأكيد حذف الحساب
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm">
              هل أنت متأكد من حذف حسابك؟ <strong>لا يمكن التراجع</strong> عن هذا الإجراء.
            </p>
            <p className="text-xs text-muted-foreground">
              للتأكيد، اكتب اسم التطبيق{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded">{t("common.appName")}</code>{" "}
              في الحقل أدناه:
            </p>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={t("common.appName")}
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={deleting || deleteConfirm !== t("common.appName")}
            >
              {deleting ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Trash2 className="w-4 h-4 ml-1" />}
              حذف نهائي
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* fix M-6 (round 4): internal version string removed for production —
          same tagline as the login footer for consistency. */}
      <p className="text-xs text-center text-muted-foreground">
        طالب | Talib — رفيقك الأكاديمي
      </p>
    </div>
  );
}

function InfoRow({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-3 p-3">
      <div className="w-9 h-9 rounded-xl bg-muted text-muted-foreground flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-sm font-bold truncate ${highlight ? "text-amber-600 dark:text-amber-400" : ""}`}>
          {value || "—"}
        </p>
      </div>
    </div>
  );
}

// =====================================================
// Report an Issue (الإبلاغ عن مشكلة) — round 11, review §14.
// The reporting system existed (POST /api/issues accepts every logged-in
// user) but its only entry points were tiny flag icons inside course and
// assignment cards — easy to miss, invisible for anything that is not a
// course/assignment (files, schedule, exams…). A clear, always-available
// entry now lives on the حسابي screen FOR EVERY ROLE including the regular
// STUDENT, with the four designed report types (the reportIssue i18n keys
// existed since round 1 but were never wired to any UI) and an explicit
// «إرسال التبليغ» submit button with loading/disabled states.
// =====================================================
function ReportIssueDialog() {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const types = [
    { value: "broken_file", label: t("reportIssue.typeBrokenFile") },
    { value: "schedule_error", label: t("reportIssue.typeScheduleError") },
    { value: "exam_error", label: t("reportIssue.typeExamError") },
    { value: "other", label: t("reportIssue.typeOther") },
  ];
  const typeLabel = types.find((tp) => tp.value === type)?.label ?? "";

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) { setType(""); setSubject(""); setDescription(""); }
  }

  async function handleSubmit() {
    if (!type) { toast.error("اختر نوع المشكلة"); return; }
    if (!description.trim()) { toast.error("اكتب وصف المشكلة"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/issues", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemType: typeLabel,
          itemTitle: subject.trim() || typeLabel,
          description: description.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشل الإرسال"); return; }
      toast.success(t("reportIssue.submitted"));
      handleOpenChange(false);
    } catch {
      toast.error("فشل الاتصال — أعد المحاولة");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          <span className="flex items-center">
            <Flag className="w-4 h-4 ml-2 text-amber-600" />
            {t("reportIssue.title")}
          </span>
          <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="w-5 h-5 text-amber-600" />
            {t("reportIssue.title")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="issueType">نوع المشكلة</Label>
            <select
              id="issueType"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="">— اختر —</option>
              {types.map((tp) => (
                <option key={tp.value} value={tp.value}>{tp.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="issueSubject">الموضوع (اختياري)</Label>
            <Input
              id="issueSubject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="مثال: ملخص المحاضرة الثالثة لا يفتح"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="issueDescription">{t("reportIssue.description")}</Label>
            <Textarea
              id="issueDescription"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="اشرح المشكلة بالتفصيل..."
              rows={3}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            يصل تبليغك إلى المشرفين المسؤولين عن نطاقك مباشرة، وستجدون الحالة في
            لوحة الإشراف تحت «التبليغات».
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={saving || !type || !description.trim()}>
            {saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}
            {t("reportIssue.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
