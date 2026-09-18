"use client";

/**
 * أدواتي — the tools list (round 31: standalone screen, no longer a tab
 * inside ملفاتي — the duplication owner reported is fixed by giving tools
 * their own screen via tools-screen.tsx).
 *
 * Round 43: 7 → 10 — ضغط الصور and صورة إلى نص (both on-device, same
 * privacy contract) plus المساعد الذكي: the first ONLINE tool.
 *
 * Round 87: دفتر طالب joined as a second full-width featured card —
 * a NotebookLM-style study space (sources + grounded chat + 8 outputs).
 *
 * Round 91 (owner: «Delete Generator Studio»): استوديو المولّدات (r89)
 * is REMOVED entirely — component, /api/ai/studio route, lib/ai/studio
 * module, featured card, search entry, and the now-unused
 * chatWithProvider helper in providers. The six bot generators (r85/
 * r86) and دفتر طالب (r87) are untouched and remain the online study
 * surface. History: r89 preserved in git (c0d51b0).
 *
 * Round 88 (owner: «احذف المساعد الذكي وأبقِ دفتر طالب»): the Smart
 * Assistant chatbot is REMOVED entirely — component, /api/ai route,
 * featured card, search entry, settings copy, bot fallback copy. The
 * violet card is gone; دفتر طالب (emerald) is now the only featured
 * online tool. Study help online lives in دفتر طالب and the Telegram
 * bot's tool suite (r85/r86).
 *
 * Round 92 (owner: «سأترك دفتر الطالب في أدواتي لكن قلل عرضه وحجمه، ونفس
 * الشيء لباقي صناديق أدواتي»): the full-width featured card (with its mock
 * chat preview) is GONE — دفتر طالب is now a compact cell INSIDE the tools
 * grid with the same footprint as every other tool (emerald identity kept),
 * and every grid card is tighter: smaller icons (w-4.5), smaller padding
 * (p-3), smaller titles (13px) and tighter gaps (10px). The search/
 * noResults contract and the 9-tool TOOLS array are untouched.
 *  - 2-column touch grid: ≥44px targets, ≥12px gaps (ux-guidelines:
 *    touch-spacing + touch-target-size),
 *  - hover feedback via color/shadow ONLY (no translate/scale — the
 *    skill's «stable hover states» rule), 200ms transitions,
 *  - cursor-pointer + focus-visible rings on every interactive element,
 *  - entrance animation is opacity-only (respects prefers-reduced-motion
 *    better than scale/spring entrances).
 */

