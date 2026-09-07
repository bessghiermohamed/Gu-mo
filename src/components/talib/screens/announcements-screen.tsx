"use client";

import * as React from "react";
import { Megaphone, AlertCircle, Info, Calendar, Loader2, Pencil, Trash2, Target } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { canManageRoles } from "@/lib/auth/permissions";
import {
  AddAnnouncementDialog, EditAnnouncementDialog, type AnnouncementRowData,
} from "@/components/talib/announcements-compose";
import { toast } from "sonner";

// fix ج: announcements screen had NO way to create announcements.
// Now supervisors (with scope) get a "+" button + form.
// round 52: النافذتان (إضافة/تعديل) صارتا مكوّناً مشتركاً
// announcements-compose.tsx مع منتقي النطاق — والبطاقة تعرض شارة النطاق.

interface Announcement extends AnnouncementRowData {
  author: string;
  date: string;
  specialtyId: number | null;
  scopeLabel?: string;
}

// r50 (design review): the announcement date rendered raw ISO ("2026-09-07")
// while exams/assignments format via ar-DZ — same helper, same locale.
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ar-DZ", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
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
      const list: Announcement[] = data.announcements ?? [];
      setAnnouncements(list);
      // fix (R12): opening the screen now MARKS the visible announcements as
      // read — the bell badge used to count the same announcements forever
      // because notification_read_states was never written.
      if (list.length > 0) {
        fetch("/api/announcements/mark-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: list.map((a) => a.id) }),
        })
          .then(() => window.dispatchEvent(new Event("talib-ann-read")))
          .catch(() => {});
      }
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
          <h1 className="text-2xl font-black">{t("announcements.title")}</h1>
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
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge className={`${cfg.color} text-white gap-1`}>
                      {cfg.icon}
                      {cfg.label}
                    </Badge>
                    {/* round 52 — شارة النطاق: التخصص/السنة/الفوج المستهدف */}
                    {ann.visibilityScope && ann.visibilityScope !== "تخصص كامل" && (
                      <Badge variant="outline" className="gap-1 text-[10px] text-primary border-primary/30">
                        <Target className="w-3 h-3" />
                        {ann.scopeLabel ?? "نطاق محدد"}
                      </Badge>
                    )}
                  </div>
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
                      {formatDate(ann.date)}
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
