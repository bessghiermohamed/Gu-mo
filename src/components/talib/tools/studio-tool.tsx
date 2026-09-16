"use client";

/**
 * أدواتي — استوديو المولّدات (r89).
 *
 * نسخة الويب من خدمات التوليد المستوحاة من منصات الذكاء (Alborihi AI
 * نموذجاً) بطلب المالك الذي لم يجدها في التطبيق: كانت حصرية في بوت
 * تيليجرام (r85/r86) — والآن ستٌّ منها تعيش هنا بنفس الممرات المُجرَّبة،
 * ومعها قدرتان جديدتان: «بحث موسّع» (خطّان بأمانة معلنة: من معرفة النموذج
 * مع قسمَي «ما يجب التحقق منه» و«مصادر مقترحة») و«قارن النماذج» (سؤالك
 * يجيب عنه مزوّدان جنباً إلى جنب والحكم لك).
 *
 * الخصوصية: صفر تخزين — لا شيء من ما تكتبه أو ما يُولَّد يُحفظ؛ يبقى في
 * الذاكرة حتى تغادر الشاشة، ويُرسل للمزوّد لهذا الطلب فقط.
 * needsConfig بعُرف r44: بلا مفاتيح → المالك يرى الإعداد والطالب «قريباً».
 */

import * as React from "react";
import {
  ArrowRight,
  BookOpenText,
  Check,
  ClipboardCopy,
  Code2,
  Download,
  ExternalLink,
  FileCode2,
  FileSearch,
  Languages,
  Loader2,
  Scale,
  ShieldCheck,
  Sparkles,
  Telescope,
  TriangleAlert,
  Wand2,
  Workflow,
} from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import type { PluggableList } from "unified";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/components/talib/i18n-provider";
import { cn } from "@/lib/utils";
import { STUDIO_ACTIONS, findStudioAction, type StudioAction } from "@/lib/ai/studio";
import { DIAGRAM_TYPES, TARGET_LANGS } from "@/lib/ai/study-tools";
import { ARCHETYPES } from "@/lib/ai/html-studio";

// ---------------------------------------------------------------------------
// Markdown — نفس لغة الدفتر (KaTeX داخل الفقاعات)
// ---------------------------------------------------------------------------

const markdownComponents: Components = {
  a: (props) => (
    <a {...props} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">
      {props.children}
    </a>
  ),
};

const markdownPlugins: PluggableList = [remarkGfm, [remarkMath, { singleDollar: true }]];
const katexPlugins: PluggableList = [[rehypeKatex, { throwOnError: false, strict: "ignore", errorColor: "#c2410c" }]];

