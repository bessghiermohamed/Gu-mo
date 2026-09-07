"use client";

/**
 * Announcement compose dialogs — round 52.
 *
 * ONE shared form for BOTH entry points (announcements screen + the admin
 * panel's new «الإعلانات» tab): العنوان → المحتوى → الأهمية → النطاق.
 *
 * The scope selector is the owner's «لا يوجد نطاق للإعلانات» fix: an
 * announcement can now target
 *   • «تخصص كامل»  — every student of the specialty (the old behaviour)
 *   • «سنة دراسية» — one academic year (targetGroups = year id)
 *   • «فوج»        — one cohort (targetGroups = cohort id)
 * The API validates the target against the caller's specialty and the
 * notification fan-out respects the scope, so a cohort announcement never
 * spams the whole specialty.
 */

import * as React from "react";
import { Loader2, Megaphone, Pencil, Plus, Users, CalendarRange } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/components/talib/auth-provider";
import { toast } from "sonner";

export interface AnnouncementRowData {
  id: number;
  title: string;
  content: string;
  urgency: string;
  visibilityScope?: string;
  targetGroups?: string;
}

interface YearOption {
  id: number;
  yearName: string;
}

interface CohortOption {
  id: number;
  groupName: string;
  subGroup?: string;
  academicYearId?: number;
}

const SCOPE_LEVELS = [
  { k: "تخصص كامل", label: "التخصص كامل", icon: Megaphone },
  { k: "سنة دراسية", label: "سنة دراسية", icon: CalendarRange },
  { k: "فوج", label: "فوج محدد", icon: Users },
] as const;

type ScopeLevel = (typeof SCOPE_LEVELS)[number]["k"];

// ---------------------------------------------------------------
// Shared scope field: three toggle buttons + a dependent picker.
// Years load once per open; cohorts load when «فوج» is chosen.
// ---------------------------------------------------------------
function ScopeField({
  scopeLevel, setScopeLevel, scopeTargetId, setScopeTargetId,
}: {
  scopeLevel: ScopeLevel;
  setScopeLevel: (v: ScopeLevel) => void;
  scopeTargetId: number | null;
  setScopeTargetId: (v: number | null) => void;
}) {
  const { user } = useAuth();
  const [years, setYears] = React.useState<YearOption[]>([]);
  const [cohorts, setCohorts] = React.useState<CohortOption[]>([]);
  const [loadingCohorts, setLoadingCohorts] = React.useState(false);

  React.useEffect(() => {
    if (scopeLevel !== "سنة دراسية" || years.length > 0) return;
    fetch(`/api/years?specialtyId=${user?.assignedSpecialtyId ?? ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setYears(d.years ?? []))
      .catch(() => setYears([]));
  }, [scopeLevel, years.length, user?.assignedSpecialtyId]);

  React.useEffect(() => {
    if (scopeLevel !== "فوج") return;
    // async start — avoids the sync setState-in-effect lint error
    const t = setTimeout(() => setLoadingCohorts(true), 0);
    fetch(`/api/cohort?specialtyId=${user?.assignedSpecialtyId ?? ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setCohorts(d.cohorts ?? []))
      .catch(() => setCohorts([]))
      .finally(() => setLoadingCohorts(false));
    return () => clearTimeout(t);
  }, [scopeLevel, user?.assignedSpecialtyId]);

  return (
    <div className="space-y-1.5">
      <Label>نطاق الظهور</Label>
      <div className="grid grid-cols-3 gap-2">
        {SCOPE_LEVELS.map((o) => (
          <button
            key={o.k} type="button"
            onClick={() => { setScopeLevel(o.k); setScopeTargetId(null); }}
            className={`py-2 rounded-lg text-xs font-bold border-2 flex flex-col items-center gap-1 ${
              scopeLevel === o.k ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"
            }`}
          >
            <o.icon className="w-3.5 h-3.5" />
            {o.label}
          </button>
        ))}
      </div>
      {scopeLevel === "سنة دراسية" && (
        <select
          value={scopeTargetId ?? ""} 
          onChange={(e) => setScopeTargetId(e.target.value ? Number(e.target.value) : null)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
          aria-label="السنة الدراسية المستهدفة"
        >
          <option value="">اختر السنة…</option>
          {years.map((y) => (
            <option key={y.id} value={y.id}>{y.yearName}</option>
          ))}
        </select>
      )}
      {scopeLevel === "فوج" && (
        loadingCohorts ? (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 py-1">
            <Loader2 className="w-3 h-3 animate-spin" />جارٍ تحميل الأفواج…
          </p>
        ) : (
          <select
            value={scopeTargetId ?? ""}
            onChange={(e) => setScopeTargetId(e.target.value ? Number(e.target.value) : null)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            aria-label="الفوج المستهدف"
          >
            <option value="">اختر الفوج…</option>
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.groupName}{c.subGroup ? ` — ${c.subGroup}` : ""}
              </option>
            ))}
          </select>
        )
      )}
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        {scopeLevel === "تخصص كامل" && "يظهر الإعلان لكل طلبة التخصص ويصلكم إشعار به."}
        {scopeLevel === "سنة دراسية" && "يظهر لطلبة هذه السنة فقط (ومن انضم إلى أفواجها) مع إشعار خاص بهم."}
        {scopeLevel === "فوج" && "يظهر لأعضاء هذا الفوج فقط مع إشعار خاص بهم."}
      </p>
    </div>
  );
}

