"use client";

import * as React from "react";
import { Megaphone, AlertCircle, Info, Calendar } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";

interface Announcement {
  id: number;
  title: string;
  content: string;
  author: string;
  date: string;
  urgency: string;
  specialtyId: number | null;
}

export function TalibAnnouncementsScreen() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [announcements, setAnnouncements] = React.useState<Announcement[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetch("/api/announcements", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        setAnnouncements(data.announcements ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const urgencyConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    "عاجل": { label: t("announcements.urgencyUrgent"), color: "bg-red-500", icon: <AlertCircle className="w-3 h-3" /> },
    "هام": { label: t("announcements.urgencyImportant"), color: "bg-amber-500", icon: <Info className="w-3 h-3" /> },
    "عام": { label: t("announcements.urgencyNormal"), color: "bg-primary", icon: <Megaphone className="w-3 h-3" /> },
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black mb-1">{t("announcements.title")}</h1>
        <p className="text-sm text-muted-foreground">
          تنبيهات وإعلانات الفوج والتخصص
        </p>
      </div>

      {loading ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        </Card>
      ) : announcements.length === 0 ? (
        <Card className="p-8 text-center bg-muted/30 border-dashed">
          <Megaphone className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-bold text-sm mb-1">{t("announcements.noAnnouncements")}</h3>
          <p className="text-xs text-muted-foreground">
            ستظهر الإعلانات الجديدة هنا عند نشرها من طرف الممثل أو الإدارة.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {announcements.map((ann) => {
            const cfg = urgencyConfig[ann.urgency] ?? urgencyConfig["عام"];
            return (
              <Card key={ann.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge className={`${cfg.color} text-white gap-1`}>
                    {cfg.icon}
                    {cfg.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {ann.date}
                  </span>
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