const MarkdownContent = React.memo(function MarkdownContent({ content }: { content: string }) {
  return (
    <div dir="auto" className="ai-markdown">
      <ReactMarkdown remarkPlugins={markdownPlugins} rehypePlugins={katexPlugins} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
});

// ---------------------------------------------------------------------------
// الحالات والأنواع
// ---------------------------------------------------------------------------

interface StudioMeta {
  provider?: string;
  model?: string;
}

type StudioResponse =
  | ({ action: "research"; outline: string[]; report: string; note: string } & StudioMeta)
  | ({
      action: "arena";
      answers: Array<{ provider: string; providerLabel: string; model?: string; answer?: string; error?: string }>;
      ok: number;
    } & StudioMeta)
  | ({ action: "diagram"; code: string; typeLabel: string; corrected: boolean } & StudioMeta)
  | ({ action: "translate"; translation: string; targetLabel: string; autoDetected: boolean } & StudioMeta)
  | ({ action: "arabic"; analysis: string } & StudioMeta)
  | ({
      action: "detect";
      verdict: { probability: number; verdict: string; signals: string[]; advice: string };
    } & StudioMeta)
  | ({ action: "review"; review: string } & StudioMeta)
  | ({ action: "html"; html: string; title: string; archetypeLabel: string; refined: boolean } & StudioMeta);

const TOOL_ICONS: Record<StudioAction, React.ReactNode> = {
  research: <Telescope className="w-5 h-5" />,
  arena: <Scale className="w-5 h-5" />,
  diagram: <Workflow className="w-5 h-5" />,
  translate: <Languages className="w-5 h-5" />,
  arabic: <BookOpenText className="w-5 h-5" />,
  detect: <FileSearch className="w-5 h-5" />,
  review: <Code2 className="w-5 h-5" />,
  html: <FileCode2 className="w-5 h-5" />,
};

const DETECT_LABELS: Record<string, string> = {
  "human-leaning": "غالباً كتابة بشرية",
  mixed: "مختلطة أو غير حاسمة",
  "ai-leaning": "غالباً كتابة آلية",
};

const ARENA_TIMEOUT_HINT =
  "قد يستغرق القارن لحظات — مزوّدان يجيبان معاً. إن تأخر أحدهما يظهر خطأه وحده والآخر مكتمل.";

function MetaLine({ provider, model }: { provider?: string; model?: string }) {
  if (!provider) return null;
  return (
    <p className="text-[10px] text-muted-foreground/70 text-left" dir="ltr">
      {provider}
      {model ? ` · ${model}` : ""}
    </p>
  );
}

function CopyButton({ text, label = "نسخ" }: { text: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-8 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          toast.success("نُسخ إلى الحافظة");
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("تعذّر النسخ — الحافظة معطّلة");
        }
      }}
    >
      {copied ? <Check className="w-3.5 h-3.5 ml-1" /> : <ClipboardCopy className="w-3.5 h-3.5 ml-1" />}
      {copied ? "نُسخ" : label}
    </Button>
  );
}