function UrgencyField({ urgency, setUrgency }: { urgency: string; setUrgency: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>الأهمية</Label>
      <div className="grid grid-cols-3 gap-2">
        {[{ k: "عام", l: "عام" }, { k: "هام", l: "هام" }, { k: "عاجل", l: "عاجل" }].map((o) => (
          <button key={o.k} type="button" onClick={() => setUrgency(o.k)}
            className={`py-2 rounded-lg text-xs font-bold border-2 ${urgency === o.k ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"}`}>
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// CREATE — trigger button + the full form
// ---------------------------------------------------------------
export function AddAnnouncementDialog({
  onCreated, triggerLabel = "إعلان",
}: {
  onCreated: () => void;
  triggerLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [urgency, setUrgency] = React.useState("عام");
  const [scopeLevel, setScopeLevel] = React.useState<ScopeLevel>("تخصص كامل");
  const [scopeTargetId, setScopeTargetId] = React.useState<number | null>(null);
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    if (!title.trim() || !content.trim()) { toast.error("العنوان والمحتوى مطلوبان"); return; }
    if (scopeLevel !== "تخصص كامل" && !scopeTargetId) {
      toast.error(scopeLevel === "فوج" ? "اختر الفوج المستهدف" : "اختر السنة الدراسية");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/announcements", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(), content: content.trim(), urgency,
          scopeLevel, scopeTargetId,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشل النشر"); return; }
      toast.success(scopeLevel === "تخصص كامل" ? "تم نشر الإعلان" : "تم نشر الإعلان للنطاق المحدد");
      setOpen(false); setTitle(""); setContent(""); setUrgency("عام");
      setScopeLevel("تخصص كامل"); setScopeTargetId(null);
      onCreated();
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="w-4 h-4 ml-1" />{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>نشر إعلان جديد</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="annTitle">العنوان</Label>
            <Input id="annTitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: تأجيل محاضرة الأدب الجاهلي" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="annContent">المحتوى</Label>
            <Textarea id="annContent" value={content} onChange={(e) => setContent(e.target.value)} placeholder="اكتب تفاصيل الإعلان هنا..." rows={4} />
          </div>
          <UrgencyField urgency={urgency} setUrgency={setUrgency} />
          <ScopeField
            scopeLevel={scopeLevel} setScopeLevel={setScopeLevel}
            scopeTargetId={scopeTargetId} setScopeTargetId={setScopeTargetId}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}نشر</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------
// EDIT — title / content / urgency / scope
// ---------------------------------------------------------------
export function EditAnnouncementDialog({
  announcement, onClose, onSaved,
}: {
  announcement: AnnouncementRowData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = React.useState(announcement.title);
  const [content, setContent] = React.useState(announcement.content);
  const [urgency, setUrgency] = React.useState(announcement.urgency);
  const [scopeLevel, setScopeLevel] = React.useState<ScopeLevel>(
    (announcement.visibilityScope as ScopeLevel) ?? "تخصص كامل"
  );
  const [scopeTargetId, setScopeTargetId] = React.useState<number | null>(() => {
    const t = Number(announcement.targetGroups);
    return announcement.visibilityScope && announcement.visibilityScope !== "تخصص كامل" && Number.isFinite(t)
      ? t
      : null;
  });
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    if (!title.trim() || !content.trim()) { toast.error("العنوان والمحتوى مطلوبان"); return; }
    if (scopeLevel !== "تخصص كامل" && !scopeTargetId) {
      toast.error(scopeLevel === "فوج" ? "اختر الفوج المستهدف" : "اختر السنة الدراسية");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/announcements", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: announcement.id, title: title.trim(), content: content.trim(), urgency,
          scopeLevel, scopeTargetId,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشل الحفظ"); return; }
      toast.success("تم تعديل الإعلان");
      onSaved();
    } catch { toast.error("فشل الاتصال"); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="w-5 h-5" />تعديل الإعلان</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="editAnnTitle">العنوان</Label>
            <Input id="editAnnTitle" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="editAnnContent">المحتوى</Label>
            <Textarea id="editAnnContent" value={content} onChange={(e) => setContent(e.target.value)} rows={4} />
          </div>
          <UrgencyField urgency={urgency} setUrgency={setUrgency} />
          <ScopeField
            scopeLevel={scopeLevel} setScopeLevel={setScopeLevel}
            scopeTargetId={scopeTargetId} setScopeTargetId={setScopeTargetId}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حفظ التعديل</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
