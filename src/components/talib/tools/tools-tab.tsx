"use client";

/**
 * أدواتي — the tools list (round 31: standalone screen, no longer a tab
 * inside ملفاتي — the duplication owner reported is fixed by giving tools
 * their own screen via tools-screen.tsx).
 *
 * Round 43: 7 → 10 — ضغط الصور and صورة إلى نص (both on-device, same
 * privacy contract) plus المساعد الذكي: the first ONLINE tool, visually
 * distinct (violet accent + «جديد» badge) with its own honest privacy note.
 *
 * Round 44: المساعد الذكي became a full ChatGPT-style conversation —
 * same entry point here, the redesign lives inside ai-assistant-tool.tsx.
 *
 * Round 47 (UI/UX Pro Max redesign): the flat 10-row list became a
 * structured directory —
 *  - category chips (أدوات PDF / الدراسة / الصور) fixing the skill's
 *    «no filtering» anti-pattern, with live counts (aria-pressed),
 *  - Arabic-normalized search (diacritics stripped, alef/ya/ta unified)
 *    with a real empty state + reset,
 *  - المساعد الذكي promoted to a full-width featured card (its violet
 *    identity preserved) instead of a row among ten,
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
  ChevronLeft,
  Coffee,
  Combine,
  ImageDown,
  Images,
  MessageCircle,
  ScanText,
  Scissors,
  Search,
  ShieldCheck,
  Shrink,
  Sparkles,
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
    category: "study",
  },
  {
    id: "images",
    icon: <Images className="w-6 h-6" />,
    title: "صور إلى PDF",
    desc: "حوّل صور جهازك إلى ملف PDF واحد — كل صورة في صفحة",
    category: "pdf",
  },
  {
    id: "compress",
    icon: <Shrink className="w-6 h-6" />,
    title: "ضغط PDF",
    desc: "قلّص حجم ملف PDF ثقيل قبل إرساله للمجموعة",
    category: "pdf",
  },
  {
    id: "merge",
    icon: <Combine className="w-6 h-6" />,
    title: "دمج ملفات PDF",
    desc: "اجمع عدة ملفات في ملف واحد مرتّب كما تختار",
    category: "pdf",
  },
  {
    id: "extract",
    icon: <Scissors className="w-6 h-6" />,
    title: "استخراج صفحات PDF",
    desc: "شارك فقط الصفحات التي تهمّ زميلك من ملف ضخم",
    category: "pdf",
  },
  {
    id: "counter",
    icon: <Type className="w-6 h-6" />,
    title: "عدّاد الكلمات",
    desc: "كلمات، أحرف، جمل وزمن قراءة — قبل تسليم التقرير",
    category: "study",
  },
  {
    id: "timer",
    icon: <Coffee className="w-6 h-6" />,
    title: "مؤقّت المراجعة",
    desc: "جلسات تركيز قصيرة واستراحات — تقنية بومودورو",
    category: "study",
  },
  {
    id: "compress-img",
    icon: <ImageDown className="w-6 h-6" />,
    title: "ضغط الصور",
    desc: "صغّر صور السبورة والوثائق قبل إرسالها للمجموعة",
    category: "image",
  },
  {
    id: "ocr",
    icon: <ScanText className="w-6 h-6" />,
    title: "صورة إلى نص",
    desc: "صوّر السبورة أو الورقة — انسخ النص عربياً أو فرنسياً",
    category: "image",
  },
  {
    id: "ai",
    icon: <Sparkles className="w-6 h-6" />,
    title: "المساعد الذكي",
    desc: "محادثة دراسية بالعربية — يلخّص ويشرح ويختبرك ويجيب أسئلتك",
    category: "study",
    ai: true,
    badge: "جديد",
  },
];

const GRID_TOOLS = TOOLS.filter((t) => !t.ai);

export function ToolsTab() {
  const [activeTool, setActiveTool] = React.useState<ToolId | null>(null);
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<ToolCategory | "all">("all");

  // round 56 — deep link: the home-screen المساعد الذكي card opens the
  // assistant directly. sessionStorage covers the cross-screen case (home
  // → TOOLS remounts this tab); the window event covers taps while already
  // on this screen (nothing remounts then).
  React.useEffect(() => {
    const openAi = () => setActiveTool("ai");
    try {
      if (sessionStorage.getItem("talib-open-ai") === "1") {
        sessionStorage.removeItem("talib-open-ai");
        openAi();
      }
    } catch {
      // storage disabled — the event path still works
    }
    window.addEventListener("talib-open-ai", openAi);
    return () => window.removeEventListener("talib-open-ai", openAi);
  }, []);

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

  const q = normalizeArabic(query);
  const matchesAI = !q || normalizeArabic("المساعد الذكي محادثة دراسية بالعربية يلخص ويشرح ويختبرك").includes(q);
  const ai = TOOLS.find((t) => t.ai)!;
  const gridTools = GRID_TOOLS.filter((t) => {
    const inCategory = category === "all" || t.category === category;
    const matches = !q || normalizeArabic(`${t.title} ${t.desc}`).includes(q);
    return inCategory && matches;
  });
  const noResults = !matchesAI && gridTools.length === 0;

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
              ? GRID_TOOLS.length
              : GRID_TOOLS.filter((t) => t.category === cat).length;
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
          {/* Featured AI card — round 56 redesign: the owner said the old
              card «لا يوحي بوجوده». It now SHOWS the product: a mini
              chat-bubble preview (assistant explaining + user question)
              inside the violet identity, plus a clear «ابدأ محادثة» CTA —
              no one can mistake it for a plain utility row anymore. */}
          {matchesAI && (
            <motion.button
              key="ai"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
              onClick={() => setActiveTool("ai")}
              className="group w-full text-right cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="المساعد الذكي — ابدأ محادثة"
            >
              <Card className="relative overflow-hidden p-0 border-0 bg-gradient-to-l from-violet-600 via-violet-500 to-fuchsia-500 text-white shadow-md transition-shadow duration-200 hover:shadow-lg">
                <MessageCircle
                  aria-hidden="true"
                  className="absolute -bottom-7 -left-6 w-32 h-32 text-white/10 -rotate-12 pointer-events-none"
                />
                <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-white/10 to-transparent pointer-events-none" />
                <div className="relative p-4 space-y-3">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center shrink-0 backdrop-blur-sm transition-colors duration-200 group-hover:bg-white/25">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-[15px]">المساعد الذكي</h3>
                        <Badge className="text-[10px] px-1.5 py-0 bg-white/20 text-white border-0">
                          {ai.badge}
                        </Badge>
                      </div>
                      <p className="text-xs text-white/85 mt-0.5 leading-relaxed">
                        {ai.desc}
                      </p>
                    </div>
                    <span className="shrink-0 inline-flex items-center gap-1 h-8 px-3 rounded-full bg-white/20 text-white text-xs font-bold backdrop-blur-sm transition-colors duration-200 group-hover:bg-white/30">
                      ابدأ محادثة
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  {/* mini conversation preview — says "this is a chat"
                      without a single extra word of copy */}
                  <div className="space-y-1.5 max-w-[85%] mx-1">
                    <div className="w-fit max-w-full rounded-2xl rounded-tr-md bg-white/15 backdrop-blur-sm px-3 py-1.5 text-[11px] text-white/90 leading-relaxed">
                      اشرح لي الفرق بين السباتة والعطلة الصيفية بإيجاز
                    </div>
                    <div className="w-fit max-w-full ms-auto rounded-2xl rounded-tl-md bg-white/90 text-violet-900 px-3 py-1.5 text-[11px] leading-relaxed">
                      بالتأكيد — السباتة أسبوع واحد من كل سنة، أما العطلة الصيفية فتمتد شهرين…
                    </div>
                  </div>
                </div>
              </Card>
            </motion.button>
          )}

          {/* Responsive touch grid — 2 cols mobile → 4 desktop (ux: responsive rule),
              44px icons, 12px gaps, hover = color/shadow only */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {gridTools.map((tool, i) => (
              <motion.button
                key={tool.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.22, delay: Math.min(i * 0.04, 0.28) }}
                onClick={() => setActiveTool(tool.id)}
                aria-label={tool.title}
                className="group text-right cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] transition-transform"
              >
                <Card className="h-full gap-0 p-3.5 transition-[border-color,box-shadow] duration-200 hover:border-primary/50 hover:shadow-md">
                  <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0 transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground">
                    {tool.icon}
                  </div>
                  <h3 className="font-bold text-sm mt-3">{tool.title}</h3>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed line-clamp-2">
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