function TextResult({
  content,
  downloadName,
  meta,
}: {
  content: string;
  downloadName?: string;
  meta?: StudioMeta;
}) {
  return (
    <Card className="p-3.5 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <CopyButton text={content} />
        <MetaLine provider={meta?.provider} model={meta?.model} />
      </div>
      <div className="text-[13px] leading-relaxed">
        <MarkdownContent content={content} />
      </div>
      {downloadName && (
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs w-full"
          onClick={() => {
            const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = downloadName;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download className="w-3.5 h-3.5 ml-1" />
          تنزيل كملف Markdown
        </Button>
      )}
    </Card>
  );
}

function DiagramResult({ code, typeLabel, corrected, meta }: { code: string; typeLabel: string; corrected: boolean; meta?: StudioMeta }) {
  return (
    <Card className="p-3.5 space-y-2.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className="text-[10px]">
            {typeLabel}
          </Badge>
          {corrected && (
            <Badge className="text-[10px] px-1.5 py-0 bg-amber-500/15 text-amber-700 dark:text-amber-400 border-0">
              صُحّحت الصياغة تلقائياً
            </Badge>
          )}
        </div>
        <MetaLine provider={meta?.provider} model={meta?.model} />
      </div>
      <pre dir="ltr" className="text-[11px] font-mono bg-muted/60 rounded-lg p-2.5 overflow-x-auto leading-relaxed">
        {code}
      </pre>
      <div className="flex gap-2">
        <CopyButton text={code} label="نسخ الكود" />
        <a
          href="https://mermaid.live"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1 h-8 px-3 rounded-md border bg-background text-xs font-medium hover:bg-accent transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5 ml-1" />
          معاينة على mermaid.live
        </a>
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        الصق الكود في mermaid.live لترى المخطط مرسوماً — أو استعمله في أي محرر يدعم Mermaid.
      </p>
    </Card>
  );
}

function DetectResult({
  verdict,
  meta,
}: {
  verdict: { probability: number; verdict: string; signals: string[]; advice: string };
  meta?: StudioMeta;
}) {
  const tone =
    verdict.verdict === "ai-leaning"
      ? "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20"
      : verdict.verdict === "human-leaning"
        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
        : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20";
  return (
    <Card className="p-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Badge className={cn("text-xs px-2 py-1 border", tone)}>{DETECT_LABELS[verdict.verdict] ?? verdict.verdict}</Badge>
        <MetaLine provider={meta?.provider} model={meta?.model} />
      </div>
      <div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
          <span>احتمال الكتابة الآلية</span>
          <span className="font-bold" dir="ltr">
            {verdict.probability}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              verdict.verdict === "ai-leaning" ? "bg-rose-500" : verdict.verdict === "human-leaning" ? "bg-emerald-500" : "bg-amber-500"
            )}
            style={{ width: `${Math.min(100, Math.max(0, verdict.probability))}%` }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">السقف 85٪ عمداً — لا أداة تحسم هذا الأمر.</p>
      </div>
      {verdict.signals?.length > 0 && (
        <div>
          <p className="text-[11px] font-bold mb-1">إشارات من النص نفسه:</p>
          <ul className="text-[11px] text-muted-foreground space-y-0.5 list-disc ps-4">
            {verdict.signals.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {verdict.advice && (
        <p className="text-[11px] bg-muted/60 rounded-lg p-2 leading-relaxed">{verdict.advice}</p>
      )}
    </Card>
  );
}

function HtmlResult({ html, title, archetypeLabel, refined, meta }: { html: string; title: string; archetypeLabel: string; refined: boolean; meta?: StudioMeta }) {
  return (
    <Card className="p-3.5 space-y-2.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 min-w-0">
          <Badge variant="secondary" className="text-[10px] shrink-0">
            {archetypeLabel}
          </Badge>
          {refined && (
            <Badge className="text-[10px] px-1.5 py-0 bg-sky-500/15 text-sky-700 dark:text-sky-400 border-0">
              مرّت على الناقد بعد تحسين
            </Badge>
          )}
          <span className="text-[11px] text-muted-foreground truncate">{title}</span>
        </div>
        <MetaLine provider={meta?.provider} model={meta?.model} />
      </div>
      <div className="rounded-lg border overflow-hidden bg-white">
        <iframe
          title={title || "صفحة مولَّدة"}
          srcDoc={html}
          sandbox="allow-same-origin"
          className="w-full h-72"
        />
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => {
            const blob = new Blob([html], { type: "text/html;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${(title || "talib-page").slice(0, 40)}.html`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download className="w-3.5 h-3.5 ml-1" />
          تنزيل الصفحة
        </Button>
        <CopyButton text={html} label="نسخ الكود" />
      </div>
    </Card>
  );
}

function ArenaResult({
  answers,
}: {
  answers: Array<{ provider: string; providerLabel: string; model?: string; answer?: string; error?: string }>;
}) {
  return (
    <div className="space-y-2.5">
      <p className="text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
        <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
        جوابان من مزوّدين مختلفين لنفس السؤال — قارن بنفسك واختر الأصدق؛ لا يوجد فائز تلقائي.
      </p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {answers.map((a, i) => (
          <Card key={i} className={cn("p-3 space-y-2", a.error && "border-amber-500/30")}>
            <div className="flex items-center justify-between gap-2">
              <Badge variant="secondary" className="text-[10px]">
                {a.providerLabel}
              </Badge>
              {a.model && (
                <span className="text-[10px] text-muted-foreground/70 truncate" dir="ltr">
                  {a.model}
                </span>
              )}
            </div>
            {a.answer ? (
              <>
                <div className="text-[12.5px] leading-relaxed max-h-96 overflow-y-auto">
                  <MarkdownContent content={a.answer} />
                </div>
                <CopyButton text={a.answer} />
              </>
            ) : (
              <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">{a.error}</p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function ResearchResult({
  outline,
  report,
  note,
  meta,
}: {
  outline: string[];
  report: string;
  note: string;
  meta?: StudioMeta;
}) {
  return (
    <div className="space-y-2.5">
      <Card className="p-3.5 space-y-2">
        <p className="text-xs font-bold flex items-center gap-1.5">
          <Telescope className="w-4 h-4 text-primary" />
          مخطط المحاور ({outline.length})
        </p>
        <ol className="text-[12px] space-y-1 list-decimal ps-5 text-muted-foreground leading-relaxed">
          {outline.map((o, i) => (
            <li key={i}>{o}</li>
          ))}
        </ol>
      </Card>
      <TextResult content={report} downloadName="بحث-موسّع.md" meta={meta} />
      <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 leading-relaxed flex items-start gap-1.5">
        <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
        {note}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// الاستوديو — الشاشة الرئيسية وشاشة الأداة
// ---------------------------------------------------------------------------

export function StudioTool({ onBack }: { onBack: () => void }) {
  const { dir } = useI18n();
  const rtl = dir === "rtl";

  const [view, setView] = React.useState<StudioAction | null>(null);
  const [input, setInput] = React.useState("");
  const [note, setNote] = React.useState(""); // ملاحظة اختيارية لمراجعة الكود
  const [option, setOption] = React.useState<string>(""); // typeId / lang / archetypeId ("" = تلقائي)
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<StudioResponse | null>(null);
  const [error, setError] = React.useState<{ message: string; hint?: string } | null>(null);
  const [needsConfig, setNeedsConfig] = React.useState(false);

  const spec = view ? findStudioAction(view) : null;

  function openTool(id: StudioAction) {
    setView(id);
    setInput("");
    setNote("");
    setOption("");
    setResult(null);
    setError(null);
  }

  function backToGrid() {
    setView(null);
    setResult(null);
    setError(null);
  }

  async function run() {
    if (!spec || running) return;
    const text = input.trim();
    if (text.length < spec.min) {
      toast.error(`الحد الأدنى ${spec.min} حرفاً لهذه الأداة`);
      return;
    }
    if (text.length > spec.max) {
      toast.error(`الحد الأقصى ${spec.max} حرفاً — الاختصار أصدق`);
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setError({ message: "أنت غير متصل بالإنترنت — الاستوديو يحتاج اتصالاً ليعمل." });
      return;
    }

    const payload: Record<string, unknown> = { action: spec.id, [spec.field]: text };
    if (spec.id === "diagram" && option) payload.typeId = option;
    if (spec.id === "translate" && option) payload.lang = option;
    if (spec.id === "html" && option) payload.archetypeId = option;
    if (spec.id === "review" && note.trim()) payload.note = note.trim().slice(0, 500);

    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ai/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (res.ok && data.needsConfig) {
        setNeedsConfig(true);
        backToGrid();
        return;
      }
      if (!res.ok) {
        setError({
          message: typeof data.error === "string" ? data.error : "تعذّر إتمام العملية — أعد المحاولة.",
          hint: typeof data.hint === "string" ? data.hint : undefined,
        });
        return;
      }
      setResult({ action: spec.id, ...data } as StudioResponse);
    } catch {
      setError({ message: "تعذّر الاتصال — تحقق من الإنترنت ثم أعد المحاولة." });
    } finally {
      setRunning(false);
    }
  }

  // ---- شاشة الإعداد (بلا مفاتيح على الخادم) ----
  if (needsConfig) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
          <Wand2 className="w-7 h-7 text-muted-foreground" />
        </div>
        <h3 className="font-black text-sm">استوديو المولّدات غير مفعّل بعد</h3>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">
          يعمل الاستوديو بسلسلة المزوّدين نفسها (Groq ← Gemini ← Grok) بلا أي مفتاح إضافي. بمجرد
          ضبط المفاتيح على الخادم يعمل كل الأدوات الثماني فوراً — وإن كان «دفتر طالب» يعمل فهذا
          يعمل بلا أي إعداد.
        </p>
        <Button variant="outline" size="sm" className="mt-2" onClick={onBack}>
          <ArrowRight className={cn("w-4 h-4", rtl ? "" : "rotate-180")} />
          رجوع إلى الأدوات
        </Button>
      </div>
    );
  }

  // ---- شاشة الأداة ----
  if (spec) {
    const value = input.trim().length;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={backToGrid} aria-label="رجوع إلى الاستوديو" className="shrink-0">
            <ArrowRight className={cn("w-5 h-5", rtl ? "" : "rotate-180")} />
          </Button>
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-base flex items-center gap-2">
              <span className="text-primary">{TOOL_ICONS[spec.id]}</span>
              {spec.label}
            </h2>
            <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{spec.tagline}</p>
          </div>
        </div>

        {/* خيارات الأداة */}
        {spec.id === "diagram" && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5" role="group" aria-label="نوع المخطط">
            {["", ...DIAGRAM_TYPES.map((t) => t.id)].map((id) => {
              const t = DIAGRAM_TYPES.find((x) => x.id === id);
              const active = option === id;
              return (
                <button
                  key={id || "auto"}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setOption(id)}
                  className={cn(
                    "shrink-0 h-8 px-3 rounded-full text-[12px] font-bold cursor-pointer transition-colors duration-200",
                    active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground border hover:border-primary/40 hover:text-primary"
                  )}
                >
                  {t ? t.label : "تلقائي"}
                </button>
              );
            })}
          </div>
        )}
        {spec.id === "translate" && (
          <select
            value={option}
            onChange={(e) => setOption(e.target.value)}
            aria-label="لغة الترجمة الهدف"
            className="h-9 w-full rounded-md border bg-card px-2.5 text-[13px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">اكتشاف تلقائي (عربي ↔ فرنسي)</option>
            {TARGET_LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        )}
        {spec.id === "html" && (
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="نمط الصفحة">
            {ARCHETYPES.map((a) => {
              const active = option === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={active}
                  title={a.hint}
                  onClick={() => setOption(active ? "" : a.id)}
                  className={cn(
                    "rounded-lg border p-2 text-right cursor-pointer transition-colors duration-200",
                    active ? "border-primary bg-primary/5" : "hover:border-primary/40"
                  )}
                >
                  <span className="text-[12px] font-bold block">{a.label}</span>
                  <span className="text-[10px] text-muted-foreground line-clamp-1">{a.hint}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* الإدخال */}
        <div className="space-y-1.5">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              spec.id === "research"
                ? "موضوع البحث — مثال: تأثير الذكاء الاصطناعي على تعليم الهندسة في الجزائر"
                : spec.id === "arena"
                  ? "اكتب سؤالك الدراسي — سيجيب عنه مزوّدان"
                  : spec.id === "review"
                    ? "الصق الكود هنا (أي لغة)…"
                    : spec.id === "detect"
                      ? `الصق النص المراد فحصه (${spec.min} حرفاً على الأقل)…`
                      : spec.id === "diagram"
                        ? "اوصف المخطط — مثال: دورة حياة طلب وثيقة في المكتبة الجامعية"
                        : spec.id === "html"
                          ? "اوصف الصفحة — مثال: بطاقة مراجعة لمقياس الإحصاء الوصفي"
                          : "اكتب أو الصق النص هنا…"
            }
            className="min-h-28 text-[13px] leading-relaxed resize-y"
            dir={spec.id === "review" ? "ltr" : "auto"}
          />
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span dir="ltr">
              {value} / {spec.max}
            </span>
            {spec.id === "detect" && value > 0 && value < spec.min && (
              <span className="text-amber-600">يحتاج {spec.min - value} حرفاً إضافياً على الأقل</span>
            )}
          </div>
        </div>
        {spec.id === "review" && (
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="ملاحظة اختيارية — مثال: يعلّق عند الملفات الكبيرة"
            className="h-9 w-full rounded-md border bg-card px-2.5 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        )}

        <Button onClick={run} disabled={running || value < spec.min} className="w-full h-10 font-bold">
          {running ? <Loader2 className="w-4 h-4 ml-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 ml-1.5" />}
          {running ? "جارٍ التوليد…" : "توليد"}
        </Button>
        {spec.id === "arena" && !running && <p className="text-[10px] text-muted-foreground text-center">{ARENA_TIMEOUT_HINT}</p>}

        {error && (
          <Card className="p-3 border-amber-500/30 bg-amber-500/5 space-y-1">
            <p className="text-[12px] text-amber-700 dark:text-amber-400 leading-relaxed flex items-start gap-1.5">
              <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
              {error.message}
            </p>
            {error.hint && (
              <p className="text-[10px] text-muted-foreground leading-relaxed" dir="auto">
                {error.hint}
              </p>
            )}
          </Card>
        )}

        {running && (
          <Card className="p-4 flex items-center gap-3">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <div className="flex-1">
              <p className="text-[12px] font-bold">{spec.label} يعمل الآن</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {spec.id === "research"
                  ? "خطّان: مخطط المحاور ثم التقرير — قد يستغرق نصف دقيقة."
                  : spec.id === "html"
                    ? "توليد ثم نقد خماسي وتحسين واحد — أطول الأدوات."
                    : "على سلسلة المزوّدين — لحظات ويجهز."}
              </p>
            </div>
          </Card>
        )}

        {result && !running && (
          <div className="space-y-2.5">
            {result.action === "research" && (
              <ResearchResult outline={result.outline} report={result.report} note={result.note} meta={result} />
            )}
            {result.action === "arena" && <ArenaResult answers={result.answers} />}
            {result.action === "diagram" && (
              <DiagramResult code={result.code} typeLabel={result.typeLabel} corrected={result.corrected} meta={result} />
            )}
            {result.action === "translate" && (
              <TextResult
                content={[
                  `**اللغة الهدف:** ${result.targetLabel}${result.autoDetected ? " (اكتشاف تلقائي)" : ""}`,
                  "",
                  result.translation,
                ].join("\n")}
                meta={result}
              />
            )}
            {result.action === "arabic" && <TextResult content={result.analysis} meta={result} />}
            {result.action === "detect" && <DetectResult verdict={result.verdict} meta={result} />}
            {result.action === "review" && <TextResult content={result.review} meta={result} />}
            {result.action === "html" && (
              <HtmlResult
                html={result.html}
                title={result.title}
                archetypeLabel={result.archetypeLabel}
                refined={result.refined}
                meta={result}
              />
            )}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
          النص الذي تكتبه يُرسل للمزوّد لهذا الطلب فقط — لا يُخزَّن أي شيء عندنا ولا على جهازك بعد
          مغادرة الشاشة.
        </p>
      </div>
    );
  }

  // ---- الشاشة الرئيسية: شبكة الأدوات الثماني ----
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="رجوع" className="shrink-0">
          <ArrowRight className={cn("w-5 h-5", rtl ? "" : "rotate-180")} />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-black text-base flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-primary" />
            استوديو المولّدات
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            ثماني أدوات تولّد من سلسلة المزوّدين المجانية نفسها — بلا أي مفتاح إضافي
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {STUDIO_ACTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => openTool(a.id)}
            aria-label={a.label}
            className="group text-right cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] transition-transform"
          >
            <Card className="h-full gap-0 p-3.5 transition-[border-color,box-shadow] duration-200 hover:border-primary/50 hover:shadow-md">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground">
                {TOOL_ICONS[a.id]}
              </div>
              <h3 className="font-bold text-[13px] mt-2.5">{a.label}</h3>
              <p className="text-[10.5px] text-muted-foreground mt-1 leading-relaxed line-clamp-2">{a.tagline}</p>
            </Card>
          </button>
        ))}
      </div>

      <Card className="flex-row items-center gap-3 p-3 bg-primary/5 border-primary/20">
        <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <ShieldCheck className="w-4.5 h-4.5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-[13px]">خصوصية الاستوديو</h3>
          <p className="text-[10.5px] text-muted-foreground mt-0.5 leading-relaxed">
            صفر تخزين: ما تكتبه وما يُولَّد يبقى في هذه الشاشة فقط، ويُرسل للمزوّد لهذا الطلب وحده.
            لكل أداة حد استخدام يومي معلن.
          </p>
        </div>
      </Card>
    </div>
  );
}
