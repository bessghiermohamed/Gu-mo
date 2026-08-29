"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { BookOpen, FlaskConical, Calculator, Calendar, CheckSquare, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useI18n } from "@/components/talib/i18n-provider";

export function TalibCoursesScreen() {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black mb-1">{t("courses.title")}</h1>
        <p className="text-sm text-muted-foreground">
          تصفّح مقرراتك حسب السنة والسداسي
        </p>
      </div>

      {/* Fix B.3: Semester sub-filter */}
      <Tabs defaultValue="s1">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="s1">{t("courses.semester1")}</TabsTrigger>
          <TabsTrigger value="s2">{t("courses.semester2")}</TabsTrigger>
        </TabsList>
        <TabsContent value="s1" className="mt-4">
          <CoursesList semester={1} />
        </TabsContent>
        <TabsContent value="s2" className="mt-4">
          <CoursesList semester={2} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CoursesList({ semester }: { semester: number }) {
  const { t } = useI18n();

  // Empty state (real data will be loaded via API based on student profile)
  return (
    <Card className="p-8 text-center bg-muted/30 border-dashed">
      <BookOpen className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
      <h3 className="font-bold text-sm mb-1">{t("courses.noCourses")}</h3>
      <p className="text-xs text-muted-foreground mb-4">
        سيتم تحميل مقرراتك تلقائياً بعد ربط ملفك بالتخصص والسنة.
      </p>
    </Card>
  );
}
