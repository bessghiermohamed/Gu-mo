"use client";

/**
 * أدواتي — the tools list (round 31: standalone screen, no longer a tab
 * inside ملفاتي — the duplication owner reported is fixed by giving tools
 * their own screen via tools-screen.tsx).
 *
 * Seven offline-capable student utilities (round 29: 4 → 7 — extract-pages,
 * word counter and study timer joined), shown as simple full-width row
 * cards (the same card pattern as the "دروس تيليجرام" feature card on the
 * home screen — no new design patterns). Tapping a card swaps to the tool's
 * dedicated sub-screen with a back chevron.
 *
 * Round 43: 7 → 10 — ضغط الصور and صورة إلى نص (both on-device, same
 * privacy contract) plus المساعد الذكي: the first ONLINE tool, visually
 * distinct (violet accent + «جديد» badge) with its own honest privacy note.
 *
 * Round 44: المساعد الذكي became a full ChatGPT-style conversation
 * (speech bubbles, history sidebar, streaming) — same entry point here,
 * the redesign lives entirely inside ai-assistant-tool.tsx.
 */

import * as React from "react";
import { motion } from "framer-motion";
import {
  Calculator,
  ChevronLeft,
  Coffee,
  Combine,
  ImageDown,
  Images,
  ScanText,
  Scissors,
  ShieldCheck,
  Shrink,
  Sparkles,
  Type,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/talib/i18n-provider";
import { cn } from "@/lib/utils";
import { ImageToPdfTool } from "./image-to-pdf-tool";
import { CompressPdfTool } from "./compress-pdf-tool";
import { MergePdfTool } from "./merge-pdf-tool";
import { GpaTool } from "./gpa-tool";
import { ExtractPdfTool } from "./extract-pdf-tool";
import { WordCounterTool } from "./word-counter-tool";
import { StudyTimerTool } from "./study-timer-tool";
import { CompressImageTool } from "./compress-image-tool";
import { OcrTool } from "./ocr-tool";
import { AiAssistantTool } from "./ai-assistant-tool";

type ToolId =
  | "gpa"
  | "images"
  | "compress"
  | "merge"
  | "extract"
  | "counter"
  | "timer"
  | "compress-img"
  | "ocr"
  | "ai";

const TOOLS: Array<{
  id: ToolId;
  icon: React.ReactNode;
  title: string;
  desc: string;
  /** round 43 — AI helper: online, distinct accent + badge so it never
   *  hides behind the offline promise of the file tools. */
  ai?: boolean;
  badge?: string;
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
  {
    id: "extract",
    icon: <Scissors className="w-6 h-6" />,
    title: "استخراج صفحات PDF",
    desc: "شارك فقط الصفحات التي تهمّ زميلك من ملف ضخم",
  },
  {
    id: "counter",
    icon: <Type className="w-6 h-6" />,
    title: "عدّاد الكلمات",
    desc: "كلمات، أحرف، جمل وزمن قراءة — قبل تسليم التقرير",
  },
  {
    id: "timer",
    icon: <Coffee className="w-6 h-6" />,
    title: "مؤقّت المراجعة",
    desc: "جلسات تركيز قصيرة واستراحات — تقنية بومودورو",
  },
  {
    id: "compress-img",
    icon: <ImageDown className="w-6 h-6" />,
    title: "ضغط الصور",
    desc: "صغّر صور السبورة والوثائق قبل إرسالها للمجموعة",
  },
  {
    id: "ocr",
    icon: <ScanText className="w-6 h-6" />,
    title: "صورة إلى نص",
    desc: "صوّر السبورة أو الورقة — انسخ النص عربياً أو فرنسياً",
  },
  {
    id: "ai",
    icon: <Sparkles className="w-6 h-6" />,
    title: "المساعد الذكي",
    desc: "محادثة دراسية بالعربية — يلخّص ويشرح ويختبرك ويجيب أسئلتك",
    ai: true,
    badge: "جديد",
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
  if (activeTool === "extract") {
    return <ExtractPdfTool onBack={() => setActiveTool(null)} />;
  }
  if (activeTool === "counter") {
    return <WordCounterTool onBack={() => setActiveTool(null)} />;
  }
  if (activeTool === "timer") {
    return <StudyTimerTool onBack={() => setActiveTool(null)} />;
  }
  if (activeTool === "compress-img") {
    return <CompressImageTool onBack={() => setActiveTool(null)} />;
  }
  if (activeTool === "ocr") {
    return <OcrTool onBack={() => setActiveTool(null)} />;
  }
  if (activeTool === "ai") {
    return <AiAssistantTool onBack={() => setActiveTool(null)} />;
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
            <Card
              className={cn(
                "p-4 flex-row items-center gap-3 hover:shadow-md transition-all hover:-translate-y-0.5",
                tool.ai
                  ? "border-violet-500/30 bg-violet-500/5 hover:border-violet-500/60"
                  : "hover:border-primary/50"
              )}
            >
              <div
                className={cn(
                  "w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-colors",
                  tool.ai
                    ? "bg-violet-500/10 text-violet-500 group-hover:bg-violet-600 group-hover:text-white"
                    : "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground"
                )}
              >
                {tool.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm">{tool.title}</h3>
                  {tool.badge && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0 bg-violet-500/15 text-violet-600 dark:text-violet-400"
                    >
                      {tool.badge}
                    </Badge>
                  )}
                </div>
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
