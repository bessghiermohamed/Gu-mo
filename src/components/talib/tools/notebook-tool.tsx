"use client";

/**
 * أدواتي — «دفتر طالب» (الجولة 87) — مساحة دراسية بأسلوب NotebookLM.
 *
 * الطالب يبني دفتره من مصادره الخاصة (لصق نص، ملفات .txt/.md، أو استخراج
 * نص PDF داخل جهازه عبر pdfjs — نفس عُرف أدوات الملفات)، ثم:
 *   • يحادث المقتطفات بحديث مُسنَد باستشهاد صادق [م1] — الاسترجاع محلي
 *     في متصفحه (src/lib/ai/notebook.ts نفسها) فلا يسافر إلا المقتطف
 *     المختار لهذا السؤال، ويُنسى فور الجواب.
 *   • يولّد مخرجات دراسية: ملخّص، دليل دراسة، اختبار تفاعلي، بطاقات
 *     استذكار، خط زمني، أسئلة شائعة، ملخّص صوتي حواري (يُقرأ بصوت
 *     المتصفح speechSynthesis — صفر مزوّد صوت)، وخريطة ذهنية Mermaid.
 *
 * الخصوصية: المصادر والحديث يعيشان في localStorage على جهاز الطالب فقط
 * (نفس فلسفة تاريخ المساعد الذكي) — صفر حمل على Supabase، وحذف المصدر
 * يُطفئ أثره نهائياً من الجهاز.
 *
 * needsConfig بنفس عُرف المساعد: بلا مفاتيح على الخادم → المالك يرى
 * تعليمات الإعداد والطالب يرى «قريباً».
 */

import * as React from "react";
import {
  AudioLines,
  BookOpenText,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Clock,
  Download,
  FileText,
  GraduationCap,
  HelpCircle,
  Layers,
  LibraryBig,
  ListTree,
  Loader2,
  MessageCircle,
  MessageSquarePlus,
  NotebookPen,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Send,
  Shuffle,
  Square,
  Trash2,
  TriangleAlert,
  Upload,
  X,
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { cn } from "@/lib/utils";
import { loadPdfJs, pickFiles, downloadBlob, nextPaint, friendlyFileError } from "./shared";
import {
  ARTIFACT_CATALOG,
  type ArtifactAction,
  type ArtifactResult,
  type QuizQuestion,
  type RetrievalSource,
  MAX_SOURCES,
  SOURCE_MAX_CHARS,
  QUESTION_MAX_CHARS,
  CHAT_HISTORY_MAX_TURNS,
  retrieveExcerpts,
  buildStudyCorpus,
  formatArtifactMarkdown,
} from "@/lib/ai/notebook";

// ---------------------------------------------------------------------------
// Types & storage (device-local notebook — Gu-mo never stores sources)
// ---------------------------------------------------------------------------

interface NotebookSource {
  id: string;
  title: string;
  content: string;
  addedAt: number;
  enabled: boolean;
}

interface NotebookChatMsg {
  role: "user" | "assistant";
  content: string;
  ts: number;
  provider?: string;
  model?: string;
}

interface NotebookState {
  sources: NotebookSource[];
  chat: NotebookChatMsg[];
}

const STORAGE_PREFIX = "talib-notebook-v1-";
const MAX_CHAT_MSGS = 60;

function emptyNotebook(): NotebookState {
  return { sources: [], chat: [] };
}

function loadState(userId: number): NotebookState {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + userId);
    if (!raw) return emptyNotebook();
    const p = JSON.parse(raw) as Partial<NotebookState>;
    const sources = Array.isArray(p.sources)
      ? p.sources
          .filter((s) => s && typeof s.id === "string" && typeof s.content === "string")
          .map((s) => ({
            id: s.id,
            title: typeof s.title === "string" && s.title.trim() ? s.title.slice(0, 120) : "مصدر",
            content: s.content,
            addedAt: typeof s.addedAt === "number" ? s.addedAt : 0,
            enabled: s.enabled !== false,
          }))
      : [];
    const chat = Array.isArray(p.chat)
      ? p.chat.filter(
          (m) =>
            m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string" &&
            m.content.trim().length > 0
        )
      : [];
    return { sources, chat };
  } catch {
    return emptyNotebook();
  }
}

function saveState(userId: number, state: NotebookState) {
  try {
    localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(state));
  } catch {
    /* storage quota — non-fatal, keeps working in memory for this visit */
  }
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatChars(n: number): string {
  return `${n.toLocaleString("en-US")} حرف`;
}

function fileTitle(name: string): string {
  return name.replace(/\.(txt|md|markdown|pdf)$/i, "").replace(/[_-]+/g, " ").trim().slice(0, 120) || "مصدر";
}

// ---------------------------------------------------------------------------
// Markdown rendering (answers) — same recipe as the AI assistant
// ---------------------------------------------------------------------------

