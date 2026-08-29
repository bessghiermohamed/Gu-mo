"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { CalendarDays, ImageIcon, Upload, Plus, Clock, MapPin, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { canManageSchedule } from "@/lib/auth/permissions";
import { toast } from "sonner";

const DAYS = [
  { key: "sun", label: "schedule.sunday" },
  { key: "mon", label: "schedule.monday" },
  { key: "tue", label: "schedule.tuesday" },
  { key: "wed", label: "schedule.wednesday" },
  { key: "thu", label: "schedule.thursday" },
];

export function TalibScheduleScreen() {
  const { t } = useI18n();
  const { user } = useAuth();
  const canManage = canManageSchedule(user ?? null);
  const [mode, setMode] = React.useState<"manual" | "image">("manual");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black mb-1">{t("schedule.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {mode === "manual"
            ? "أدخل حصصك يدوياً أو عدّلها"
            : "ارفع صورة جدولك الخاص"}
        </p>
      </div>

      {/* Fix B.4: Manual / Image mode toggle */}
      <Tabs
        value={mode}
        onValueChange={(v) => setMode(v as "manual" | "image")}
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="manual">
            <CalendarDays className="w-4 h-4 ml-2" />
            {t("schedule.modeManual")}
          </TabsTrigger>
          <TabsTrigger value="image">
            <ImageIcon className="w-4 h-4 ml-2" />
            {t("schedule.modeImage")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="manual" className="mt-4 space-y-4">
          <ManualSchedule canManage={canManage} />
        </TabsContent>
        <TabsContent value="image" className="mt-4">
          <ImageSchedule />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ManualSchedule({ canManage }: { canManage: boolean }) {
  const { t } = useI18n();

  return (
    <div className="space-y-3">
      {canManage && (
        <Button className="w-full">
          <Plus className="w-4 h-4 ml-2" />
          {t("schedule.addSlot")}
        </Button>
      )}
      {DAYS.map((day) => (
        <Card key={day.key} className="p-4">
          <h3 className="font-bold text-sm mb-2">{t(day.label)}</h3>
          <div className="text-xs text-muted-foreground text-center py-4">
            {t("schedule.noSlots")}
          </div>
        </Card>
      ))}
    </div>
  );
}

function ImageSchedule() {
  const { t } = useI18n();
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    if (!["image/png", "image/jpeg", "application/pdf"].includes(file.type)) {
      toast.error("صيغة غير مدعومة. استخدم PNG أو JPG أو PDF.");
      return;
    }

    // Validate size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("حجم الملف يتجاوز 10 ميغابايت.");
      return;
    }

    // For now: store locally (real upload to Supabase Storage in Phase 8)
    const reader = new FileReader();
    reader.onload = () => {
      setImageUrl(reader.result as string);
      toast.success("تم تحميل الصورة (محلياً). ستحفظ في حسابك.");
    };
    reader.readAsDataURL(file);
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="font-bold text-sm mb-1">
            {t("schedule.uploadImage")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t("schedule.imageHint")}
          </p>
        </div>

        {imageUrl ? (
          <div className="space-y-3">
            <img
              src={imageUrl}
              alt="Schedule"
              className="w-full rounded-xl border border-border"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImageUrl(null)}
            >
              تغيير الصورة
            </Button>
          </div>
        ) : (
          <label className="block">
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors">
              <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">اضغط لاختيار صورة</p>
              <p className="text-xs text-muted-foreground mt-1">
                PNG, JPG, PDF — حتى 10MB
              </p>
            </div>
            <input
              type="file"
              accept="image/png,image/jpeg,application/pdf"
              onChange={handleUpload}
              className="hidden"
            />
          </label>
        )}
      </div>
    </Card>
  );
}
