"use client";

import * as React from "react";
import { Bell, CheckCircle2, XCircle, UserPlus, Flag, CheckCheck, Loader2, Megaphone } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Notifications panel — round 10, System Review §3/§4.
 *
 * The header bell now opens THIS panel instead of jumping straight to
 * announcements. It is the single "things that need your attention" inbox:
 *   • join_approved / join_rejected → the student's request outcome (§3)
 *   • join_new / report_new         → waiting items for supervisors (§4)
 * plus a pinned row linking to the announcements screen (previous bell
 * behavior, preserved).
 *
 * States handled (review §17 C): loading skeleton, empty, unread/read,
 * mark-all-read, error-tolerant (parent fetch failures just show empty).
 */

export interface AppNotificationItem {
  id: number;
  type: string;
  title: string;
  body: string;
  meta: Record<string, unknown>;
  readAt: string | null;
  createdAt: string | null;
}

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  join_new: UserPlus,
  join_approved: CheckCircle2,
  join_rejected: XCircle,
  report_new: Flag,
  generic: Bell,
};

const TYPE_COLORS: Record<string, string> = {
  join_new: "text-primary bg-primary/10",
  join_approved: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
  join_rejected: "text-red-600 dark:text-red-400 bg-red-500/10",
  report_new: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
  generic: "text-muted-foreground bg-muted",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return "";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `قبل ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `قبل ${days} يوم`;
  return new Date(iso).toLocaleDateString("ar");
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notifications: AppNotificationItem[];
  loading: boolean;
  announcementsUnread: number;
  onMarkAllRead: () => void;
  onOpenAnnouncements: () => void;
  onItemTap: (item: AppNotificationItem) => void;
}

export function TalibNotificationsSheet({
  open,
  onOpenChange,
  notifications,
  loading,
  announcementsUnread,
  onMarkAllRead,
  onOpenAnnouncements,
  onItemTap,
}: Props) {
  const unread = notifications.filter((n) => n.readAt == null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="p-4 pb-3 border-b text-right">
          <SheetTitle className="text-base font-bold flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            الإشعارات
            {unread.length > 0 && (
              <Badge className="bg-primary text-primary-foreground text-xs">{unread.length} جديد</Badge>
            )}
          </SheetTitle>
          <SheetDescription className="text-xs">
            تحديثات طلبات الانضمام والتبليغات — تصل لك فور حدوثها
          </SheetDescription>
          {unread.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onMarkAllRead}
              className="mt-1 h-8 text-xs w-fit"
            >
              <CheckCheck className="w-3.5 h-3.5 ml-1" />
              تعليم الكل كمقروء
            </Button>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {loading && notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-xs">جارٍ تحميل الإشعارات…</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 gap-2 text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Bell className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">لا توجد إشعارات بعد</p>
              <p className="text-xs text-muted-foreground">
                ستظهر هنا نتائج طلبات الانضمام والتبليغات الجديدة فور وصولها
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {notifications.map((n) => {
                const Icon = TYPE_ICONS[n.type] ?? Bell;
                const isUnread = n.readAt == null;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => onItemTap(n)}
                      className={cn(
                        "w-full text-right px-4 py-3 flex gap-3 items-start hover:bg-muted/60 transition-colors",
                        isUnread && "bg-primary/5"
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
                          TYPE_COLORS[n.type] ?? TYPE_COLORS.generic
                        )}
                      >
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2">
                          <span className={cn("text-sm truncate", isUnread ? "font-bold" : "font-medium")}>
                            {n.title}
                          </span>
                          {isUnread && <span className="shrink-0 w-2 h-2 rounded-full bg-primary" />}
                        </span>
                        <span className="block text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-3">
                          {n.body}
                        </span>
                        <span className="block text-[10px] text-muted-foreground/70 mt-1">
                          {timeAgo(n.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* pinned: announcements entry (preserves the old bell destination) */}
        <div className="border-t p-3">
          <button
            type="button"
            onClick={onOpenAnnouncements}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/60 transition-colors text-right"
          >
            <span className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
              <Megaphone className="w-4 h-4 text-muted-foreground" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium">الإعلانات</span>
              <span className="block text-xs text-muted-foreground">
                {announcementsUnread > 0 ? `${announcementsUnread} إعلان غير مقروء` : "لا إعلانات غير مقروءة"}
              </span>
            </span>
            {announcementsUnread > 0 && (
              <Badge variant="destructive" className="text-xs">
                {announcementsUnread > 9 ? "9+" : announcementsUnread}
              </Badge>
            )}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
