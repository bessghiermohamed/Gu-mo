"use client";

/**
 * أدواتي — المساعد الذكي (round 44 rewrite).
 *
 * The owner's verdict on r43's task-form card: «لم تعجبني مبنتها إطلاقاً —
 * لماذا لا نضيف فقاعات كلام وتجعلها بواجهة تشبه ChatGPT و DeepSeek؟».
 * This file IS that redesign: a full-screen RTL conversation with speech
 * bubbles, a chat-history sidebar, live token streaming (SSE), markdown
 * answers, stop / regenerate / copy, and per-device chat history in
 * localStorage (zero load on Supabase — same philosophy as the tour flag).
 *
 * The 4 study workflows of r43 (لخّص / اشرح / اختبرني / اسأل) survive as
 * the suggestion chips of the empty state — they prefill the composer
 * instead of switching form modes.
 *
 * needsConfig flow mirrors NeedsSchemaCard: no AI key on the backend →
 * managers see one-time setup instructions (with the Grok/Groq key-mixup
 * explainer) while students see a friendly «قريباً» note.
 */

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bot,
  ChevronLeft,
  ClipboardCopy,
  FileText,
  GraduationCap,
  HelpCircle,
  Lightbulb,
  Menu,
  MessageSquarePlus,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import type { PluggableList } from "unified";
import { formatDistanceToNow } from "date-fns";
import { ar as arLocale, enUS } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types & storage (device-local history — Gu-mo never stores chat content)
// ---------------------------------------------------------------------------

type ChatRole = "user" | "assistant";

interface ChatMsg {
  role: ChatRole;
  content: string;
  ts: number;
  provider?: string;
  model?: string;
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMsg[];
}

interface ErrorBubble {
  message: string;
  hint?: string;
}

interface ProviderMeta {
  provider: string;
  model: string;
}

const MAX_INPUT_CHARS = 6000;
const MAX_SESSIONS = 40;
const HISTORY_TURNS = 20;
const HISTORY_TOTAL_CHARS = 20_000;
const STORAGE_PREFIX = "talib-ai-chat-v1-";

function storageKey(userId: number): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function loadSessions(userId: number): ChatSession[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatSession[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s) => s && typeof s.id === "string" && Array.isArray(s.messages));
  } catch {
    return [];
  }
}

function newSession(firstMessage: string): ChatSession {
  const t = Date.now();
  return {
    id: `${t}-${Math.random().toString(36).slice(2, 8)}`,
    title: firstMessage.replace(/\s+/g, " ").slice(0, 36) || "محادثة جديدة",
    createdAt: t,
    updatedAt: t,
    messages: [],
  };
}

/** Trim history for the API: last N turns, oldest dropped if over budget. */
function historyForApi(messages: ChatMsg[]): Array<{ role: ChatRole; content: string }> {
  const trimmed = messages.slice(-HISTORY_TURNS).map((m) => ({ role: m.role, content: m.content }));
  let total = trimmed.reduce((acc, m) => acc + m.content.length, 0);
  while (trimmed.length > 1 && total > HISTORY_TOTAL_CHARS) {
    total -= trimmed[0].content.length;
    trimmed.shift();
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Markdown rendering (assistant bubbles) — styled without typography plugin
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
      className="text-violet-600 dark:text-violet-400 underline underline-offset-2"
      {...props}
    />
  ),
  blockquote: (props) => (
    <blockquote className="border-s-2 border-violet-400/50 ps-3 my-2 text-muted-foreground" {...props} />
  ),
  hr: () => <hr className="border-border my-3" />,
  code: ({ className, children, ...props }) => (
    <code
      className={cn("font-mono text-[0.85em] bg-muted/70 rounded-md px-1.5 py-0.5 break-words", className)}
      {...props}
    >
      {children}
    </code>
  ),
  pre: (props) => (
    <pre
      dir="ltr"
      className="text-left bg-zinc-900 dark:bg-zinc-950 text-zinc-100 rounded-xl p-3 overflow-x-auto text-xs leading-relaxed my-2 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit"
      {...props}
    />
  ),
  table: (props) => (
    <div className="overflow-x-auto my-2" dir="ltr">
      <table className="w-full text-xs border-collapse border border-border" {...props} />
    </div>
  ),
  th: (props) => <th className="border border-border bg-muted/60 px-2 py-1 font-bold" {...props} />,
  td: (props) => <td className="border border-border px-2 py-1" {...props} />,
};

