"use client";

import * as React from "react";
import { Users, UserCheck, GraduationCap, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";

interface GroupMember {
  id: number;
  fullName: string;
  role: string;
  groupNumber: string;
}

export function TalibGroupScreen() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [members, setMembers] = React.useState<GroupMember[]>([]);
  const [loading, setLoading] = React.useState(true);

  const userGroup = user?.scopeCohortGroupId;
  const hasGroup = userGroup != null;

  React.useEffect(() => {
    if (!hasGroup) {
      setLoading(false);
      return;
    }
    fetch(`/api/group/members?cohortId=${userGroup}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        setMembers(data.members ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [userGroup, hasGroup]);

  const representative = members.find((m) => m.role === "REPRESENTATIVE");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black mb-1">{t("group.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {hasGroup ? "زملاء فوجك الدراسي" : "حالتك: بانتظار الإلحاق بفوج"}
        </p>
      </div>

      {!hasGroup ? (
        <Card className="p-5 bg-amber-500/10 border-amber-500/30">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-sm mb-1 text-amber-700 dark:text-amber-300">
                📌 أنت مسجل بحالة (بدون فوج)
              </h3>
              <p className="text-xs text-amber-700/80 dark:text-amber-300/80 leading-relaxed">
                سيتم إلحاقك بفوجك الدراسي من قِبل ممثل الدفعة أو مشرف التخصص عبر
                لوحة الإدارة. يمكنك تصفح محتوى تخصصك الكامل حتى يتم إلحاقك. لتسريع
                العملية، اذهب إلى «حسابي» → «تصفح المجموعات والأفواج» وأرسل طلب انضمام.
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <Card className="p-5 bg-primary/5 border-primary/20">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <Users className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h2 className="font-black text-base">فوجك الدراسي</h2>
                <p className="text-xs text-muted-foreground">
                  {members.length} {t("group.members")}
                </p>
              </div>
            </div>
          </Card>

          {representative && (
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-secondary/15 text-secondary flex items-center justify-center shrink-0">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] text-muted-foreground">ممثل الفوج</p>
                  <p className="font-bold text-sm">{representative.fullName}</p>
                </div>
                <Badge variant="secondary" className="text-[10px]">
                  {t(`roles.${representative.role}`)}
                </Badge>
              </div>
            </Card>
          )}

          <Card className="p-4">
            <h3 className="font-bold text-sm mb-3">{t("group.members")}</h3>
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-6">{t("common.loading")}</p>
            ) : members.length === 0 ? (
              <div className="text-center py-6">
                <GraduationCap className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-xs text-muted-foreground">{t("group.noMembers")}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0 text-xs font-bold">
                      {m.fullName.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{m.fullName}</p>
                      {m.role !== "STUDENT" && (
                        <Badge variant="secondary" className="text-[10px] mt-0.5">
                          {t(`roles.${m.role}`)}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