import * as React from "react";
import { motion } from "framer-motion";
import {
  Calculator,
  Coffee,
  Combine,
  ImageDown,
  Images,
  NotebookPen,
  ScanText,
  Scissors,
  Search,
  ShieldCheck,
  Shrink,
  Type,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { NotebookTool } from "./notebook-tool";

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
  | "notebook";

type ToolCategory = "pdf" | "study" | "image";

const CATEGORY_LABELS: Record<ToolCategory, string> = {
  pdf: "أدوات PDF",
  study: "أدوات الدراسة",
  image: "أدوات الصور",
};

/** Arabic-aware search normalization: strip diacritics, unify alef/ya/ta
 *  forms so «أداة» matches «اداة» and «معدل» matches «معدْل». */
function normalizeArabic(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .trim();
}

const TOOLS: Array<{
  id: ToolId;
  icon: React.ReactNode;
  title: string;
  desc: string;
  category: ToolCategory;
}> = [
  {
    id: "gpa",
    icon: <Calculator className="w-4.5 h-4.5" />,
    title: "حاسبة المعدل",
    desc: "مقاييس تخصصك بمعاملاتها الحقيقية — ماذا يصبح معدلك لو…؟",
    category: "study",
  },
  {
    id: "images",
    icon: <Images className="w-4.5 h-4.5" />,
    title: "صور إلى PDF",
    desc: "حوّل صور جهازك إلى ملف PDF واحد — كل صورة في صفحة",
    category: "pdf",
  },
  {
    id: "compress",
    icon: <Shrink className="w-4.5 h-4.5" />,
    title: "ضغط PDF",
    desc: "قلّص حجم ملف PDF ثقيل قبل إرساله للمجموعة",
    category: "pdf",
  },
  {
    id: "merge",
    icon: <Combine className="w-4.5 h-4.5" />,
    title: "دمج ملفات PDF",
    desc: "اجمع عدة ملفات في ملف واحد مرتّب كما تختار",
    category: "pdf",
  },
  {
    id: "extract",
    icon: <Scissors className="w-4.5 h-4.5" />,
    title: "استخراج صفحات PDF",
    desc: "شارك فقط الصفحات التي تهمّ زميلك من ملف ضخم",
    category: "pdf",
  },
  {
    id: "counter",
    icon: <Type className="w-4.5 h-4.5" />,
    title: "عدّاد الكلمات",
    desc: "كلمات، أحرف، جمل وزمن قراءة — قبل تسليم التقرير",
    category: "study",
  },
  {
    id: "timer",
    icon: <Coffee className="w-4.5 h-4.5" />,
    title: "مؤقّت المراجعة",
    desc: "جلسات تركيز قصيرة واستراحات — تقنية بومودورو",
    category: "study",
  },
  {
    id: "compress-img",
    icon: <ImageDown className="w-4.5 h-4.5" />,
    title: "ضغط الصور",
    desc: "صغّر صور السبورة والوثائق قبل إرسالها للمجموعة",
    category: "image",
  },
  {
    id: "ocr",
    icon: <ScanText className="w-4.5 h-4.5" />,
    title: "صورة إلى نص",
    desc: "صوّر السبورة أو الورقة — انسخ النص عربياً أو فرنسياً",
    category: "image",
  },
];

const GRID_TOOLS = TOOLS;

export function ToolsTab() {
  const [activeTool, setActiveTool] = React.useState<ToolId | null>(null);
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<ToolCategory | "all">("all");

  // round 57 removed the r56 home-screen deep link (talib-open-ai bridge)
  // together with the home banner; round 88 removed the assistant itself.

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
  if (activeTool === "notebook") {
    return <NotebookTool onBack={() => setActiveTool(null)} />;
  }

  const q = normalizeArabic(query);
  const matchesNotebook =
    !q || normalizeArabic("دفتر طالب مصادر ملخص صوتي اختبار بطاقات خريطة ذهنية خط زمني دراسة استرجاع NotebookLM").includes(q);
  const gridTools = GRID_TOOLS.filter((t) => {
    const inCategory = category === "all" || t.category === category;
    const matches = !q || normalizeArabic(`${t.title} ${t.desc}`).includes(q);
    return inCategory && matches;
  });
  const noResults = !matchesNotebook && gridTools.length === 0;

  return (
    <div className="space-y-4">
      {/* Privacy banner — the whole point of these tools: files stay on-device */}
      <Card className="flex-row items-center gap-3 p-3 bg-primary/5 border-primary/20">
        <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <ShieldCheck className="w-4.5 h-4.5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-[13px]">أدوات تعمل داخل جهازك</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
            كل المعالجة في متصفحك فقط — لا يُرفع أي ملف لأي خادم، وتعمل حتى
            دون إنترنت.
          </p>
        </div>
      </Card>

      {/* Search — Arabic-normalized, with clear button (ux: form labels + a11y) */}
      <div className="relative">
        <Search className="absolute top-1/2 -translate-y-1/2 right-3.5 w-4 h-4 text-muted-foreground pointer-events-none" />
        <label htmlFor="tools-search" className="sr-only">
          ابحث في الأدوات
        </label>
        <Input
          id="tools-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث في الأدوات…"
          className="pr-10 rounded-full bg-muted border-transparent h-11 text-sm focus-visible:bg-background"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="مسح البحث"
            className="absolute top-1/2 -translate-y-1/2 left-3 w-6 h-6 rounded-full bg-accent text-muted-foreground hover:text-foreground transition-colors duration-200 cursor-pointer flex items-center justify-center"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Category chips — live counts, aria-pressed (ux: filtering rule) */}
      <div
        className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5"
        role="group"
        aria-label="تصفية حسب التصنيف"
      >
        {(["all", "pdf", "study", "image"] as const).map((cat) => {
          const active = category === cat;
          const count =
            cat === "all"
              ? GRID_TOOLS.length + 1
              : GRID_TOOLS.filter((t) => t.category === cat).length +
                (cat === "study" ? 1 : 0);
          return (
            <button
              key={cat}
              type="button"
              aria-pressed={active}
              onClick={() => setCategory(cat)}
              className={cn(
                "shrink-0 h-9 px-4 rounded-full text-[13px] font-bold cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-card text-muted-foreground border hover:border-primary/40 hover:text-primary"
              )}
            >
              {cat === "all" ? "الكل" : CATEGORY_LABELS[cat]}
              <span
                className={cn(
                  "mr-1.5 text-[11px] font-black",
                  active ? "text-primary-foreground/70" : "text-muted-foreground/60"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {noResults ? (
        /* Empty state — real content + reset (ux: empty-state rule) */
        <div className="py-14 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
            <Search className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="font-bold text-sm">لا توجد أداة مطابقة</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            جرّب كلمة أخرى — مثل «PDF» أو «معدل» أو «صور»
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setCategory("all");
            }}
            className="mt-4 h-9 px-4 rounded-full bg-primary text-primary-foreground text-[13px] font-bold cursor-pointer hover:bg-primary/90 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            إظهار كل الأدوات
          </button>
        </div>
      ) : (
        <>
          {/* Responsive touch grid — 2 cols mobile → 4 desktop (ux: responsive rule).
              Round 92: دفتر طالب lives INSIDE the grid as a compact cell
              (owner: قلل عرضه وحجمه) — same footprint as the rest, emerald
              identity kept; every card tighter: w-9 icons, p-3, 13px titles. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {matchesNotebook && (category === "all" || category === "study") && (
              <motion.button
                key="notebook"
                initial={false}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.25 }}
                onClick={() => setActiveTool("notebook")}
                aria-label="دفتر طالب — افتح دفترك الدراسي"
                className="group text-right cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] transition-transform"
              >
                <Card className="relative h-full overflow-hidden p-0 border-0 bg-gradient-to-l from-emerald-600 via-emerald-500 to-teal-500 text-white shadow-md transition-shadow duration-200 hover:shadow-lg">
                  <NotebookPen
                    aria-hidden="true"
                    className="absolute -bottom-3.5 -left-3.5 w-16 h-16 text-white/10 -rotate-12 pointer-events-none"
                  />
                  <div className="relative p-3">
                    <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0 transition-colors duration-200 group-hover:bg-white/25">
                      <NotebookPen className="w-4.5 h-4.5" />
                    </div>
                    <div className="flex items-center gap-1.5 mt-2">
                      <h3 className="font-black text-[13px]">دفتر طالب</h3>
                      <Badge className="text-[9px] px-1 py-0 bg-white/20 text-white border-0">جديد</Badge>
                    </div>
                    <p className="text-[11px] text-white/85 mt-0.5 leading-relaxed line-clamp-2">
                      لخّص واختبر نفسك واسمع ملخصاً صوتياً — من مصادرك أنت
                    </p>
                  </div>
                </Card>
              </motion.button>
            )}
            {gridTools.map((tool, i) => (
              <motion.button
                key={tool.id}
                initial={false}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.22, delay: Math.min(i * 0.04, 0.28) }}
                onClick={() => setActiveTool(tool.id)}
                aria-label={tool.title}
                className="group text-right cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] transition-transform"
              >
                <Card className="h-full gap-0 p-3 transition-[border-color,box-shadow] duration-200 hover:border-primary/50 hover:shadow-md">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground">
                    {tool.icon}
                  </div>
                  <h3 className="font-bold text-[13px] mt-2">{tool.title}</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                    {tool.desc}
                  </p>
                </Card>
              </motion.button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
