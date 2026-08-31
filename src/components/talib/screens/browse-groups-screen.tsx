"use client";

import * as React from "react";
import {
  FolderTree, Users, Loader2, Send, CheckCircle2, Clock, XCircle, AlertCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { toast } from "sonner";

interface StudyGroup {
  id: number;
  specialtyId: number;
  academicYearId: number;
  trackId: number | null;
  groupName: string;
  description: string;
}

interface Cohort {
  id: number;
  specialtyId: number;
  academicYearId: number;
  trackId: number | null;
  groupId: number | null;
  groupName: string;
  subGroup: string;
}

interface MyRequest {
  id: number;
  cohortId: number;
  status: "pending" | "approved" | "rejected";
  cohortName: string;
}

export function TalibBrowseGroupsScreen() {
  const { t } = useI18n();
  const { user } = useAuth();

  const [groups, setGroups] = React.useState<StudyGroup[]>([]);
  const [cohorts, setCohorts] = React.useState<Record<number, Cohort[]>>({});
  const [myRequests, setMyRequests] = React.useState<MyRequest[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [requestCohort, setRequestCohort] = React.useState<Cohort | null>(null);
  const [requestMessage, setRequestMessage] = React.useState("");
  const [sending, setSending] = React.useState(false);

  React.useEffect(() => {
    if (!user) return;
    // fix أ.4: only show groups/cohorts of the student's OWN year (+track)
    // (was fetching ALL groups of the specialty — a year-5 student saw year-1 cohorts)
    const yearParam = user.scopeAcademicYearId ? `&academicYearId=${user.scopeAcademicYearId}` : "";
    const trackParam = user.scopeTrackId ? `&trackId=${user.scopeTrackId}` : "";
    Promise.all([
      fetch(`/api/groups?specialtyId=${user.assignedSpecialtyId}${yearParam}${trackParam}`, { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/join-requests/mine", { cache: "no-store" }).then((r) => r.json()),
    ]).then(([groupsData, requestsData]) => {
      setGroups(groupsData.groups ?? []);
      setMyRequests(requestsData.requests ?? []);
      setLoading(false);
      const groupIds = (groupsData.groups ?? []).map((g: StudyGroup) => g.id);
      Promise.all(groupIds.map((gid: number) => fetch(`/api/groups/${gid}/cohorts`, { cache: "no-store" }).then((r) => r.json()))).then((results) => {
        const cohortMap: Record<number, Cohort[]> = {};
        groupIds.forEach((gid: number, i: number) => { cohortMap[gid] = results[i].cohorts ?? []; });
        setCohorts(cohortMap);
      });
    }).catch(() => setLoading(false));
  }, [user]);

  function isRequested(cohortId: number): MyRequest | undefined {
    return myRequests.find((r) => r.cohortId === cohortId);
  }

  async function handleSendRequest() {
    if (!requestCohort || !user) return;
    setSending(true);
    try {
      const res = await fetch("/api/join-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cohortId: requestCohort.id, groupId: requestCohort.groupId, message: requestMessage.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشل إرسال الطلب"); return; }
      toast.success("تم إرسال طلب الانضمام ✅ — بانتظار موافقة الممثل");
      setMyRequests((prev) => [...prev, { id: data.request?.id ?? Date.now(), cohortId: requestCohort.id, status: "pending", cohortName: requestCohort.groupName }]);
      setRequestCohort(null); setRequestMessage("");
    } finally { setSending(false); }
  }

  if (loading) {
    return (
      <Card className="p-8 text-center">
        <Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black mb-1">تصفح المجموعات والأفواج</h1>
        <p className="text-sm text-muted-foreground">اختر فوجاً وأرسل طلب انضمام — سيتلقاه ممثل الفوج للموافقة</p>
      </div>

      {myRequests.length > 0 && (
        <Card className="p-4 bg-primary/5 border-primary/20">
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />طلباتي ({myRequests.length})
          </h3>
          <div className="space-y-2">
            {myRequests.map((req) => (
              <div key={req.id} className="flex items-center justify-between p-2 rounded-lg bg-background">
                <span className="text-sm font-medium">{req.cohortName}</span>
                <StatusBadge status={req.status} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {groups.length === 0 ? (
        <Card className="p-8 text-center bg-muted/30 border-dashed">
          <FolderTree className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-bold text-sm mb-1">لا توجد مجموعات متاحة</h3>
          <p className="text-xs text-muted-foreground">تواصل مع الإدارة لإنشاء مجموعات في نطاقك.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const groupCohorts = cohorts[group.id] ?? [];
            return (
              <Card key={group.id} className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <FolderTree className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm">{group.groupName}</h3>
                    {group.description && <p className="text-xs text-muted-foreground mt-0.5">{group.description}</p>}
                  </div>
                  <Badge variant="outline" className="text-[10px]">{groupCohorts.length} أفواج</Badge>
                </div>
                {groupCohorts.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">لا توجد أفواج في هذه المجموعة بعد</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {groupCohorts.map((cohort) => {
                      const existingReq = isRequested(cohort.id);
                      return (
                        <button
                          key={cohort.id}
                          onClick={() => { if (existingReq?.status !== "pending") setRequestCohort(cohort); }}
                          disabled={existingReq?.status === "pending"}
                          className={`p-3 rounded-xl border-2 transition-all text-right ${
                            existingReq?.status === "pending" ? "border-amber-500/30 bg-amber-500/5 cursor-not-allowed"
                            : existingReq?.status === "approved" ? "border-emerald-500/30 bg-emerald-500/5 cursor-default"
                            : existingReq?.status === "rejected" ? "border-muted hover:border-primary/50"
                            : "border-border hover:border-primary/50"
                          }`}
                        >
                          <div className="font-bold text-sm flex items-center justify-between">
                            <span>{cohort.groupName}</span>
                            {existingReq && <StatusIcon status={existingReq.status} />}
                          </div>
                          {cohort.subGroup && <p className="text-[10px] text-muted-foreground mt-0.5">{cohort.subGroup}</p>}
                          {existingReq?.status === "pending" && <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">قيد المراجعة</p>}
                          {existingReq?.status === "approved" && <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">✓ تم القبول</p>}
                          {existingReq?.status === "rejected" && <p className="text-[10px] text-muted-foreground mt-1">يمكنك إعادة الطلب</p>}
                          {!existingReq && <p className="text-[10px] text-primary mt-1 flex items-center gap-1"><Send className="w-2.5 h-2.5" />إرسال طلب</p>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={requestCohort !== null} onOpenChange={(open) => { if (!open) { setRequestCohort(null); setRequestMessage(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>طلب الانضمام لـ {requestCohort?.groupName}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg bg-primary/5 p-3 text-xs">
              <p><strong>الفوج:</strong> {requestCohort?.groupName}</p>
              {requestCohort?.subGroup && <p className="text-muted-foreground mt-1">الفوج الفرعي: {requestCohort.subGroup}</p>}
            </div>
            <div className="space-y-1.5"><Label htmlFor="msg">رسالة (اختيارية)</Label><Textarea id="msg" value={requestMessage} onChange={(e) => setRequestMessage(e.target.value)} placeholder="مثال: أرغب بالانضمام لهذا الفوج لأنه يتناسب مع جدولي..." rows={3} /></div>
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <p>سيبقى طلبك بحالة "معلّق" حتى يوافق عليه ممثل الفوج. لن تنضم فوراً.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRequestCohort(null); setRequestMessage(""); }}>إلغاء</Button>
            <Button onClick={handleSendRequest} disabled={sending}>{sending ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Send className="w-4 h-4 ml-1" />}إرسال الطلب</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: MyRequest["status"] }) {
  if (status === "pending") return <Badge className="bg-amber-500 text-white text-[10px]"><Clock className="w-2.5 h-2.5 ml-1" />معلّق</Badge>;
  if (status === "approved") return <Badge className="bg-emerald-500 text-white text-[10px]"><CheckCircle2 className="w-2.5 h-2.5 ml-1" />مقبول</Badge>;
  if (status === "rejected") return <Badge variant="destructive" className="text-[10px]"><XCircle className="w-2.5 h-2.5 ml-1" />مرفوض</Badge>;
  return null;
}

function StatusIcon({ status }: { status: MyRequest["status"] }) {
  if (status === "pending") return <Clock className="w-3.5 h-3.5 text-amber-500" />;
  if (status === "approved") return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
  if (status === "rejected") return <XCircle className="w-3.5 h-3.5 text-muted-foreground" />;
  return null;
}