// r59 — math rendering for scientific answers: the provider emits LaTeX
// ($F = m \times a$, $H^+$, $m/s^2$ …) and KaTeX turns it into real math.
// throwOnError:false + strict:"ignore" so a partial stream frame or an odd
// fragment degrades to colored text instead of crashing the bubble.
const markdownPlugins: PluggableList = [
  remarkGfm,
  [remarkMath, { singleDollar: true }],
];
const katexPlugins: PluggableList = [
  [rehypeKatex, { throwOnError: false, strict: "ignore", errorColor: "#c2410c" }],
];

const MarkdownContent = React.memo(function MarkdownContent({ content }: { content: string }) {
  return (
    <div dir="auto" className="ai-markdown">
      <ReactMarkdown
        remarkPlugins={markdownPlugins}
        rehypePlugins={katexPlugins}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1.5" aria-label="المساعد يكتب">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}

const SUGGESTIONS: Array<{ id: string; icon: React.ReactNode; title: string; desc: string; prefill: string }> = [
  {
    id: "summarize",
    icon: <FileText className="w-4 h-4" />,
    title: "لخّص لي درساً",
    desc: "الصق النص وسيخرج لك أهم النقاط",
    prefill: "لخّص النص التالي في نقاط قصيرة واضحة:\n\n",
  },
  {
    id: "explain",
    icon: <Lightbulb className="w-4 h-4" />,
    title: "اشرح ببساطة",
    desc: "يشرح المفهوم كزميل خلف الصف",
    prefill: "اشرح بالبساطة وبمثال ما يلي:\n\n",
  },
  {
    id: "quiz",
    icon: <GraduationCap className="w-4 h-4" />,
    title: "اختبرني",
    desc: "٥ أسئلة مراجعة مع الإجابات",
    prefill: "أنشئ ٥ أسئلة مراجعة من الدرس التالي، مع قسم «الإجابات» في النهاية:\n\n",
  },
  {
    id: "ask",
    icon: <HelpCircle className="w-4 h-4" />,
    title: "اسأل حرّاً",
    desc: "أي سؤال دراسي يخطر ببالك",
    prefill: "",
  },
];

/** Shown when the backend has no AI key configured yet — manager sees the
 *  one-time setup (with the Grok/Groq mixup explainer), students see قريباً. */
function NeedsConfigCard({ isOwner }: { isOwner: boolean }) {
  return (
    <div className="flex-1 overflow-y-auto flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-5 space-y-3 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-violet-500/10 flex items-center justify-center">
          <Bot className="w-7 h-7 text-violet-500" />
        </div>
        <h3 className="font-black text-sm">المساعد الذكي غير مفعّل بعد</h3>
        {isOwner ? (
          <>
            <p className="text-xs text-muted-foreground leading-relaxed">
              أضف أحد مفاتيح البيئة التالية في Vercel (Settings → Environment Variables) ثم أعد النشر —
              السلسلة تعمل بالترتيب: Groq ← Gemini ← Grok:
            </p>
            <div className="text-right space-y-2">
              <div className="flex items-center gap-2">
                <pre dir="ltr" className="flex-1 min-w-0 text-[11px] font-mono bg-muted/60 rounded-lg p-2 overflow-x-auto">
GROQ_API_KEY=gsk_…</pre>
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  موصى به
                </Badge>
              </div>
              <pre dir="ltr" className="text-[11px] font-mono bg-muted/60 rounded-lg p-2 overflow-x-auto">
GEMINI_API_KEY=AIza…</pre>
              <pre dir="ltr" className="text-[11px] font-mono bg-muted/60 rounded-lg p-2 overflow-x-auto">
XAI_API_KEY=xai-…</pre>
            </div>
            <div className="text-right rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
              <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                تنبيه — مفتاح Grok ≠ مفتاح Groq:
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                مفتاح Groq يبدأ بـ <span dir="ltr" className="font-mono">gsk_</span> (من console.groq.com)،
                ومفتاح Grok يبدأ بـ <span dir="ltr" className="font-mono">xai-</span> (من console.x.ai).
                ليسا نفس الخدمة! وإن وقع مفتاح xai- في خانة GROQ_API_KEY بالخطأ فلا مشكلة — النظام
                يتعرّف عليه تلقائياً ويستخدمه عبر x.ai.
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              المفاتيح مجانية وتبقى على الخادم ولا تظهر للطلبة أبداً.
            </p>
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
// Message bubbles
// ---------------------------------------------------------------------------

function BotAvatar() {
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
      <Bot className="w-4 h-4" />
    </div>
  );
}

function MessageBubble({
  msg,
  isLast,
  onRegenerate,
  isOwner,
}: {
  msg: ChatMsg;
  isLast: boolean;
  onRegenerate: () => void;
  isOwner: boolean;
}) {
  const isUser = msg.role === "user";

  async function copyMsg() {
    try {
      await navigator.clipboard.writeText(msg.content);
      toast.success("نُسخت الرسالة");
    } catch {
      toast.error("تعذّر النسخ — انسخ النص يدوياً");
    }
  }

  return (
    <div className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}>
      {!isUser && <BotAvatar />}
      <div className={cn("min-w-0", isUser ? "max-w-[85%] sm:max-w-[75%]" : "max-w-[90%] sm:max-w-[80%]")}>
        <div
          className={cn(
            "px-4 py-2.5 text-sm leading-relaxed shadow-sm",
            isUser
              ? "bg-violet-600 text-white rounded-2xl rounded-se-sm whitespace-pre-wrap break-words"
              : "bg-muted/70 border border-border rounded-2xl rounded-ss-sm"
          )}
        >
          {isUser ? msg.content : <MarkdownContent content={msg.content} />}
        </div>
        {!isUser && (
          <div className="flex items-center gap-1 mt-1 px-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={copyMsg}
            >
              <ClipboardCopy className="w-3 h-3 me-1" />
              نسخ
            </Button>
            {isLast && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={onRegenerate}
              >
                <RefreshCw className="w-3 h-3 me-1" />
                إعادة توليد
              </Button>
            )}
            {isOwner && msg.provider && (
              <span className="text-[10px] text-muted-foreground/60 ms-1 truncate" dir="ltr">
                {msg.provider} · {msg.model}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StreamingBubble({ text, meta, isOwner }: { text: string; meta: ProviderMeta | null; isOwner: boolean }) {
  return (
    <div className="flex gap-2 justify-start">
      <BotAvatar />
      <div className="min-w-0 max-w-[90%] sm:max-w-[80%]">
        <div className="px-4 py-2.5 text-sm leading-relaxed bg-muted/70 border border-border rounded-2xl rounded-ss-sm">
          {text ? (
            <div dir="auto">
              <MarkdownContent content={text} />
              <span className="inline-block w-2 h-4 bg-violet-500 animate-pulse align-text-bottom rounded-[2px] ms-0.5" />
            </div>
          ) : (
            <TypingDots />
          )}
        </div>
        {isOwner && meta?.provider && (
          <span className="text-[10px] text-muted-foreground/60 px-1 mt-1 inline-block" dir="ltr">
            {meta.provider} · {meta.model}
          </span>
        )}
      </div>
    </div>
  );
}

function ErrorCard({ error, onRetry }: { error: ErrorBubble; onRetry: () => void }) {
  return (
    <div className="flex gap-2 justify-start">
      <div className="w-8 h-8 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
        <TriangleAlert className="w-4 h-4" />
      </div>
      <div className="min-w-0 max-w-[90%] sm:max-w-[80%] space-y-2">
        <div className="px-4 py-3 text-sm leading-relaxed rounded-2xl rounded-ss-sm border border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-200">
          {error.message}
        </div>
        {error.hint && (
          <p dir="ltr" className="text-left text-[10px] font-mono text-muted-foreground/70 bg-muted/40 rounded-lg p-2 break-words">
            {error.hint}
          </p>
        )}
        <Button variant="outline" size="sm" className="h-7 text-xs rounded-full" onClick={onRetry}>
          <RefreshCw className="w-3 h-3 me-1" />
          إعادة المحاولة
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar (chat history)
// ---------------------------------------------------------------------------

function SessionListBody({
  sessions,
  activeId,
  locale,
  onSelect,
  onNew,
  onDelete,
  onNavigate,
}: {
  sessions: ChatSession[];
  activeId: string | null;
  locale: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onNavigate?: () => void;
}) {
  const dateLocale = locale === "ar" ? arLocale : enUS;
  return (
    <>
      <div className="p-3 shrink-0">
        <Button
          onClick={onNew}
          className="w-full rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold"
        >
          <Plus className="w-4 h-4 me-1" />
          محادثة جديدة
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
        {sessions.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6 px-3 leading-relaxed">
            لا توجد محادثات بعد — ابدأ الأولى وستظهر هنا، محفوظة على جهازك فقط.
          </p>
        )}
        {sessions.map((s) => (
          <div
            key={s.id}
            className={cn(
              "group rounded-xl border transition-colors flex items-stretch overflow-hidden",
              s.id === activeId
                ? "border-violet-500/40 bg-violet-500/10"
                : "border-transparent hover:bg-muted/60"
            )}
          >
            <button
              type="button"
              className="flex-1 min-w-0 text-start px-3 py-2"
              onClick={() => {
                onSelect(s.id);
                onNavigate?.();
              }}
            >
              <p className="text-[13px] font-bold truncate">{s.title}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {formatDistanceToNow(s.updatedAt, { addSuffix: true, locale: dateLocale })}
              </p>
            </button>
            <button
              type="button"
              aria-label="حذف المحادثة"
              className="px-2 text-muted-foreground/40 hover:text-red-500 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(s.id);
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="p-3 border-t shrink-0">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          محادثاتك محفوظة على جهازك فقط ولا تُخزَّن عندنا. المساعد قد يخطئ — راجع مصدرك الدراسي.
        </p>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AiAssistantTool({ onBack }: { onBack: () => void }) {
  const { dir, locale } = useI18n();
  const { user } = useAuth();
  const isOwner = user?.role === "OWNER";
  const rtl = dir === "rtl";

  const [sessions, setSessions] = React.useState<ChatSession[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [input, setInput] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const [streamText, setStreamText] = React.useState("");
  const [meta, setMeta] = React.useState<ProviderMeta | null>(null);
  const [errorBubble, setErrorBubble] = React.useState<ErrorBubble | null>(null);
  const [needsConfig, setNeedsConfig] = React.useState(false);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [showScrollDown, setShowScrollDown] = React.useState(false);

  const sessionsRef = React.useRef<ChatSession[]>([]);
  const abortRef = React.useRef<AbortController | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const stickRef = React.useRef(true);
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null);
  const streamBufRef = React.useRef("");
  const rafRef = React.useRef<number | null>(null);

  const active = sessions.find((s) => s.id === activeId) ?? null;
  const messages = active?.messages ?? [];

  // round 57: the r56 composer-prefill bridge (talib-ai-prefill) was removed
  // with the home banner — its only dispatcher. The composer now always
  // opens empty.

  // Load device history for this user on mount / login change.
  React.useEffect(() => {
    if (!user) return;
    const loaded = loadSessions(user.id);
    sessionsRef.current = loaded;
    setSessions(loaded);
    setActiveId(loaded[0]?.id ?? null);
    return () => abortRef.current?.abort();
  }, [user?.id]);

  function applySessions(next: ChatSession[]) {
    sessionsRef.current = next;
    setSessions(next);
    if (user) persistSessions(user.id, next);
  }

  function persistSessions(userId: number, list: ChatSession[]) {
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(list.slice(0, MAX_SESSIONS)));
    } catch {
      /* storage quota — non-fatal, history stays in memory for this visit */
    }
  }

  function autoResize() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  // ------------------------------------------------------------------
  // Generation (SSE)
  // ------------------------------------------------------------------

  async function generate(sessionId: string, history: ChatMsg[]) {
    setStreaming(true);
    setStreamText("");
    setMeta(null);
    setErrorBubble(null);
    streamBufRef.current = "";
    stickRef.current = true;

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let finalMeta: ProviderMeta | null = null;
    let hadError: ErrorBubble | null = null;
    let fallbackAnswer = "";

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historyForApi(history), stream: true }),
        signal: ctrl.signal,
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok || contentType.includes("application/json")) {
        // Non-stream JSON path: errors, 429, needsConfig (or a JSON answer).
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
        const flush = () => {
          rafRef.current = null;
          setStreamText(streamBufRef.current);
        };
        const scheduleFlush = () => {
          if (rafRef.current == null) rafRef.current = requestAnimationFrame(flush);
        };
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
                streamBufRef.current += ev.text;
                scheduleFlush();
              } else if (ev.type === "meta" && ev.provider) {
                finalMeta = { provider: ev.provider, model: ev.model ?? "" };
                setMeta(finalMeta);
              } else if (ev.type === "error") {
                hadError = { message: ev.message ?? "حدث خطأ — أعد المحاولة", hint: ev.hint };
              }
            } catch {
              /* keep-alive or partial line — ignore */
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        hadError = { message: "تعذّر الاتصال — تحقق من اتصالك بالإنترنت ثم أعد المحاولة" };
      }
    } finally {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const text = (fallbackAnswer || streamBufRef.current).trim();
      if (text) {
        const assistantMsg: ChatMsg = {
          role: "assistant",
          content: text,
          ts: Date.now(),
          ...(finalMeta ? { provider: finalMeta.provider, model: finalMeta.model } : {}),
        };
        applySessions(
          sessionsRef.current.map((s) =>
            s.id === sessionId ? { ...s, messages: [...s.messages, assistantMsg], updatedAt: Date.now() } : s
          )
        );
      }
      setStreamText("");
      setStreaming(false);
      abortRef.current = null;
      if (hadError) setErrorBubble(hadError);
    }
  }

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------

  function sendMessage(raw?: string) {
    const content = (raw ?? input).trim();
    if (!content || streaming || !user) return;
    setErrorBubble(null);
    setNeedsConfig(false);

    const userMsg: ChatMsg = { role: "user", content, ts: Date.now() };
    const existingId = activeId && sessionsRef.current.some((s) => s.id === activeId) ? activeId : null;

    if (existingId) {
      const target = sessionsRef.current.find((s) => s.id === existingId)!;
      const nextMessages = [...target.messages, userMsg];
      applySessions(
        sessionsRef.current.map((s) =>
          s.id === existingId ? { ...s, messages: nextMessages, updatedAt: Date.now() } : s
        )
      );
      setInput("");
      requestAnimationFrame(autoResize);
      void generate(existingId, nextMessages);
    } else {
      const fresh = newSession(content);
      fresh.messages = [userMsg];
      applySessions([fresh, ...sessionsRef.current].slice(0, MAX_SESSIONS));
      setActiveId(fresh.id);
      setInput("");
      requestAnimationFrame(autoResize);
      void generate(fresh.id, [userMsg]);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  /** Re-run the last exchange: drop trailing assistant bubbles, regenerate. */
  function regenerate() {
    if (streaming || !activeId) return;
    const target = sessionsRef.current.find((s) => s.id === activeId);
    if (!target) return;
    const msgs = [...target.messages];
    while (msgs.length && msgs[msgs.length - 1].role === "assistant") msgs.pop();
    if (!msgs.length) return;
    applySessions(
      sessionsRef.current.map((s) => (s.id === activeId ? { ...s, messages: msgs, updatedAt: s.updatedAt } : s))
    );
    void generate(activeId, msgs);
  }

  function startNewChat() {
    if (streaming) stop();
    setActiveId(null);
    setErrorBubble(null);
    setNeedsConfig(false);
    setSidebarOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function deleteSession(id: string) {
    const next = sessionsRef.current.filter((s) => s.id !== id);
    applySessions(next);
    if (activeId === id) setActiveId(next[0]?.id ?? null);
    toast.success("حُذفت المحادثة");
  }

  function onSuggestion(prefill: string) {
    if (!prefill) {
      inputRef.current?.focus();
      return;
    }
    setInput(prefill);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
        autoResize();
      }
    });
  }

  // ------------------------------------------------------------------
  // Scroll management (stick to bottom while streaming)
  // ------------------------------------------------------------------

  const onScroll = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    stickRef.current = nearBottom;
    setShowScrollDown(!nearBottom);
  }, []);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [streamText, messages.length, errorBubble]);

  function scrollToBottom() {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = true;
    setShowScrollDown(false);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  if (!user) {
    return (
      <div className="space-y-4">
        <BackHeader onBack={onBack} rtl={rtl} />
        <Card className="p-6 text-center text-sm text-muted-foreground">يجب تسجيل الدخول أولاً</Card>
      </div>
    );
  }

  const sessionList = (
    <SessionListBody
      sessions={sessions}
      activeId={activeId}
      locale={locale}
      onSelect={setActiveId}
      onNew={startNewChat}
      onDelete={deleteSession}
    />
  );

  return (
    <div className="fixed inset-0 z-50 bg-background flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-72 shrink-0 border-e bg-muted/20 flex-col">{sessionList}</aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/40 z-40 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 start-0 w-72 z-50 md:hidden bg-background border-e flex flex-col shadow-xl"
              initial={{ x: rtl ? "100%" : "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: rtl ? "100%" : "-100%" }}
              transition={{ type: "tween", duration: 0.22, ease: "easeOut" }}
            >
              <SessionListBody
                sessions={sessions}
                activeId={activeId}
                locale={locale}
                onSelect={setActiveId}
                onNew={startNewChat}
                onDelete={deleteSession}
                onNavigate={() => setSidebarOpen(false)}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="h-14 shrink-0 border-b bg-background/95 backdrop-blur flex items-center gap-1 px-2">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden shrink-0"
            onClick={() => setSidebarOpen(true)}
            aria-label="المحادثات"
          >
            <Menu className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="رجوع" className="shrink-0">
            <ChevronLeft className={cn("w-5 h-5", rtl && "rotate-180")} />
          </Button>
          <div className="flex-1 min-w-0 px-1">
            <h2 className="text-sm font-black flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-violet-500" />
              المساعد الذكي
            </h2>
            <p className="text-[11px] text-muted-foreground truncate">
              {active?.title ?? "رفيق دراستك — اسأل عن أي شيء دراسي"}
            </p>
          </div>
          {isOwner && meta?.provider && (
            <Badge variant="outline" className="text-[10px] shrink-0 border-violet-400/40 text-violet-500" dir="ltr">
              {meta.provider}
            </Badge>
          )}
          <Button variant="ghost" size="icon" onClick={startNewChat} aria-label="محادثة جديدة" className="shrink-0">
            <MessageSquarePlus className="w-5 h-5" />
          </Button>
        </div>

        {needsConfig ? (
          <NeedsConfigCard isOwner={isOwner} />
        ) : (
          <>
            {/* Scrollable conversation */}
            <div className="relative flex-1 min-h-0">
              <div ref={scrollRef} onScroll={onScroll} className="absolute inset-0 overflow-y-auto">
                {messages.length === 0 && !streaming && !errorBubble ? (
                  <div className="max-w-2xl mx-auto w-full px-4 h-full flex flex-col items-center justify-center gap-5 py-8">
                    <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white flex items-center justify-center shadow-lg shadow-violet-500/20">
                      <Sparkles className="w-8 h-8" />
                    </div>
                    <div className="text-center space-y-1">
                      <h3 className="text-lg font-black">مساعدك الدراسي بالعربية</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        اسأل عن أي درس، الصق نصاً ليُلخّص، أو اطلب منه أن يختبرك — الإجابة تصل حرفاً بحرف.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => onSuggestion(s.prefill)}
                          className="text-start rounded-xl border border-border p-3 hover:border-violet-500/50 hover:bg-violet-500/5 transition-colors"
                        >
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-violet-500 shrink-0">{s.icon}</span>
                            <span className="text-[13px] font-bold">{s.title}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">{s.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="max-w-3xl mx-auto w-full px-3 py-4 space-y-5 pb-8">
                    {messages.map((m, i) => (
                      <MessageBubble
                        key={m.ts + "-" + i}
                        msg={m}
                        isLast={i === messages.length - 1 && !streaming}
                        onRegenerate={regenerate}
                        isOwner={isOwner}
                      />
                    ))}
                    {streaming && <StreamingBubble text={streamText} meta={meta} isOwner={isOwner} />}
                    {errorBubble && <ErrorCard error={errorBubble} onRetry={regenerate} />}
                  </div>
                )}
              </div>
              {showScrollDown && (
                <div className="absolute inset-x-0 bottom-3 flex justify-center pointer-events-none">
                  <Button
                    size="icon"
                    onClick={scrollToBottom}
                    className="pointer-events-auto h-9 w-9 rounded-full bg-background border border-border shadow-md hover:bg-muted"
                    aria-label="الانتقال إلى الأسفل"
                  >
                    <ChevronLeft className={cn("w-4 h-4 -rotate-90", rtl && "rotate-90")} />
                  </Button>
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
                      setInput(e.target.value.slice(0, MAX_INPUT_CHARS));
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
                        sendMessage();
                      }
                    }}
                    placeholder="اكتب سؤالك… (Shift+Enter لسطر جديد)"
                    className="flex-1 resize-none rounded-2xl border border-border bg-muted/30 px-4 py-3 text-sm leading-relaxed outline-none focus:border-violet-500 max-h-40 placeholder:text-muted-foreground/70"
                  />
                  {streaming ? (
                    <Button
                      size="icon"
                      onClick={stop}
                      className="h-11 w-11 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white shrink-0"
                      aria-label="إيقاف التوليد"
                    >
                      <Square className="w-4 h-4 fill-current" />
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      onClick={() => sendMessage()}
                      disabled={!input.trim()}
                      className="h-11 w-11 rounded-full bg-violet-600 hover:bg-violet-700 text-white shrink-0 disabled:opacity-40"
                      aria-label="إرسال"
                    >
                      <Send className={cn("w-4 h-4", rtl && "-scale-x-100")} />
                    </Button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground text-center mt-2">
                  قد يخطئ المساعد أحياناً — تحقق من المعلومات المهمة من مصدرها. لا ترسل بيانات شخصية.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Fallback header for the not-logged-in state. */
function BackHeader({ onBack, rtl }: { onBack: () => void; rtl: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="icon" onClick={onBack} aria-label="رجوع" className="shrink-0">
        <ChevronLeft className={cn("w-5 h-5", rtl && "rotate-180")} />
      </Button>
      <h2 className="text-lg font-black">المساعد الذكي</h2>
    </div>
  );
}
