"use client";

import * as React from "react";
import {
  Mail, IdCard, Building, BookOpen, Users, Shield, LogOut,
  ChevronLeft, Trash2, AlertTriangle, Loader2, UserPlus, Layers,
  Calendar, FolderTree, Flag, Settings, Route, Megaphone,
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
import { useShell } from "@/app/app/page";
import { abbreviateOrgName } from "@/lib/abbreviate";
import { toast } from "sonner";

interface Props {
  onSignOut: () => void;
}

export function TalibProfileScreen({ onSignOut }: Props) {
  const { t } = useI18n();
  const { user, refresh } = useAuth();
  const { navigate, startPathChange } = useShell();

  // round 38: sync the session ONCE when حسابي opens. Acceptance into a
  // cohort (and role changes) happen on the reviewer's side; without this
  // the student kept seeing «بلا فوج» and the «تصفح المجموعات والأفواج»
  // button below even after the الفوج cell (fed by the fresh details API)
  // already showed the new cohort. The ref guard keeps this effect from
  // re-running when refresh() itself updates the user object.
  const syncedOnceRef = React.useRef(false);
  React.useEffect(() => {
    if (!user || syncedOnceRef.current) return;
    syncedOnceRef.current = true;
    refresh();
  }, [user, refresh]);

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

  const initials = user.fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join(" ");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">{t("nav.profile")}</h1>
      </div>

      {/* ═══ بطاقة الهوية ═══
          round 48 (ui-ux-pro-max): الترويسة تصبح اللحظة الملونة للشاشة —
          تدرج على primary مع طبقتي إضاءة محايدتين (يعمل مع مبدّل الألوان
          وفي الوضعين الفاتح/الداكن)، الصورة الرمزية بالأحرف الأولى زجاجية،
          والبريد ودور المستخدم فوق خلفية داكنة شفافة. البطاقة المعلوماتية
          أدناه تبقى بيضاء كالسجّل الأكاديمي. */}
      <Card className="relative overflow-hidden p-0 border-0 bg-primary text-primary-foreground shadow-md">
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-tr from-black/25 via-transparent to-white/15" />
        <IdCard
          aria-hidden="true"
          className="absolute -bottom-8 -left-6 w-36 h-36 text-white/10 -rotate-12 pointer-events-none"
        />
        <div className="relative p-5 flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm text-white flex items-center justify-center shrink-0 select-none border border-white/25"
            aria-hidden="true"
          >
            <span className="text-2xl font-black leading-none">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-lg truncate">{user.fullName}</h2>
            <p className="text-xs text-primary-foreground/80 truncate mt-0.5" dir="ltr">
              {user.email}
            </p>
            <Badge className="mt-1.5 bg-white/20 text-white border border-white/25">
              <Shield className="w-3 h-3 ml-1" />
              {roleLabel}
            </Badge>
          </div>
        </div>
      </Card>

      {/* ═══ السجل الأكاديمي ═══
          round 48: بدل خلايا محشوة داخل صناديق داخل بطاقة (تعشيب مزدوج)،
          شبكة منفصلة بخطوط تقسيم رفيعة + skeleton يحجز المكان أثناء جلب
          التفاصيل (كانت تظهر «—» ثم تقفز للقيم). نفس الخلايا السبع، نفس
          اختصار المؤسسة وتلميحها، ونفس تمييز «بلا فوج». */}
      <Card className="p-0 overflow-hidden" aria-label="السجل الأكاديمي">
        <div className="grid grid-cols-2">
          {/* خطوط التقسيم تُحسب في الأب: خط عمودي على الخلايا اليمنى
              (الفردية، بادئاً من اليمين في RTL)، وخط أفقي من الصف الثاني. */}
          <InfoCell loading={profileDetails === null} borderLeft borderTop={false} icon={<IdCard className="w-3 h-3" />} label="الرقم التسلسلي" value={user.studentId} />
          <InfoCell
            loading={profileDetails === null}
            borderLeft={false}
            borderTop={false}
            icon={<Building className="w-3 h-3" />}
            label="المؤسسة"
            value={profileDetails?.institution ? abbreviateOrgName(profileDetails.institution) : ""}
            fullValue={profileDetails?.institution ?? ""}
          />
          <InfoCell loading={profileDetails === null} borderLeft borderTop icon={<BookOpen className="w-3 h-3" />} label="التخصص" value={profileDetails?.specialtyName ?? ""} />
          <InfoCell loading={profileDetails === null} borderLeft={false} borderTop icon={<Layers className="w-3 h-3" />} label="الملمح" value={profileDetails?.trackName ?? ""} />
          <InfoCell loading={profileDetails === null} borderLeft borderTop icon={<Calendar className="w-3 h-3" />} label="السنة" value={profileDetails?.yearName ?? ""} />
          <InfoCell loading={profileDetails === null} borderLeft={false} borderTop icon={<FolderTree className="w-3 h-3" />} label="المجموعة" value={profileDetails?.groupName ?? ""} />
          <InfoCell
            loading={profileDetails === null}
            borderLeft={false}
            borderTop
            icon={<Users className="w-3 h-3" />}
            label="الفوج"
            value={cohortDisplay}
            highlight={cohortDisplay.startsWith("بلا فوج")}
            wide
          />
        </div>
      </Card>

      {/* ═══ قائمة الإجراءات ═══
          round 48: الأزرار المتباعدة تُستبدل بقائمة واحدة مقسومة بخطوط
          (نمط إعدادات النظام) — أهدأ بصرياً، أهداف لمس ≥ 52px، أيقونة داخل
          رقاقة ملونة موحّدة، وتسجيل الخروج صف أحمر مميز داخل نفس القائمة. */}
      <Card className="p-0 overflow-hidden">
        <div className="divide-y divide-border">
          {user.scopeCohortGroupId == null && (
            <ActionRow
              icon={<UserPlus className="w-4 h-4" />}
              tint="bg-primary/10 text-primary"
              label="تصفح المجموعات والأفواج"
              onClick={() => navigate("BROWSE_GROUPS")}
            />
          )}

          <ActionRow
            icon={<Megaphone className="w-4 h-4" />}
            tint="bg-primary/10 text-primary"
            label="الإعلانات"
            onClick={() => navigate("ANNOUNCEMENTS")}
          />

          {/* round 11 (review §14): التبليغ كان محتجزاً خلف أيقونات علم صغيرة
              في شاشتي المقررات والواجبات — بلا مدخل واضح. الآن لكل مستخدم —
              ومن بينهم الطالب العادي — زر «الإبلاغ عن مشكلة» واضح هنا، مع زر
              «إرسال التبليغ» الظاهر دائماً. */}
          <ReportIssueRow />

          {/* round 37: تغيير المسار الأكاديمي — OWNER-only. The owner asked
              that path switching stay a platform-owner power (a student must
              not move themselves between specialties/groups); round 36 had it
              for every role. Hidden for all other roles, and the shell +
              /api/onboarding/complete enforce the same rule (defense in
              depth). */}
          {user.role === "OWNER" && (
            <ActionRow
              icon={<Route className="w-4 h-4" />}
              tint="bg-primary/10 text-primary"
              label="تغيير المسار الأكاديمي"
              onClick={startPathChange}
            />
          )}

          <ActionRow
            icon={<Settings className="w-4 h-4" />}
            tint="bg-primary/10 text-primary"
            label="الإعدادات"
            onClick={() => navigate("SETTINGS")}
          />

          <ActionRow
            icon={<LogOut className="w-4 h-4" />}
            tint="bg-destructive/10 text-destructive"
            label="تسجيل الخروج"
            labelClassName="text-destructive"
            onClick={onSignOut}
          />
        </div>
      </Card>

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

/** خلية سجل أكاديمي — حدود داخلية رفيعة بدل صندوق داخل صندوق،
 *  مع skeleton أثناء التحميل (مكان محجوز، بلا قفز قيم). */
function InfoCell({
  icon,
  label,
  value,
  highlight,
  wide,
  fullValue,
  loading,
  borderLeft,
  borderTop,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
  wide?: boolean;
  /** round 37: optional un-abbreviated value used for the title tooltip. */
  fullValue?: string;
  loading?: boolean;
  borderLeft?: boolean;
  borderTop?: boolean;
}) {
  return (
    <div
      className={`px-3.5 py-2.5 min-w-0 border-border ${wide ? "col-span-2" : ""} ${borderLeft ? "border-l" : ""} ${borderTop ? "border-t" : ""}`}
    >
      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </p>
      {loading ? (
        <div className="h-3.5 w-3/4 rounded bg-muted animate-pulse mt-1.5" aria-hidden="true" />
      ) : (
        <p
          title={fullValue ?? value}
          className={`text-[13px] font-bold truncate mt-0.5 ${highlight ? "text-amber-600 dark:text-amber-400" : ""}`}
        >
          {value || "—"}
        </p>
      )}
    </div>
  );
}

/** صف إجراء بنمط قائمة الإعدادات — هدف لمس مريح، تمرير خلفية فقط
 *  (بلا إزاحة تخطيط)، وحلقة تركيز داخلية. */
function ActionRow({
  icon,
  tint,
  label,
  onClick,
  labelClassName,
}: {
  icon: React.ReactNode;
  tint: string;
  label: string;
  onClick: () => void;
  labelClassName?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3.5 py-3 min-h-[52px] text-right cursor-pointer transition-colors duration-200 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tint}`}>
        {icon}
      </span>
      <span className={`flex-1 min-w-0 text-sm font-bold truncate ${labelClassName ?? ""}`}>
        {label}
      </span>
      <ChevronLeft className="w-4 h-4 text-muted-foreground/40 shrink-0" />
    </button>
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
// round 48: the trigger becomes a row of the unified actions list.
// =====================================================
function ReportIssueRow() {
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
        <button className="w-full flex items-center gap-3 px-3.5 py-3 min-h-[52px] text-right cursor-pointer transition-colors duration-200 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Flag className="w-4 h-4" />
          </span>
          <span className="flex-1 min-w-0 text-sm font-bold truncate">
            {t("reportIssue.title")}
          </span>
          <ChevronLeft className="w-4 h-4 text-muted-foreground/40 shrink-0" />
        </button>
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
