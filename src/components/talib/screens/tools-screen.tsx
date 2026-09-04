"use client";

/**
 * أدواتي — standalone screen (round 31).
 *
 * Owner feedback (round 31): separating files from tools on the home grid
 * duplicated navigation — أدواتي was BOTH a home tile and a tab inside
 * ملفاتي, and the TOOLS tile opened the files screen with the tools tab
 * pre-selected (wrong title, wrong subtitle, double entry points).
 *
 * Fix: tools get their own top-level screen. ملفاتي keeps المكتبة +
 * ملاحظاتي + the new سحابتي (Google Drive) tab — no tools inside it.
 */

import * as React from "react";
import { Wrench } from "lucide-react";
import { ToolsTab } from "@/components/talib/tools/tools-tab";

export function TalibToolsScreen() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black mb-1 flex items-center gap-2">
          <Wrench className="w-6 h-6 text-primary" />
          أدواتي
        </h1>
        <p className="text-sm text-muted-foreground">
          حاسبة المعدل وأدوات PDF والمذاكرة — كلها تعمل داخل جهازك
        </p>
      </div>
      <ToolsTab />
    </div>
  );
}
