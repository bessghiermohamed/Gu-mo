"use client";

import * as React from "react";
import { User, Mail, IdCard, Building, BookOpen, Users, Shield, LogOut, ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { useShell } from "@/app/page";

interface Props {
  onSignOut: () => void;
}

export function TalibProfileScreen({ onSignOut }: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { navigate } = useShell();

  if (!user) return null;

  // Fix A.1: NO self-promotion button visible here.
  // Role promotion is only available in AdminPanel via canManageRoles() check.
  const roleLabel = t(`roles.${user.role}`);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black mb-1">{t("nav.profile")}</h1>
        <p className="text-sm text-muted-foreground">معلوماتك الشخصية والأكاديمية</p>
      </div>

      {/* Profile card */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <User className="w-7 h-7" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-lg truncate">{user.fullName}</h2>
            <p className="text-sm text-muted-foreground truncate">
              {user.email}
            </p>
            <Badge variant="secondary" className="mt-1">
              <Shield className="w-3 h-3 ml-1" />
              {roleLabel}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Info list */}
      <Card className="p-2 divide-y divide-border">
        <InfoRow
          icon={<IdCard className="w-4 h-4" />}
          label="الرقم التسلسلي"
          value={user.studentId}
        />
        <InfoRow
          icon={<Building className="w-4 h-4" />}
          label="المؤسسة"
          value="—" // Will populate from StudentProfile
        />
        <InfoRow
          icon={<BookOpen className="w-4 h-4" />}
          label="التخصص"
          value="—"
        />
        <InfoRow
          icon={<Users className="w-4 h-4" />}
          label="الفوج"
          value="—"
        />
      </Card>

      {/* Account actions */}
      <div className="space-y-2">
        <Button
          variant="outline"
          className="w-full justify-between"
          onClick={() => navigate("ANNOUNCEMENTS")}
        >
          <span className="flex items-center">
            <Mail className="w-4 h-4 ml-2" />
            الإعلانات
          </span>
          <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
        </Button>

        {/* fix A.1: NO self-promotion button. Only Admin Panel link for authorized users. */}
        {/* Admin Panel button is shown in bottom nav for those with canManageRoles */}

        <Button
          variant="destructive"
          className="w-full"
          onClick={onSignOut}
        >
          <LogOut className="w-4 h-4 ml-2" />
          تسجيل الخروج
        </Button>
      </div>

      <p className="text-xs text-center text-muted-foreground">
        طالب | Talib — نسخة 1.0 ويب
      </p>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3">
      <div className="w-9 h-9 rounded-xl bg-muted text-muted-foreground flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-bold truncate">{value || "—"}</p>
      </div>
    </div>
  );
}
