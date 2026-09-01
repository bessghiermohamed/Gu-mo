"use client";

import * as React from "react";
import { Megaphone, AlertCircle, Info, Calendar, Plus, Loader2, Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { canManageRoles } from "@/lib/auth/permissions";
import { toast } from "sonner";

// fix ج: announcements screen had NO way to create announcements.
// Now supervisors (with scope) get a floating "+" button + form.

interface Announcement {
  id: number;
  title: string;
  content: string;
  author: string;
  date: string;
  urgency: string;
  specialtyId: number | null;
}

// round 5: mirrors the server-side eligibility rule in /api/announcements —
// OWNER: any / SPECIALTY_ADMIN: own specialty / REPRESENTATIVE: own authorship.
function canManageAnnouncement(user: { role: string; assignedSpecialtyId: number; fullName: string } | null, ann: Announcement): boolean {
  if (!user) return false;
  if (user.role === "OWNER") return true;
  if (ann.specialtyId !== user.assignedSpecialtyId) return false;
  if (user.role === "SPECIALTY_ADMIN") return true;
  if (user.role === "REPRESENTATIVE") return ann.author === user.fullName;
  return false;
}

export function TalibAnnouncementsScreen() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [announcements, setAnnouncements] = React.useState<Announcement[]>([]);
  const [loading, setLoading] = React.useState(true);
  const canPublish = canManageRoles(user ?? null);
  // round 5: edit + delete state (previously a published mistake was permanent)
  const [editAnn, setEditAnn] = React.useState<Announcement | null>(null);
  const [annToDelete, setAnnToDelete] = React.useState<Announcement | null>(null);
  const [deletingAnn, setDeletingAnn] = React.useState(false);

  const fetchAnnouncements = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/announcements", { cache: "no-store" });
      const data = await res.json();
      setAnnouncements(data.announcements ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  React.useEffect(() => { fetchAnnouncements(); }, [fetchAnnouncements]);

  const urgencyConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    "عاجل": { label: t("announcements.urgencyUrgent"), color: "bg-red-500", icon: <AlertCircle className="w-3 h-3" /> },
    "هام": { label: t("announcements.urgencyImportant"), color: "bg-amber-500", icon: <Info className="w-3 h-3" /> },
    "عام": { label: t("announcements.urgencyNormal"), color: "bg-primary", icon: <Megaphone className="w-3 h-3" /> },
  };

  async function handleDelete() {
    if (!annToDelete) return;
    setDeletingAnn(true);
    try {
      const res = await fetch(`/api/announcements?id=${annToDelete.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تم حذف الإعلان");
      setAnnToDelete(null);
      fetchAnnouncements();
    } catch { toast.error("فشل الحذف"); }
    finally { setDeletingAnn(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black mb-1">{t("announcements.title")}</h1>
          <p className="text-sm text-muted-foreground">
            تنبيهات وإعلانات الفوج والتخصص
          </p>
        </div>
        {canPublish && <AddAnnouncementDialog onCreated={fetchAnnouncements} />}
      </div>

      {editAnn && (
        <EditAnnouncementDialog
          announcement={editAnn}
          onClose={() => setEditAnn(null)}
          onSaved={() => { setEditAnn(null); fetchAnnouncements(); }}
        />
      )}

      {annToDelete && (
        <Dialog open onOpenChange={() => setAnnToDelete(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="text-destructive flex items-center gap-2"><Trash2 className="w-5 h-5" />حذف إعلان</DialogTitle></DialogHeader>
            <p className="text-sm">هل تريد حذف إعلان <strong>{annToDelete.title}</strong>؟ لا يمكن التراجع.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAnnToDelete(null)}>إلغاء</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deletingAnn}>{deletingAnn && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حذف نهائي</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {loading ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        </Card>
      ) : announcements.length === 0 ? (
        <Card className="p-8 text-center bg-muted/30 border-dashed">
          <Megaphone className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-bold text-sm mb-1">{t("announcements.noAnnouncements")}</h3>
          <p className="text-xs text-muted-foreground">
            {canPublish
              ? "لا توجد إعلانات بعد — أضف أول إعلان بزر «إعلان»."
              : "ستظهر الإعلانات الجديدة هنا عند نشرها من طرف الممثل أو الإدارة."}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {announcements.map((ann) => {
            const cfg = urgencyConfig[ann.urgency] ?? urgencyConfig["عام"];
            const manage = canManageAnnouncement(user ?? null, ann);
            return (
              <Card key={ann.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge className={`${cfg.color} text-white gap-1`}>
                    {cfg.icon}
                    {cfg.label}
                  </Badge>
                  <div className="flex items-center gap-1">
                    {manage && (
                      <>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditAnn(ann)} aria-label="تعديل الإعلان">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10 h-8 w-8" onClick={() => setAnnToDelete(ann)} aria-label="حذف الإعلان">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {ann.date}
                    </span>
                  </div>
                </div>
                <h3 className="font-bold text-sm">{ann.title}</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {ann.content}
                </p>
                <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                  {t("announcements.author")}: {ann.author}
                </p>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddAnnouncementDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [urgency, setUrgency] = React.useState("عام");
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    if (!title.trim() || !content.trim()) { toast.error("العنوان والمحتوى مطلوبان"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/announcements", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), content: content.trim(), urgency }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشل النشر"); return; }
      toast.success("تم نشر الإعلان");
      setOpen(false); setTitle(""); setContent(""); setUrgency("عام");
      onCreated();
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="w-4 h-4 ml-1" />إعلان</Button>
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}نشر</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// round 5: edit an existing announcement (title / content / urgency).
// Only shown to users the server-side rule also allows.
function EditAnnouncementDialog({ announcement, onClose, onSaved }: {
  announcement: Announcement; onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = React.useState(announcement.title);
  const [content, setContent] = React.useState(announcement.content);
  const [urgency, setUrgency] = React.useState(announcement.urgency);
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    if (!title.trim() || !content.trim()) { toast.error("العنوان والمحتوى مطلوبان"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/announcements", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: announcement.id, title: title.trim(), content: content.trim(), urgency }),
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حفظ التعديل</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
