"use client";

import * as React from "react";
import { History } from "lucide-react";
import { formatSavedAt } from "@/lib/offline";
import { useI18n } from "@/components/talib/i18n-provider";

/**
 * round 61 — «بيانات محفوظة» chip. Rendered by the main read screens
 * (courses / schedule / exams / announcements) when their list is served
 * from the device cache because the network is down: the student sees WHY
 * the data might be slightly old instead of an error. `savedAt` is the
 * write time of the cache entry (ar-DZ formatted).
 */
export function StaleDataChip({ savedAt }: { savedAt: number }) {
  const { t } = useI18n();
  const stamp = React.useMemo(() => formatSavedAt(savedAt), [savedAt]);
  return (
    <div
      role="status"
      className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 flex items-center gap-2"
    >
      <History className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
      <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 leading-relaxed">
        {stamp
          ? t("offline.savedDataChip", { when: stamp })
          : t("offline.savedDataChipPlain")}
      </p>
    </div>
  );
}