const markdownComponents: Components = {
  p: (props) => <p className="my-1.5 leading-relaxed first:mt-0 last:mb-0" {...props} />,
  h1: (props) => <h1 className="text-base font-black my-2" {...props} />,
  h2: (props) => <h2 className="text-[15px] font-black my-2" {...props} />,
  h3: (props) => <h3 className="text-sm font-black my-1.5" {...props} />,
  ul: (props) => <ul className="list-disc ps-5 my-1.5 space-y-1" {...props} />,
  ol: (props) => <ol className="list-decimal ps-5 my-1.5 space-y-1" {...props} />,
  li: (props) => <li className="leading-relaxed" {...props} />,
  strong: (props) => <strong className="font-extrabold" {...props} />,
  a: (props) => (
    <a
      target="_blank"
      rel="noreferrer"
      className="text-emerald-600 dark:text-emerald-400 underline underline-offset-2"
      {...props}
    />
  ),
  blockquote: (props) => (
    <blockquote className="border-s-2 border-emerald-400/50 ps-3 my-2 text-muted-foreground" {...props} />
  ),
  code: ({ className, children, ...props }) => (
    <code
      className={cn("font-mono text-[0.85em] bg-muted/70 rounded-md px-1.5 py-0.5 break-words", className)}
      {...props}
    >
      {children}
    </code>
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
// needsConfig — same convention as the assistant (owner setup / student soon)
// ---------------------------------------------------------------------------

function NeedsConfigCard({ isOwner }: { isOwner: boolean }) {
  return (
    <div className="flex-1 overflow-y-auto flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-5 space-y-3 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/10 flex items-center justify-center">
          <NotebookPen className="w-7 h-7 text-emerald-600" />
        </div>
        <h3 className="font-black text-sm">دفتر طالب غير مفعّل بعد</h3>
        {isOwner ? (
          <>
            <p className="text-xs text-muted-foreground leading-relaxed">
              الدفتر يعمل بسلسلة المزوّدين نفسها (Groq ← Gemini ← Grok). أضف أحد المفاتيح في Vercel
              (Settings → Environment Variables) ثم أعد النشر — إن كان المساعد الذكي يعمل فالدفتر
              يعمل فوراً بلا أي إعداد إضافي.
            </p>
            <div className="text-right space-y-2">
              <pre dir="ltr" className="text-[11px] font-mono bg-muted/60 rounded-lg p-2 overflow-x-auto">
                GROQ_API_KEY=gsk_…
              </pre>
              <pre dir="ltr" className="text-[11px] font-mono bg-muted/60 rounded-lg p-2 overflow-x-auto">
                GEMINI_API_KEY=AIza…
              </pre>
              <pre dir="ltr" className="text-[11px] font-mono bg-muted/60 rounded-lg p-2 overflow-x-auto">
                XAI_API_KEY=xai-…
              </pre>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground leading-relaxed">
            يجهّز فريق المنصة هذه الخدمة حالياً — ستجدها جاهزة قريباً بإذن الله.
          </p>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PDF text extraction (on-device, same worker contract as أدوات الملفات)
// ---------------------------------------------------------------------------

async function extractPdfText(
  file: File,
  onProgress: (page: number, pages: number) => void
): Promise<string> {
  const pdfjs = await loadPdfJs();
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages = doc.numPages;
  const out: string[] = [];
  for (let i = 1; i <= pages; i++) {
    onProgress(i, pages);
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const text = tc.items
      .map((it) => (it as { str?: string }).str ?? "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) out.push(text);
    await nextPaint();
  }
  return out.join("\n\n");
}

// ---------------------------------------------------------------------------
// المصادر — إضافة/تفعيل/حذف (كل شيء داخل الجهاز)
// ---------------------------------------------------------------------------

function SourcesView({
  sources,
  onAdd,
  onToggle,
  onDelete,
  onClearAll,
}: {
  sources: NotebookSource[];
  onAdd: (title: string, content: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}) {
  const [pasteOpen, setPasteOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [pdfBusy, setPdfBusy] = React.useState<string | null>(null);
  const [confirmClear, setConfirmClear] = React.useState(false);

  React.useEffect(() => {
    if (!confirmClear) return;
    const t = setTimeout(() => setConfirmClear(false), 3000);
    return () => clearTimeout(t);
  }, [confirmClear]);

  const full = sources.length >= MAX_SOURCES;

  function addPaste() {
    const t = title.trim() || "مصدر ملصوق";
    const c = content.trim();
    if (c.length < 40) {
      toast.error("النص قصير جداً — الصق محتوى درساً حقيقياً (٤٠ حرفاً على الأقل).");
      return;
    }
    const cut = c.slice(0, SOURCE_MAX_CHARS);
    if (cut.length < c.length) toast.info(`النص أطول من الحد — قُصّ إلى ${formatChars(SOURCE_MAX_CHARS)}.`);
    onAdd(t, cut);
    setTitle("");
    setContent("");
    setPasteOpen(false);
  }

  async function addTextFiles() {
    const files = await pickFiles(".txt,.md,.markdown,text/plain", true);
    for (const f of files) {
      try {
        const text = await f.text();
        const clean = text.trim().slice(0, SOURCE_MAX_CHARS);
        if (clean.length < 40) {
          toast.error(`«${f.name}» فارغ أو قصير جداً.`);
          continue;
        }
        onAdd(fileTitle(f.name), clean);
      } catch {
        toast.error(`تعذّرت قراءة «${f.name}».`);
      }
    }
  }

  async function addPdfFiles() {
    const files = await pickFiles(".pdf,application/pdf", true);
    for (const f of files) {
      setPdfBusy(`جارٍ استخراج «${f.name}»…`);
      try {
        const text = await extractPdfText(f, (page, pages) => setPdfBusy(`جارٍ استخراج «${f.name}» — صفحة ${page} من ${pages}…`));
        const clean = text.trim().slice(0, SOURCE_MAX_CHARS);
        if (clean.length < 40) {
          toast.error(`«${f.name}»: لم يُعثر على نص قابل للاستخراج (قد يكون ماسوحاً ضوئياً — استعمل أداة «صورة إلى نص»).`);
          continue;
        }
        if (clean.length < text.trim().length) toast.info(`«${f.name}» أطول من الحد — قُصّ إلى ${formatChars(SOURCE_MAX_CHARS)}.`);
        onAdd(fileTitle(f.name), clean);
      } catch (err) {
        toast.error(friendlyFileError(err, `تعذّر استخراج «${f.name}».`));
      } finally {
        setPdfBusy(null);
      }
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto w-full px-3 py-4 space-y-3">
        {/* Add actions */}
        <Card className="p-3 space-y-2.5">
          <div className="flex items-center gap-2 text-[13px] font-black">
            <Plus className="w-4 h-4 text-emerald-600" />
            أضف مصدراً
            <span className="text-[11px] font-normal text-muted-foreground">
              ({sources.length}/{MAX_SOURCES})
            </span>
          </div>
          {full ? (
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              بلغت أقصى عدد للمصادر ({MAX_SOURCES}) — احذف مصدراً لتضيف غيره.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Button
                variant="outline"
                className="h-10 rounded-xl border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-700"
                onClick={() => setPasteOpen((v) => !v)}
                disabled={full}
              >
                <ClipboardCopy className="w-4 h-4 me-1.5" />
                لصق نص
              </Button>
              <Button
                variant="outline"
                className="h-10 rounded-xl border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-700"
                onClick={() => void addTextFiles()}
                disabled={full}
              >
                <FileText className="w-4 h-4 me-1.5" />
                ملف نصي
              </Button>
              <Button
                variant="outline"
                className="h-10 rounded-xl border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-700"
                onClick={() => void addPdfFiles()}
                disabled={full || !!pdfBusy}
              >
                {pdfBusy ? <Loader2 className="w-4 h-4 me-1.5 animate-spin" /> : <Upload className="w-4 h-4 me-1.5" />}
                ملف PDF
              </Button>
            </div>
          )}
          {pdfBusy && <p className="text-[11px] text-muted-foreground">{pdfBusy}</p>}

          {pasteOpen && !full && (
            <div className="space-y-2 pt-1">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 120))}
                placeholder="عنوان المصدر (مثال: محاضرة ٣ — التركيبات)"
                className="h-10 rounded-xl bg-muted/40"
              />
              <Textarea
                dir="auto"
                value={content}
                onChange={(e) => setContent(e.target.value.slice(0, SOURCE_MAX_CHARS + 1000))}
                placeholder="الصق محتوى الدرس هنا…"
                rows={7}
                className="rounded-xl bg-muted/40 text-sm leading-relaxed resize-y"
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{formatChars(content.trim().length)}</span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="h-8 rounded-lg" onClick={() => setPasteOpen(false)}>
                    إلغاء
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={addPaste}
                    disabled={!content.trim()}
                  >
                    إضافة إلى الدفتر
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Sources list */}
        {sources.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/10 flex items-center justify-center">
              <LibraryBig className="w-7 h-7 text-emerald-600" />
            </div>
            <p className="font-bold text-sm">دفترك فارغ بعد</p>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-xs mx-auto">
              أضف درساً أو محاضرة أو ملخصاً — وسيصبح الدفتر مساعدك الشخصي فيه: يحادثك منه، يلخّصه،
              ويختبرك فيه. كل شيء يبقى على جهازك.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {sources.map((s) => (
                <Card key={s.id} className={cn("p-3 flex items-center gap-3", !s.enabled && "opacity-60")}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={s.enabled}
                    aria-label={s.enabled ? `تعطيل ${s.title}` : `تفعيل ${s.title}`}
                    onClick={() => onToggle(s.id)}
                    className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      s.enabled
                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {s.enabled ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold truncate">{s.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {formatChars(s.content.length)} · أُضيف{" "}
                      {new Date(s.addedAt).toLocaleDateString("ar", { day: "numeric", month: "short" })}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`حذف ${s.title}`}
                    onClick={() => onDelete(s.id)}
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground/50 hover:text-red-500 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </Card>
              ))}
            </div>
            <div className="flex items-center justify-between px-1">
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                المصادر المُفعَّلة فقط تُستعمل في الحديث والمخرجات — وكل المحتوى يبقى في جهازك.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 shrink-0 rounded-lg",
                  confirmClear ? "text-red-600 hover:text-red-600 bg-red-500/10" : "text-muted-foreground"
                )}
                onClick={() => {
                  if (confirmClear) {
                    onClearAll();
                    setConfirmClear(false);
                  } else {
                    setConfirmClear(true);
                  }
                }}
              >
                <Trash2 className="w-3.5 h-3.5 me-1" />
                {confirmClear ? "اضغط مجدداً للتأكيد" : "تفريغ الدفتر"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// الملخّص الصوتي — قراءة حوار بصوت المتصفح (speechSynthesis — صفر مزوّد)
// ---------------------------------------------------------------------------

function AudioOverviewPlayer({ segments }: { segments: Array<{ speaker: string; text: string }> }) {
  const [supported, setSupported] = React.useState(true);
  const [voiceReady, setVoiceReady] = React.useState(false);
  const [arabicVoice, setArabicVoice] = React.useState<SpeechSynthesisVoice | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  const [current, setCurrent] = React.useState(-1);
  const idxRef = React.useRef(0);
  const stopFlagRef = React.useRef(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSupported(false);
      return;
    }
    const synth = window.speechSynthesis;
    const pick = () => {
      const voices = synth.getVoices();
      const ar = voices.find((v) => v.lang?.toLowerCase().startsWith("ar")) ?? null;
      setArabicVoice(ar);
      setVoiceReady(true);
    };
    pick();
    synth.addEventListener?.("voiceschanged", pick);
    return () => {
      synth.removeEventListener?.("voiceschanged", pick);
      synth.cancel();
    };
  }, []);

  function speakFrom(startIdx: number) {
    if (!supported) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    stopFlagRef.current = false;
    idxRef.current = startIdx;
    setPlaying(true);
    setPaused(false);
    setCurrent(startIdx);

    const speakNext = () => {
      if (stopFlagRef.current) return;
      const i = idxRef.current;
      if (i >= segments.length) {
        setPlaying(false);
        setPaused(false);
        setCurrent(-1);
        return;
      }
      setCurrent(i);
      const u = new SpeechSynthesisUtterance(segments[i].text);
      if (arabicVoice) {
        u.voice = arabicVoice;
        u.lang = arabicVoice.lang;
      } else {
        u.lang = "ar";
      }
      u.rate = 1;
      u.onend = () => {
        if (stopFlagRef.current) return;
        idxRef.current = i + 1;
        speakNext();
      };
      u.onerror = () => {
        if (stopFlagRef.current) return;
        idxRef.current = i + 1;
        speakNext();
      };
      synth.speak(u);
    };
    speakNext();
  }

  function pause() {
    if (!supported) return;
    window.speechSynthesis.pause();
    setPaused(true);
  }

  function resume() {
    if (!supported) return;
    window.speechSynthesis.resume();
    setPaused(false);
  }

  function stop() {
    if (!supported) return;
    stopFlagRef.current = true;
    window.speechSynthesis.cancel();
    setPlaying(false);
    setPaused(false);
    setCurrent(-1);
  }

  if (!supported) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
        <TriangleAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          متصفحك لا يدعم القراءة الصوتية — يمكنك قراءة نص الحوار أدناه أو نسخه.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <AudioLines className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-[12px] font-bold flex-1">تشغيل الحوار بصوت جهازك</p>
          {playing ? (
            <div className="flex gap-1.5">
              {paused ? (
                <Button
                  size="sm"
                  className="h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={resume}
                  aria-label="متابعة"
                >
                  <Play className="w-3.5 h-3.5 me-1" />
                  متابعة
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-lg border-emerald-500/40"
                  onClick={pause}
                  aria-label="إيقاف مؤقت"
                >
                  <Pause className="w-3.5 h-3.5 me-1" />
                  إيقاف مؤقت
                </Button>
              )}
              <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={stop} aria-label="إيقاف">
                <Square className="w-3.5 h-3.5 me-1" />
                إيقاف
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              className="h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => speakFrom(0)}
              disabled={!voiceReady}
              aria-label="تشغيل الملخص الصوتي"
            >
              <Play className="w-3.5 h-3.5 me-1" />
              تشغيل
            </Button>
          )}
        </div>
        {voiceReady && !arabicVoice && (
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            لم يُعثر على صوت عربي في جهازك — ستكون القراءة بصوت افتراضي وقد تكون أقل جودة.
          </p>
        )}
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          القراءة تتم داخل جهازك بمحرّك المتصفح نفسه — لا يُرسل أي شيء لأي خدمة صوت.
        </p>
      </div>

      <div className="space-y-2">
        {segments.map((s, i) => (
          <div
            key={i}
            className={cn(
              "rounded-xl border p-2.5 transition-colors duration-200",
              current === i ? "border-emerald-500/50 bg-emerald-500/10" : "border-border bg-muted/30"
            )}
          >
            <p className="text-[11px] font-black text-emerald-700 dark:text-emerald-400 mb-0.5">{s.speaker}</p>
            <p className="text-[13px] leading-relaxed">{s.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// الحديث المُسنَد — فقاعات + بث حي (نفس عقد /api/ai)
// ---------------------------------------------------------------------------

interface ProviderMeta {
  provider: string;
  model: string;
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1.5" aria-label="الدفتر يكتب">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}

const CHAT_SUGGESTIONS = [
  "لخّص لي أهم نقاط مصادري في نقاط قصيرة",
  "اشرح أصعب مفهوم في مصادري ببساطة ومثال",
  "ما الأسئلة المتوقعة في الامتحان من مصادري؟",
  "اذكر المصطلحات المفتاحية في مصادري مع شرح سريع لكل واحد",
];

function ChatView({
  messages,
  streaming,
  streamText,
  meta,
  errorBubble,
  hasSources,
  isOwner,
  onSend,
  onStop,
  onRetry,
  onNewChat,
  onGoSources,
}: {
  messages: NotebookChatMsg[];
  streaming: boolean;
  streamText: string;
  meta: ProviderMeta | null;
  errorBubble: { message: string; hint?: string } | null;
  hasSources: boolean;
  isOwner: boolean;
  onSend: (q: string) => void;
  onStop: () => void;
  onRetry: () => void;
  onNewChat: () => void;
  onGoSources: () => void;
}) {
  const [input, setInput] = React.useState("");
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  const lastLen = messages.length + (streamText ? 1 : 0) + (errorBubble ? 1 : 0);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastLen, streamText]);

  function autoResize() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }

  function send() {
    const q = input.trim();
    if (!q || streaming) return;
    setInput("");
    requestAnimationFrame(autoResize);
    onSend(q);
  }

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 && !streaming && !errorBubble ? (
          <div className="max-w-xl mx-auto w-full px-4 h-full flex flex-col items-center justify-center gap-4 py-8 text-center">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-emerald-600/20">
              <NotebookPen className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-black">حديثك يبدأ من مصادرك</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {hasSources
                  ? "اسأل عن ما فيه — الجواب يستند إلى مصادرك فقط مع الإشارة إلى موضع المعلومة [م1]."
                  : "أضف مصدراً واحداً على الأقل (درس، محاضرة، ملخص) وسيصبح الدفتر يسأل منه ويجيبك منه."}
              </p>
            </div>
            {!hasSources ? (
              <Button
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                onClick={onGoSources}
              >
                <Plus className="w-4 h-4 me-1.5" />
                أضف أول مصدر
              </Button>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                {CHAT_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onSend(s)}
                    className="text-start rounded-xl border border-border p-3 text-[12px] leading-relaxed hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-3xl mx-auto w-full px-3 py-4 space-y-4 pb-6">
            {messages.map((m, i) => {
              const isUser = m.role === "user";
              return (
                <div key={m.ts + "-" + i} className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}>
                  {!isUser && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-600 to-teal-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                      <NotebookPen className="w-4 h-4" />
                    </div>
                  )}
                  <div className={cn("min-w-0", isUser ? "max-w-[85%] sm:max-w-[75%]" : "max-w-[90%] sm:max-w-[80%]")}>
                    <div
                      className={cn(
                        "px-4 py-2.5 text-sm leading-relaxed shadow-sm",
                        isUser
                          ? "bg-emerald-600 text-white rounded-2xl rounded-se-sm whitespace-pre-wrap break-words"
                          : "bg-muted/70 border border-border rounded-2xl rounded-ss-sm"
                      )}
                    >
                      {isUser ? m.content : <MarkdownContent content={m.content} />}
                    </div>
                    {!isUser && (
                      <div className="flex items-center gap-1 mt-1 px-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            navigator.clipboard
                              .writeText(m.content)
                              .then(() => toast.success("نُسخت الإجابة"))
                              .catch(() => toast.error("تعذّر النسخ — انسخ النص يدوياً"));
                          }}
                        >
                          <ClipboardCopy className="w-3 h-3 me-1" />
                          نسخ
                        </Button>
                        {isOwner && m.provider && (
                          <span className="text-[10px] text-muted-foreground/60 ms-1 truncate" dir="ltr">
                            {m.provider} · {m.model}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {streaming && (
              <div className="flex gap-2 justify-start">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-600 to-teal-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  <NotebookPen className="w-4 h-4" />
                </div>
                <div className="min-w-0 max-w-[90%] sm:max-w-[80%]">
                  <div className="px-4 py-2.5 text-sm leading-relaxed bg-muted/70 border border-border rounded-2xl rounded-ss-sm">
                    {streamText ? (
                      <MarkdownContent content={streamText} />
                    ) : (
                      <TypingDots />
                    )}
                  </div>
                  {isOwner && meta && (
                    <span className="text-[10px] text-muted-foreground/60 px-1 mt-1 inline-block" dir="ltr">
                      {meta.provider} · {meta.model}
                    </span>
                  )}
                </div>
              </div>
            )}
            {errorBubble && (
              <Card className="p-3 space-y-2 border-red-500/30 bg-red-500/5">
                <div className="flex items-start gap-2">
                  <TriangleAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-red-600 dark:text-red-400">{errorBubble.message}</p>
                    {errorBubble.hint && (
                      <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed" dir="auto">
                        {errorBubble.hint}
                      </p>
                    )}
                  </div>
                </div>
                <Button variant="outline" size="sm" className="h-8 rounded-lg" onClick={onRetry}>
                  <RefreshCw className="w-3.5 h-3.5 me-1" />
                  إعادة المحاولة
                </Button>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t bg-background/95 backdrop-blur p-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              dir="auto"
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value.slice(0, QUESTION_MAX_CHARS));
                autoResize();
              }}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !(e.nativeEvent as KeyboardEvent).isComposing &&
                  window.matchMedia("(min-width: 768px)").matches
                ) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={hasSources ? "اسأل من مصادرك… (Shift+Enter لسطر جديد)" : "أضف مصدراً أولاً ثم اسأل…"}
              disabled={!hasSources}
              className="flex-1 resize-none rounded-2xl border border-border bg-muted/30 px-4 py-3 text-sm leading-relaxed outline-none focus:border-emerald-500 max-h-36 placeholder:text-muted-foreground/70 disabled:opacity-60"
            />
            {streaming ? (
              <Button
                size="icon"
                onClick={onStop}
                className="h-11 w-11 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white shrink-0"
                aria-label="إيقاف التوليد"
              >
                <Square className="w-4 h-4 fill-current" />
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={send}
                disabled={!input.trim() || !hasSources}
                className="h-11 w-11 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 disabled:opacity-40"
                aria-label="إرسال"
              >
                <Send className={cn("w-4 h-4", rtlFlip())} />
              </Button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            الدفتر يجيب من مصادرك فقط وقد يخطئ في الفهم — راجع الموضع المستشهد به [م1]. لا ترسل بيانات شخصية.
          </p>
        </div>
      </div>
    </>
  );

  function rtlFlip(): string {
    return "-scale-x-100";
  }
}

// ---------------------------------------------------------------------------
// عرض المخرجات — اختبار تفاعلي وبطاقات وخريطة ذهنية وغيرها
// ---------------------------------------------------------------------------

const OPTION_LABELS = ["أ", "ب", "ج", "د"];

function QuizView({ questions }: { questions: QuizQuestion[] }) {
  const [answers, setAnswers] = React.useState<Array<number | null>>(() => questions.map(() => null));
  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    setAnswers(questions.map(() => null));
    setSubmitted(false);
  }, [questions]);

  const score = questions.reduce((acc, q, i) => acc + (answers[i] === q.correctIndex ? 1 : 0), 0);

  return (
    <div className="space-y-3">
      {submitted && (
        <div
          className={cn(
            "rounded-xl border p-3 text-center font-black text-sm",
            score === questions.length
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-border bg-muted/40"
          )}
        >
          نتيجتك: {score} من {questions.length}
          {score === questions.length ? " — ممتاز! إتقان كامل." : " — راجع الشروحات أدناه ثم أعد المحاولة."}
        </div>
      )}
      {questions.map((q, i) => {
        const picked = answers[i];
        return (
          <Card key={i} className="p-3 space-y-2">
            <p className="text-[13px] font-bold leading-relaxed">
              {i + 1}. {q.question}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {q.options.map((opt, j) => {
                const isPicked = picked === j;
                const isCorrect = q.correctIndex === j;
                return (
                  <button
                    key={j}
                    type="button"
                    aria-pressed={isPicked}
                    disabled={submitted}
                    onClick={() => setAnswers((prev) => prev.map((a, k) => (k === i ? j : a)))}
                    className={cn(
                      "text-start rounded-xl border px-3 py-2 text-[12px] leading-relaxed transition-colors duration-200 cursor-pointer disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      !submitted && isPicked && "border-emerald-500/60 bg-emerald-500/10 font-bold",
                      !submitted && !isPicked && "hover:border-emerald-500/40 hover:bg-emerald-500/5",
                      submitted && isCorrect && "border-emerald-500/60 bg-emerald-500/10 font-bold",
                      submitted && isPicked && !isCorrect && "border-red-500/60 bg-red-500/10",
                      submitted && !isCorrect && !isPicked && "opacity-60"
                    )}
                  >
                    <span className="font-black me-1.5">{OPTION_LABELS[j] ?? j + 1}.</span>
                    {opt}
                  </button>
                );
              })}
            </div>
            {submitted && q.explanation && (
              <p className="text-[11px] text-muted-foreground leading-relaxed rounded-lg bg-muted/50 p-2">
                <span className="font-bold">التوضيح: </span>
                {q.explanation}
              </p>
            )}
          </Card>
        );
      })}
      {submitted ? (
        <Button
          variant="outline"
          className="w-full h-10 rounded-xl"
          onClick={() => {
            setAnswers(questions.map(() => null));
            setSubmitted(false);
          }}
        >
          <RefreshCw className="w-4 h-4 me-1.5" />
          إعادة الاختبار
        </Button>
      ) : (
        <Button
          className="w-full h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
          onClick={() => setSubmitted(true)}
          disabled={answers.some((a) => a === null)}
        >
          <Check className="w-4 h-4 me-1.5" />
          {answers.some((a) => a === null) ? "أجب عن كل الأسئلة أولاً" : "صحّح إجاباتي"}
        </Button>
      )}
    </div>
  );
}

function FlashcardsView({ cards }: { cards: Array<{ front: string; back: string }> }) {
  const [deck, setDeck] = React.useState(cards);
  const [idx, setIdx] = React.useState(0);
  const [flipped, setFlipped] = React.useState(false);

  React.useEffect(() => {
    setDeck(cards);
    setIdx(0);
    setFlipped(false);
  }, [cards]);

  const card = deck[idx];
  if (!card) return null;

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setFlipped((v) => !v)}
        aria-label={flipped ? "إظهار الوجه" : "إظهار الخلف"}
        className="w-full min-h-40 rounded-2xl border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 p-5 text-center cursor-pointer hover:border-emerald-500/70 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring flex flex-col items-center justify-center gap-2"
      >
        {!flipped ? (
          <>
            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wide">الوجه</span>
            <span className="text-base font-black leading-relaxed">{card.front}</span>
            <span className="text-[10px] text-muted-foreground">اضغط لتكشف الجواب</span>
          </>
        ) : (
          <>
            <span className="text-[10px] font-black text-teal-600 uppercase tracking-wide">الخلف</span>
            <span className="text-sm leading-relaxed">{card.back}</span>
          </>
        )}
      </button>
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-9 rounded-lg"
          onClick={() => {
            setIdx((v) => Math.max(0, v - 1));
            setFlipped(false);
          }}
          disabled={idx === 0}
        >
          <ChevronRight className="w-4 h-4 me-1" />
          السابقة
        </Button>
        <span className="text-[11px] font-bold text-muted-foreground">
          {idx + 1} / {deck.length}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-9 rounded-lg"
          onClick={() => {
            setIdx((v) => Math.min(deck.length - 1, v + 1));
            setFlipped(false);
          }}
          disabled={idx === deck.length - 1}
        >
          التالية
          <ChevronLeft className="w-4 h-4 ms-1" />
        </Button>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 rounded-lg mx-auto block text-muted-foreground"
        onClick={() => {
          const shuffled = [...deck];
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }
          setDeck(shuffled);
          setIdx(0);
          setFlipped(false);
          toast.success("خُلطت البطاقات");
        }}
      >
        <Shuffle className="w-3.5 h-3.5 me-1" />
        خلط البطاقات
      </Button>
    </div>
  );
}

function MindmapView({ code }: { code: string }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
        <ListTree className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          للعرض البياني: انسخ الكود أو نزّله ثم افتح{" "}
          <a
            href="https://mermaid.live"
            target="_blank"
            rel="noreferrer"
            className="text-emerald-600 dark:text-emerald-400 underline underline-offset-2"
          >
            mermaid.live
          </a>{" "}
          أو أي محرر يدعم Mermaid (GitHub، Obsidian…) والصقه.
        </p>
      </div>
      <pre dir="ltr" className="text-left bg-zinc-900 dark:bg-zinc-950 text-zinc-100 rounded-xl p-3 overflow-x-auto text-xs leading-relaxed">
        {code}
      </pre>
      <Button
        variant="outline"
        className="w-full h-10 rounded-xl"
        onClick={() => {
          downloadBlob(new Blob([code], { type: "text/plain;charset=utf-8" }), "دفتر-طالب-خريطة-ذهنية.mmd");
          toast.success("نُزّل الملف");
        }}
      >
        <Download className="w-4 h-4 me-1.5" />
        تنزيل ملف ‎.mmd
      </Button>
    </div>
  );
}

const ARTIFACT_ICONS: Record<ArtifactAction, React.ReactNode> = {
  summary: <FileText className="w-5 h-5" />,
  "study-guide": <GraduationCap className="w-5 h-5" />,
  quiz: <HelpCircle className="w-5 h-5" />,
  flashcards: <Layers className="w-5 h-5" />,
  timeline: <Clock className="w-5 h-5" />,
  faq: <MessageCircle className="w-5 h-5" />,
  "audio-script": <AudioLines className="w-5 h-5" />,
  mindmap: <BookOpenText className="w-5 h-5" />,
};

function ArtifactResultView({
  result,
  provider,
  model,
  isOwner,
}: {
  result: ArtifactResult;
  provider?: string;
  model?: string;
  isOwner: boolean;
}) {
  const meta = ARTIFACT_CATALOG.find((c) => c.action === result.kind);

  function copyMd() {
    const md = formatArtifactMarkdown(result);
    navigator.clipboard
      .writeText(md)
      .then(() => toast.success("نُسخ المخرج كاملاً"))
      .catch(() => toast.error("تعذّر النسخ — انسخ النص يدوياً"));
  }

  function downloadMd() {
    if (result.kind === "mindmap") return; // للخريطة زرها الخاص بامتداد .mmd
    const md = formatArtifactMarkdown(result);
    downloadBlob(new Blob([md], { type: "text/markdown;charset=utf-8" }), `دفتر-طالب-${result.kind}.md`);
    toast.success("نُزّل الملف");
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
          {ARTIFACT_ICONS[result.kind]}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-black text-sm truncate">{meta?.label ?? "المخرج"}</h3>
          {isOwner && provider && (
            <span className="text-[10px] text-muted-foreground/60" dir="ltr">
              {provider} · {model ?? ""}
            </span>
          )}
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-8 px-2 text-[11px]" onClick={copyMd}>
            <ClipboardCopy className="w-3.5 h-3.5 me-1" />
            نسخ
          </Button>
          {result.kind !== "mindmap" && (
            <Button variant="ghost" size="sm" className="h-8 px-2 text-[11px]" onClick={downloadMd}>
              <Download className="w-3.5 h-3.5 me-1" />
              تنزيل
            </Button>
          )}
        </div>
      </div>

      {result.kind === "summary" && (
        <div className="space-y-2.5">
          {result.data.title && <h4 className="font-black text-[15px]">{result.data.title}</h4>}
          <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{result.data.summary}</p>
          <div className="rounded-xl bg-muted/40 p-3">
            <p className="text-[11px] font-black text-emerald-700 dark:text-emerald-400 mb-1.5">أهم النقاط</p>
            <ul className="list-disc ps-5 space-y-1">
              {result.data.keyPoints.map((p, i) => (
                <li key={i} className="text-[12.5px] leading-relaxed">
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {result.kind === "study-guide" && (
        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-black text-emerald-700 dark:text-emerald-400 mb-1.5">المفاهيم المفتاحية</p>
            <div className="space-y-1.5">
              {result.data.concepts.map((c, i) => (
                <div key={i} className="rounded-xl bg-muted/40 p-2.5">
                  <span className="text-[12.5px] font-black">{c.term}</span>
                  <span className="text-[12.5px] text-muted-foreground"> — {c.definition}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-black text-emerald-700 dark:text-emerald-400 mb-1.5">أسئلة بنماذج إجابة</p>
            <ol className="list-decimal ps-5 space-y-2">
              {result.data.questions.map((q, i) => (
                <li key={i} className="text-[12.5px] leading-relaxed">
                  <span className="font-bold">{q.question}</span>
                  <span className="block text-muted-foreground mt-0.5">{q.answer}</span>
                </li>
              ))}
            </ol>
          </div>
          {result.data.tips.length > 0 && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
              <p className="text-[11px] font-black text-emerald-700 dark:text-emerald-400 mb-1">نصائح</p>
              <ul className="list-disc ps-5 space-y-1">
                {result.data.tips.map((t, i) => (
                  <li key={i} className="text-[12px] leading-relaxed">
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {result.kind === "quiz" && <QuizView questions={result.data.questions} />}
      {result.kind === "flashcards" && <FlashcardsView cards={result.data.cards} />}

      {result.kind === "timeline" && (
        <div className="relative space-y-3 ps-4">
          <div className="absolute inset-y-1 start-[7px] w-0.5 bg-emerald-500/30 rounded" aria-hidden="true" />
          {result.data.events.map((e, i) => (
            <div key={i} className="relative">
              <div className="absolute -start-4 top-1.5 w-3.5 h-3.5 rounded-full bg-emerald-600 border-2 border-background" aria-hidden="true" />
              <p className="text-[13px] font-black">{e.label}</p>
              <p className="text-[12px] text-muted-foreground leading-relaxed mt-0.5">{e.detail}</p>
            </div>
          ))}
        </div>
      )}

      {result.kind === "faq" && (
        <div className="space-y-2">
          {result.data.items.map((it, i) => (
            <div key={i} className="rounded-xl border border-border p-3">
              <p className="text-[13px] font-bold">س: {it.question}</p>
              <p className="text-[12.5px] text-muted-foreground leading-relaxed mt-1">ج: {it.answer}</p>
            </div>
          ))}
        </div>
      )}

      {result.kind === "audio-script" && <AudioOverviewPlayer segments={result.data.segments} />}
      {result.kind === "mindmap" && <MindmapView code={result.data.code} />}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// أدوات الدراسة — شبكة الكتالوج + نتيجة
// ---------------------------------------------------------------------------

function ToolsView({
  hasSources,
  running,
  result,
  error,
  onRun,
  onClose,
  isOwner,
  onGoSources,
}: {
  hasSources: boolean;
  running: ArtifactAction | null;
  result: { result: ArtifactResult; provider?: string; model?: string } | null;
  error: string | null;
  onRun: (action: ArtifactAction) => void;
  onClose: () => void;
  isOwner: boolean;
  onGoSources: () => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto w-full px-3 py-4 space-y-3">
        {!hasSources ? (
          <Card className="p-6 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/10 flex items-center justify-center">
              <LibraryBig className="w-7 h-7 text-emerald-600" />
            </div>
            <p className="font-bold text-sm">تحتاج مصدراً أولاً</p>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-sm mx-auto">
              كل المخرجات تُبنى من مصادرك أنت — أضف درساً أو ملخصاً وستتحول هذه الأزرار إلى مولّدات
              تعمل على محتواك.
            </p>
            <Button className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold" onClick={onGoSources}>
              <Plus className="w-4 h-4 me-1.5" />
              أضف مصدراً
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {ARTIFACT_CATALOG.map((c) => {
              const busy = running === c.action;
              return (
                <button
                  key={c.action}
                  type="button"
                  onClick={() => onRun(c.action)}
                  disabled={running !== null}
                  aria-label={c.label}
                  className={cn(
                    "group text-start rounded-xl border p-3 transition-colors duration-200 cursor-pointer disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    busy
                      ? "border-emerald-500/60 bg-emerald-500/10"
                      : "border-border hover:border-emerald-500/50 hover:bg-emerald-500/5"
                  )}
                >
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mb-2 transition-colors duration-200 group-hover:bg-emerald-600 group-hover:text-white">
                    {busy ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : ARTIFACT_ICONS[c.action]}
                  </div>
                  <p className="font-bold text-[12.5px]">{c.label}</p>
                  <p className="text-[10.5px] text-muted-foreground mt-0.5 leading-relaxed">{c.desc}</p>
                </button>
              );
            })}
          </div>
        )}

        {error && (
          <Card className="p-3 border-red-500/30 bg-red-500/5 flex items-start gap-2">
            <TriangleAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-[12.5px] font-bold text-red-600 dark:text-red-400 leading-relaxed">{error}</p>
          </Card>
        )}

        {result && (
          <div className="space-y-2">
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-muted-foreground" onClick={onClose}>
                <X className="w-3.5 h-3.5 me-1" />
                إغلاق المخرج
              </Button>
            </div>
            <ArtifactResultView result={result.result} provider={result.provider} model={result.model} isOwner={isOwner} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// المكوّن الرئيسي
// ---------------------------------------------------------------------------

export function NotebookTool({ onBack }: { onBack: () => void }) {
  const { dir } = useI18n();
  const { user } = useAuth();
  const isOwner = user?.role === "OWNER";
  const rtl = dir === "rtl";

  const [state, setState] = React.useState<NotebookState>(emptyNotebook);
  const [tab, setTab] = React.useState<"chat" | "tools" | "sources">("chat");
  const [needsConfig, setNeedsConfig] = React.useState(false);

  // chat
  const [streaming, setStreaming] = React.useState(false);
  const [streamText, setStreamText] = React.useState("");
  const [meta, setMeta] = React.useState<ProviderMeta | null>(null);
  const [errorBubble, setErrorBubble] = React.useState<{ message: string; hint?: string } | null>(null);
  const lastQuestionRef = React.useRef<string | null>(null);

  // artifacts
  const [running, setRunning] = React.useState<ArtifactAction | null>(null);
  const [result, setResult] = React.useState<{ result: ArtifactResult; provider?: string; model?: string } | null>(null);
  const [artifactError, setArtifactError] = React.useState<string | null>(null);

  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    if (!user) return;
    setState(loadState(user.id));
    return () => abortRef.current?.abort();
  }, [user?.id]);

  function persist(next: NotebookState) {
    setState(next);
    if (user) saveState(user.id, next);
  }

  const enabledSources = React.useMemo(() => state.sources.filter((s) => s.enabled), [state.sources]);
  const hasSources = enabledSources.length > 0;

  // ---- المصادر ----

  function addSource(title: string, content: string) {
    if (state.sources.length >= MAX_SOURCES) {
      toast.error(`أقصى عدد للمصادر هو ${MAX_SOURCES}`);
      return;
    }
    const next: NotebookState = {
      ...state,
      sources: [
        ...state.sources,
        { id: newId(), title: title.slice(0, 120), content, addedAt: Date.now(), enabled: true },
      ],
    };
    persist(next);
    toast.success("أُضيف المصدر إلى الدفتر");
  }

  function toggleSource(id: string) {
    persist({ ...state, sources: state.sources.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)) });
  }

  function deleteSource(id: string) {
    const src = state.sources.find((s) => s.id === id);
    persist({ ...state, sources: state.sources.filter((s) => s.id !== id) });
    toast.success(`حُذف «${src?.title ?? "المصدر"}» نهائياً من جهازك`);
  }

  function clearAll() {
    persist(emptyNotebook());
    setStreamText("");
    setErrorBubble(null);
    setResult(null);
    toast.success("فُرِّغ الدفتر بالكامل");
  }

  // ---- الحديث ----

  function offlineBlocked(): boolean {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setErrorBubble({
        message: "أنت غير متصل بالإنترنت — الدفتر يحتاج اتصالاً للمزوّد، لكن مصادرك تبقى محفوظة على جهازك.",
      });
      return true;
    }
    return false;
  }

  function sendQuestion(question: string) {
    const q = question.trim().slice(0, QUESTION_MAX_CHARS);
    if (!q || streaming) return;
    setErrorBubble(null);
    if (offlineBlocked()) return;
    if (!hasSources) {
      toast.error("أضف مصدراً وفعّله أولاً — الحديث يعمل من مصادرك.");
      setTab("sources");
      return;
    }
    lastQuestionRef.current = q;

    const retrievalSources: RetrievalSource[] = enabledSources.map((s) => ({
      id: s.id,
      title: s.title,
      content: s.content,
    }));
    const excerpts = retrieveExcerpts(retrievalSources, q).map((e) => ({ title: e.sourceTitle, text: e.text }));
    if (excerpts.length === 0) {
      setErrorBubble({ message: "المصادر المُفعَّلة فارغة — أضف محتوى أولاً." });
      return;
    }

    const history = state.chat
      .slice(-CHAT_HISTORY_MAX_TURNS)
      .map((m) => ({ role: m.role, content: m.content }));
    const userMsg: NotebookChatMsg = { role: "user", content: q, ts: Date.now() };
    persist({ ...state, chat: [...state.chat, userMsg].slice(-MAX_CHAT_MSGS) });
    void generate(q, history, excerpts);
  }

  async function generate(question: string, history: Array<{ role: "user" | "assistant"; content: string }>, excerpts: Array<{ title: string; text: string }>) {
    setStreaming(true);
    setStreamText("");
    setMeta(null);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let finalMeta: ProviderMeta | null = null;
    let hadError: { message: string; hint?: string } | null = null;
    let fallbackAnswer = "";
    let buf = "";

    try {
      const res = await fetch("/api/ai/notebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "chat", question, history, excerpts, stream: true }),
        signal: ctrl.signal,
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok || contentType.includes("application/json")) {
        const data = (await res.json().catch(() => ({}))) as {
          needsConfig?: boolean;
          error?: string;
          hint?: string;
          answer?: string;
          provider?: string;
          model?: string;
        };
        if (data.needsConfig) setNeedsConfig(true);
        else if (data.answer) fallbackAnswer = data.answer;
        else hadError = { message: data.error ?? "تعذّر الاتصال — أعد المحاولة", hint: data.hint };
      } else {
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const ev = JSON.parse(payload) as {
                type?: string;
                text?: string;
                provider?: string;
                model?: string;
                message?: string;
                hint?: string;
              };
              if (ev.type === "delta" && ev.text) {
                buf += ev.text;
                setStreamText(buf);
              } else if (ev.type === "meta" && ev.provider) {
                finalMeta = { provider: ev.provider, model: ev.model ?? "" };
                setMeta(finalMeta);
              } else if (ev.type === "error") {
                hadError = { message: ev.message ?? "حدث خطأ — أعد المحاولة", hint: ev.hint };
              }
            } catch {
              /* keep-alive */
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        hadError = { message: "تعذّر الاتصال — تحقق من اتصالك بالإنترنت ثم أعد المحاولة" };
      }
    } finally {
      const text = (fallbackAnswer || buf).trim();
      if (text) {
        const assistantMsg: NotebookChatMsg = {
          role: "assistant",
          content: text,
          ts: Date.now(),
          ...(finalMeta ? { provider: finalMeta.provider, model: finalMeta.model } : {}),
        };
        setState((prev) => {
          const next = { ...prev, chat: [...prev.chat, assistantMsg].slice(-MAX_CHAT_MSGS) };
          if (user) saveState(user.id, next);
          return next;
        });
      }
      setStreamText("");
      setStreaming(false);
      abortRef.current = null;
      if (hadError) setErrorBubble(hadError);
    }
  }

  function retryChat() {
    setErrorBubble(null);
    const q = lastQuestionRef.current;
    if (!q) return;
    // أزل آخر محاولة فاشلة (سؤال المستخدم بقي محفوظاً — نكرره دون تكرار)
    void generate(q, state.chat.slice(-CHAT_HISTORY_MAX_TURNS).map((m) => ({ role: m.role, content: m.content })),
      retrieveExcerpts(enabledSources.map((s) => ({ id: s.id, title: s.title, content: s.content })), q).map((e) => ({
        title: e.sourceTitle,
        text: e.text,
      }))
    );
  }

  // ---- المخرجات ----

  async function runArtifact(action: ArtifactAction) {
    if (running) return;
    setArtifactError(null);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setArtifactError("أنت غير متصل بالإنترنت — توليد المخرجات يحتاج اتصالاً للمزوّد.");
      return;
    }
    if (!hasSources) {
      toast.error("أضف مصدراً وفعّله أولاً — المخرجات تُبنى من مصادرك.");
      setTab("sources");
      return;
    }
    setRunning(action);
    setResult(null);
    try {
      const corpus = buildStudyCorpus(enabledSources.map((s) => ({ title: s.title, text: s.content })));
      const res = await fetch("/api/ai/notebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, corpus: corpus.parts }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        needsConfig?: boolean;
        error?: string;
        hint?: string;
        kind?: string;
        data?: unknown;
        provider?: string;
        model?: string;
      };
      if (data.needsConfig) {
        setNeedsConfig(true);
        return;
      }
      if (data.error) {
        setArtifactError(data.error);
        return;
      }
      if (!data.kind || !data.data) {
        setArtifactError("جاء المخرج ناقصاً من الخادم — أعد المحاولة.");
        return;
      }
      if (corpus.truncated) {
        toast.info("المصادر كبيرة — عولجت الأجزاء الأولى ضمن سقف الطلب.");
      }
      setResult({
        result: { kind: data.kind, data: data.data } as ArtifactResult,
        provider: data.provider,
        model: data.model,
      });
    } catch {
      setArtifactError("تعذّر الاتصال — تحقق من اتصالك بالإنترنت ثم أعد المحاولة.");
    } finally {
      setRunning(null);
    }
  }

  // ---- Render ----

  if (!user) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="رجوع" className="shrink-0">
            <ChevronLeft className={cn("w-5 h-5", rtl && "rotate-180")} />
          </Button>
          <h2 className="text-lg font-black">دفتر طالب</h2>
        </div>
        <Card className="p-6 text-center text-sm text-muted-foreground">يجب تسجيل الدخول أولاً</Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="h-14 shrink-0 border-b bg-background/95 backdrop-blur flex items-center gap-1 px-2">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="رجوع" className="shrink-0">
          <ChevronLeft className={cn("w-5 h-5", rtl && "rotate-180")} />
        </Button>
        <div className="flex-1 min-w-0 px-1">
          <h2 className="text-sm font-black flex items-center gap-1.5">
            <NotebookPen className="w-4 h-4 text-emerald-600" />
            دفتر طالب
          </h2>
          <p className="text-[11px] text-muted-foreground truncate">
            {state.sources.length === 0
              ? "مساحتك الدراسية الخاصة — أضف مصادرك وابدأ"
              : `${state.sources.length} مصادر · ${enabledSources.length} مُفعَّل · ${formatChars(
                  enabledSources.reduce((acc, s) => acc + s.content.length, 0)
                )}`}
          </p>
        </div>
        {tab === "chat" && state.chat.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              persist({ ...state, chat: [] });
              setStreamText("");
              setErrorBubble(null);
              toast.success("بدأ حديث جديد — الدفتر لم يُمس");
            }}
            aria-label="حديث جديد"
            className="shrink-0"
          >
            <MessageSquarePlus className="w-5 h-5" />
          </Button>
        )}
      </div>

      {needsConfig ? (
        <NeedsConfigCard isOwner={isOwner} />
      ) : (
        <>
          {/* Tabs */}
          <div className="shrink-0 border-b bg-background/95 backdrop-blur px-3 py-1.5">
            <div className="max-w-3xl mx-auto grid grid-cols-3 gap-1" role="tablist" aria-label="أقسام الدفتر">
              {(
                [
                  { id: "chat", label: "المحادثة", icon: <MessageCircle className="w-4 h-4" /> },
                  { id: "tools", label: "أدوات الدراسة", icon: <GraduationCap className="w-4 h-4" /> },
                  { id: "sources", label: "المصادر", icon: <LibraryBig className="w-4 h-4" /> },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "h-9 rounded-xl text-[12px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    tab === t.id
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  )}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {tab === "chat" && (
            <ChatView
              messages={state.chat}
              streaming={streaming}
              streamText={streamText}
              meta={meta}
              errorBubble={errorBubble}
              hasSources={hasSources}
              isOwner={isOwner}
              onSend={sendQuestion}
              onStop={() => abortRef.current?.abort()}
              onRetry={retryChat}
              onNewChat={() => undefined}
              onGoSources={() => setTab("sources")}
            />
          )}
          {tab === "tools" && (
            <ToolsView
              hasSources={hasSources}
              running={running}
              result={result}
              error={artifactError}
              onRun={(a) => void runArtifact(a)}
              onClose={() => {
                setResult(null);
                setArtifactError(null);
              }}
              isOwner={isOwner}
              onGoSources={() => setTab("sources")}
            />
          )}
          {tab === "sources" && (
            <SourcesView
              sources={state.sources}
              onAdd={addSource}
              onToggle={toggleSource}
              onDelete={deleteSource}
              onClearAll={clearAll}
            />
          )}
        </>
      )}
    </div>
  );
}

