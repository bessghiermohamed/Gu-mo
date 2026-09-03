"use client";

/**
 * أدواتي — the tools tab inside ملفاتي.
 *
 * Three offline-capable file utilities for students, shown as simple full-width
 * row cards (the same card pattern as the "دروس تيليجرام" feature card on the
 * home screen — no new design patterns). Tapping a card swaps to the tool's
 * dedicated sub-screen with a back chevron, all inside the same tab.
 */

import * as React from "react";
import { motion } from "framer-motion";
import {
  Calculator,
  ChevronLeft,
  Combine,
  Images,
  ShieldCheck,
  Shrink,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/components/talib/i18n-provider";
import { cn } from "@/lib/utils";
import { ImageToPdfTool } from "./image-to-pdf-tool";
import { CompressPdfTool } from "./compress-pdf-tool";
import { MergePdfTool } from "./merge-pdf-tool";
import { GpaTool } from "./gpa-tool";

type ToolId = "images" | "compress" | "merge" | "gpa";

const TOOLS: Array<{
  id: ToolId;
  icon: React.ReactNode;
  title: string;
  desc: string;
}> = [
  {
    id: "gpa",
    icon: <Calculator className="w-6 h-6" />,
    title: "حاسبة المعدل",
    desc: "مقاييس تخصصك بمعاملاتها الحقيقية — ماذا يصبح معدلك لو…؟",
  },
  {
    id: "images",
    icon: <Images className="w-6 h-6" />,
    title: "صور إلى PDF",
    desc: "حوّل صور جهازك إلى ملف PDF واحد — كل صورة في صفحة",
  },
  {
    id: "compress",
    icon: <Shrink className="w-6 h-6" />,
    title: "ضغط PDF",
    desc: "قلّص حجم ملف PDF ثقيل قبل إرساله للمجموعة",
  },
  {
    id: "merge",
    icon: <Combine className="w-6 h-6" />,
    title: "دمج ملفات PDF",
    desc: "اجمع عدة ملفات في ملف واحد مرتّب كما تختار",
  },
];

export function ToolsTab() {
  const { dir } = useI18n();
  const [activeTool, setActiveTool] = React.useState<ToolId | null>(null);

  if (activeTool === "gpa") {
    return <GpaTool onBack={() => setActiveTool(null)} />;
  }
  if (activeTool === "images") {
    return <ImageToPdfTool onBack={() => setActiveTool(null)} />;
  }
  if (activeTool === "compress") {
    return <CompressPdfTool onBack={() => setActiveTool(null)} />;
  }
  if (activeTool === "merge") {
    return <MergePdfTool onBack={() => setActiveTool(null)} />;
  }

  return (
    <div className="space-y-3">
      {/* Privacy banner — the whole point of these tools: files stay on-device */}
      <Card className="flex-row items-center gap-3 p-4 bg-primary/5 border-primary/20">
        <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm">أدوات تعمل داخل جهازك</h3>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            كل المعالجة تتم في متصفحك فقط — لا يُرفع أي ملف إلى أي خادم، وتعمل
            حتى دون إنترنت بعد فتح الصفحة.
          </p>
        </div>
      </Card>

      {/* Tool cards — same row-card pattern as the home screen feature card */}
      <div className="space-y-3">
        {TOOLS.map((tool, i) => (
          <motion.button
            key={tool.id}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25, delay: i * 0.06 }}
            onClick={() => setActiveTool(tool.id)}
            className="group w-full text-right"
          >
            <Card className="p-4 flex-row items-center gap-3 hover:border-primary/50 hover:shadow-md transition-all hover:-translate-y-0.5">
              <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                {tool.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm">{tool.title}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{tool.desc}</p>
              </div>
              <ChevronLeft
                className={cn(
                  "w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0",
                  dir === "rtl" && "rotate-180"
                )}
              />
            </Card>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
