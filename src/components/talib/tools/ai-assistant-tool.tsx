"use client";

/**
 * أدواتي — المساعد الذكي (round 43).
 *
 * Task-based AI study helper: لخّص / اشرح / اختبرني / اسأل حرّاً.
 * Unlike the other tools this one is ONLINE — the pasted lesson text is sent
 * to the AI provider (Groq or Gemini, free tiers) for the single request and
 * is never stored by Gu-mo. The card is visually distinct (violet, Sparkles,
 * «يحتاج إنترنت» badge) so it never breaks the offline promise of the
 * file tools above it.
 *
 * needsConfig flow mirrors NeedsSchemaCard: when the backend has no AI key,
 * managers see one-time setup instructions (env var in Vercel) while students
 * see a friendly «قريباً» note — nobody sees a raw error.
 */

import * as React from "react";
import {
  Bot,
  ChevronLeft,
  ClipboardCopy,
  FileText,
  GraduationCap,
  HelpCircle,
  Lightbulb,
  Loader2,
  Lock,
  RefreshCw,
  Send,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { canManageRoles } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

type AiTask = "summarize" | "explain" | "quiz" | "ask";

const TASKS: Array<{
  id: AiTask;
  label: string;
  icon: React.ReactNode;
  hint: string;
}> = [
  {
    id: "summarize",
    label: "لخّص لي",
    icon: <FileText className="w-4 h-4" />,
    hint: "الصق درساً أو محاضرة — يخرج لك أهم النقاط في سطور",
  },
  {
    id: "explain",
    label: "اشرح ببساطة",
    icon: <Lightbulb className="w-4 h-4" />,
    hint: "فهمت النص حرفياً ولا تفهمه؟ سيشرحه لك كزميل خلف الصف",
  },
  {
    id: "quiz",
    label: "اختبرني",
    icon: <GraduationCap className="w-4 h-4" />,
    hint: "٥ أسئلة مراجعة من الدرس مع الإجابات في الأسفل",
  },
  {
    id: "ask",
    label: "اسأل حرّاً",
    icon: <HelpCircle className="w-4 h-4" />,
    hint: "اكتب أي سؤال دراسي — ويمكنك إرفاق نص يدعمه",
  },
];

const MAX_TEXT = 8000;

export function AiAssistantTool({ onBack }: { onBack: () => void }) {
  const { dir } = useI18n();
  const { user } = useAuth();
  const canManage = canManageRoles(user ?? null);

  const [task, setTask] = React.useState<AiTask>("summarize");
  const [text, setText] = React.useState("");
  const [question, setQuestion] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [answer, setAnswer] = React.useState<string | null>(null);
  const [needsConfig, setNeedsConfig] = React.useState(false);

  const active = TASKS.find((t) => t.id === task)!;
  const canSubmit =
    !loading && (task === "ask" ? question.trim().length > 0 : text.trim().length > 0);

  async function run() {
    if (!canSubmit) return;
    setLoading(true);
    setAnswer(null);
    setNeedsConfig(false);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, text: text.trim(), question: question.trim() }),
      });
      const data = (await res.json()) as { answer?: string; needsConfig?: boolean; error?: string };
      if (data.needsConfig) {
        setNeedsConfig(true);
      } else if (data.error) {
        toast.error(data.error);
      } else if (data.answer) {
        setAnswer(data.answer);
      } else {
        toast.error("رد غير متوقع من الخدمة");
      }
    } catch {
      toast.error("تعذّر الاتصال — تحقق من اتصالك بالإنترنت ثم أعد المحاولة");
    } finally {
      setLoading(false);
    }
  }

  async function copyAnswer() {
    if (!answer) return;
    try {
      await navigator.clipboard.writeText(answer);
      toast.success("نُسخت الإجابة");
    } catch {
      toast.error("تعذّر النسخ — انسخ النص يدوياً");
    }
  }

  function reset() {
    setAnswer(null);
    setQuestion("");
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="رجوع" className="shrink-0">
          <ChevronLeft className={cn("w-5 h-5", dir === "rtl" && "rotate-180")} />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-black flex items-center gap-2">
            <SparkleHeader />
            المساعد الذكي
          </h2>
          <p className="text-xs text-muted-foreground">رفيق دراستك — يلخّص ويشرح ويختبر</p>
        </div>
        <Badge variant="outline" className="text-[10px] shrink-0 border-violet-400/40 text-violet-500">
          يحتاج إنترنت
        </Badge>
      </div>

      {needsConfig ? (
        <NeedsConfigCard canManage={canManage} />
      ) : (
        <>
          {/* Privacy note — honest about what this tool does differently */}
          <Card className="flex-row items-start gap-3 p-3 bg-violet-500/5 border-violet-500/20">
            <ShieldCheck className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              النص الذي تلصقه يُرسل لمعالجة واحدة فقط لدى مزوّد الذكاء الاصطناعي
              (Groq/Gemini) ثم يُنسى — لا يُخزَّن في قاعدة بياناتنا ولا يُعرض لأحد.
              لا تلصق بيانات شخصية.
            </p>
          </Card>

          {!answer ? (
            <>
              {/* Task chips */}
              <div className="grid grid-cols-2 gap-2">
                {TASKS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTask(t.id)}
                    disabled={loading}
                    aria-pressed={task === t.id}
                    className={cn(
                      "rounded-xl border p-3 text-right transition-colors",
                      task === t.id
                        ? "border-violet-500 bg-violet-500/5"
                        : "border-border hover:border-violet-400/50"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "shrink-0",
                          task === t.id ? "text-violet-500" : "text-muted-foreground"
                        )}
                      >
                        {t.icon}
                      </span>
                      <span className="text-sm font-bold">{t.label}</span>
                    </div>
                  </button>
                ))}
              </div>

              <p className="text-xs text-muted-foreground -mt-1">{active.hint}</p>

              {/* Lesson text (all tasks) */}
              <div className="space-y-1.5">
                <label htmlFor="ai-text" className="text-sm font-bold">
                  {task === "ask" ? "نص داعم (اختياري)" : "النص أو الدرس"}
                </label>
                <textarea
                  id="ai-text"
                  dir="auto"
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
                  placeholder="الصق هنا نص المحاضرة أو الملاحظات…"
                  rows={7}
                  disabled={loading}
                  className="w-full rounded-xl border border-border bg-background p-3 text-sm leading-relaxed outline-none focus:border-violet-500 resize-y"
                />
                <p className="text-[11px] text-muted-foreground text-left" dir="ltr">
                  {text.length} / {MAX_TEXT}
                </p>
              </div>

              {/* Free question */}
              {task === "ask" && (
                <div className="space-y-1.5">
                  <label htmlFor="ai-question" className="text-sm font-bold">
                    سؤالك
                  </label>
                  <textarea
                    id="ai-question"
                    dir="auto"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value.slice(0, 500))}
                    placeholder="مثال: ما الفرق بين التركيب والتحليل في الكيمياء العضوية؟"
                    rows={3}
                    disabled={loading}
                    className="w-full rounded-xl border border-border bg-background p-3 text-sm leading-relaxed outline-none focus:border-violet-500 resize-y"
                  />
                </div>
              )}

              <Button
                onClick={run}
                disabled={!canSubmit}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    جارٍ التفكير…
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 ml-2" />
                    أرسل إلى المساعد
                  </>
                )}
              </Button>
            </>
          ) : (
            /* Answer card */
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Bot className="w-4 h-4 text-violet-500" />
                  إجابة المساعد
                </h3>
                <Button variant="ghost" size="sm" onClick={copyAnswer} className="h-7 text-xs">
                  <ClipboardCopy className="w-3.5 h-3.5 ml-1" />
                  نسخ
                </Button>
              </div>
              <div
                dir="auto"
                className="text-sm leading-relaxed whitespace-pre-wrap bg-muted/40 rounded-xl p-3 max-h-[60vh] overflow-y-auto"
              >
                {answer}
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed border-t pt-2">
                راجع المعلومات العلمية دائماً مع مصدرك الدراسي — المساعد قد يخطئ.
              </p>
              <Button variant="outline" onClick={reset} className="w-full">
                <RefreshCw className="w-4 h-4 ml-2" />
                مهمة أخرى
              </Button>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/** Small header spark in the brand AI color. */
function SparkleHeader() {
  return <Bot className="w-5 h-5 text-violet-500" />;
}

/** Shown when the backend has no AI key configured yet — manager sees the
 *  one-time setup, students see a friendly coming-soon note. */
function NeedsConfigCard({ canManage }: { canManage: boolean }) {
  return (
    <Card className="p-5 space-y-3 text-center">
      <Bot className="w-12 h-12 mx-auto text-violet-500/70" />
      <h3 className="font-bold text-sm">المساعد الذكي غير مفعّل بعد</h3>
      {canManage ? (
        <>
          <p className="text-xs text-muted-foreground leading-relaxed">
            لتفعيله أضف أحد متغيري البيئة التاليين في إعدادات Vercel
            (Settings → Environment Variables) ثم أعد النشر — الأولى مجانية:
          </p>
          <div className="text-right space-y-2">
            <div className="flex items-center gap-2">
              <pre dir="ltr" className="flex-1 min-w-0 text-[11px] font-mono bg-muted/60 rounded-lg p-2 overflow-x-auto">
GROQ_API_KEY=…</pre>
              <Badge variant="secondary" className="text-[10px] shrink-0">موصى به</Badge>
            </div>
            <pre dir="ltr" className="text-[11px] font-mono bg-muted/60 rounded-lg p-2 overflow-x-auto">
GEMINI_API_KEY=…</pre>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              المفتاحين مجانيان: console.groq.com (الأسرع) أو aistudio.google.com/apikey.
              يبقى المفتاح على الخادم ولا يظهر للطلبة أبداً.
            </p>
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground leading-relaxed">
          يجهّز فريق المنصة هذه الخدمة حالياً — ستجدها جاهزة قريباً بإذن الله.
        </p>
      )}
    </Card>
  );
}
