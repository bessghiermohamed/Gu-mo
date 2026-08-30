"use client";

import * as React from "react";
import { FlaskConical, Calendar, Clock, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useI18n } from "@/components/talib/i18n-provider";

export function TalibExamsScreen() {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black mb-1">{t("exams.title")}</h1>
        <p className="text-sm text-muted-foreground">
          مواعيد الاختبارات والامتحانات القادمة
        </p>
      </div>

      <Tabs defaultValue="upcoming">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upcoming">{t("exams.upcoming")}</TabsTrigger>
          <TabsTrigger value="finished">{t("exams.finished")}</TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming" className="mt-4">
          <ExamsList finished={false} />
        </TabsContent>
        <TabsContent value="finished" className="mt-4">
          <ExamsList finished={true} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ExamsList({ finished }: { finished: boolean }) {
  const { t } = useI18n();

  return (
    <Card className="p-8 text-center bg-muted/30 border-dashed">
      <FlaskConical className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
      <h3 className="font-bold text-sm mb-1">{t("exams.noExams")}</h3>
      <p className="text-xs text-muted-foreground">
        ستظهر مواعيد الاختبارات هنا عند نشرها من طرف الإدارة.
      </p>
    </Card>
  );
}
