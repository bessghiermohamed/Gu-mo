"use client";

/**
 * استوديو الصور — AI image generation tool (round 83).
 *
 * The owner asked for image generation inside the app; this is the second
 * ONLINE AI tool after المساعد الذكي, and it follows every convention that
 * tool established:
 *
 *   - needsConfig flow: no image-capable key on the backend → the owner sees
 *     the one-time setup card (Gemini or Grok image keys), students see
 *     «قريباً» — never a crash, never a hang.
 *   - Honest errors: the provider chain's failures arrive as Arabic messages
 *     the student can act on; the owner additionally gets the technical hint.
 *   - Privacy: nothing is persisted — no DB row, no Supabase Storage. The
 *     gallery lives in memory for the visit only; the student downloads what
 *     they want to keep (same contract the assistant applies to chat text).
 *   - Offline guard (r61 lesson): tell the student immediately instead of
 *     letting the fetch hang.
 *
 * Whole-system notes (docs/comprehensive-system-review.md §17):
 *   Visibility: logged-in users only, inside أدواتي.
 *   Placement: featured card under the assistant (AI family) — NOT inside the
 *     offline tools grid, so the «أدوات تعمل داخل جهازك» banner stays honest.
 *   States: empty (suggestion cards) / loading (elapsed timer) / error (retry)
 *     / success (image + actions) / offline / needsConfig / rate-limited.
 *   Actions: style chips (deterministic prompt suffixes — zero extra API
 *     calls), aspect chips, generate, regenerate, download/share, delete,
 *     copy prompt.
 */

import * as React from "react";
import {
  ChevronLeft,
  Clock,
  Cloud,
  Copy,
  Download,
  ImageIcon,
  Palette,
  RefreshCw,
  Share2,
  Sparkles,
  Square,
  Trash2,
  TriangleAlert,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { cn } from "@/lib/utils";
import { shareOrDownload, dateStamp } from "./shared";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_PROMPT_CHARS = 600;
const MAX_GALLERY = 6;

type Aspect = "1:1" | "4:3" | "3:4" | "16:9";

const ASPECTS: Array<{ id: Aspect; label: string; box: string }> = [
  { id: "1:1", label: "مربع", box: "w-4 h-4" },
  { id: "4:3", label: "أفقي", box: "w-5 h-3.5" },
  { id: "3:4", label: "طولي", box: "w-3.5 h-5" },
  { id: "16:9", label: "عريض", box: "w-6 h-3.5" },
];

/** Style chips → deterministic prompt suffixes. No second model call, no
 *  hidden prompt rewriting — the student sees exactly what was sent. */
const STYLES: Array<{ id: string; label: string; suffix: string }> = [
  {
    id: "illustration",
    label: "رسم توضيحي",
    suffix: "، بأسلوب رسم توضيحي تعليمي نظيف وواضح مناسب للطلاب، خلفية بسيطة وألوان مريحة، بلا نصوص مكتوبة",
  },
  {
    id: "flashcard",
    label: "بطاقة مراجعة",
    suffix: "، بأسلوب بطاقة مراجعة دراسية: موضوع واحد واضح في المنتصف، خلفية موحدة بألوان هادئة، تفاصيل مختصرة",
  },
  {
    id: "poster",
    label: "ملصق تحفيزي",
    suffix: "، بأسلوب ملصق تحفيزي للطلاب بألوان مشرقة وحيوية وتكوين جذاب، بلا نصوص مكتوبة",
  },
  {
    id: "cover",
    label: "غلاف ملخص",
    suffix: "، بأسلوب غلاف ملف دراسي أنيق وجذاب للطلاب الجامعيين، تكوين متوازن يصلح غلافاً لملخص",
  },
];

const SUGGESTIONS: Array<{ id: string; title: string; prefill: string; style: string }> = [
  {
    id: "diagram",
    title: "مخطط لدرس الأحياء: الخلية النباتية بأجزائها الملوّنة",
    prefill: "رسم تعليمي لخلية نباتية بأجزائها الرئيسية (جدار الخلية، النواة، البلاستيدات الخضراء، الفجوة الكبيرة) بألوان مميزة لكل جزء",
    style: "illustration",
  },
  {
    id: "flashcard",
    title: "بطاقة مراجعة: جدول الضرب أو صيغة كيميائية",
    prefill: "بطاقة مراجعة دراسية عن",
    style: "flashcard",
  },
  {
    id: "poster",
    title: "ملصق يحفّز على المذاكرة قبل الامتحان",
    prefill: "مشهد ملهم لطالب جامعي يذاكر بتركيز وهدوء قرب نافذة في الصباح",
    style: "poster",
  },
  {
    id: "cover",
    title: "غلاف لملخص مقياس هذا السداسي",
    prefill: "غلاف دراسي أنيق لمقياس",
    style: "cover",
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GalleryItem {
  id: string;
  dataUrl: string;
  prompt: string;
  aspect: Aspect;
  provider: string;
  model: string;
  ts: number;
}

interface GenError {
  message: string;
  hint?: string;
}

// ---------------------------------------------------------------------------
// needsConfig card (mirrors the assistant's)
// ---------------------------------------------------------------------------

function NeedsConfigCard({ isOwner }: { isOwner: boolean }) {
  return (
    <div className="flex-1 overflow-y-auto flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-5 space-y-3 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-fuchsia-500/10 flex items-center justify-center">
          <ImageIcon className="w-7 h-7 text-fuchsia-500" />
        </div>
        <h3 className="font-black text-sm">استوديو الصور غير مفعّل بعد</h3>
        {isOwner ? (
          <>
            <p className="text-xs text-muted-foreground leading-relaxed">
              توليد الصور يحتاج مفتاحاً من مزوّد يدعم الصور — أضفه في Vercel
              (Settings → Environment Variables) ثم أعد النشر:
            </p>
            <div className="text-right space-y-2">
              <div className="flex items-center gap-2">
                <pre dir="ltr" className="flex-1 min-w-0 text-[11px] font-mono bg-muted/60 rounded-lg p-2 overflow-x-auto">
GEMINI_API_KEY=AIza…</pre>
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  موصى به
                </Badge>
              </div>
              <pre dir="ltr" className="text-[11px] font-mono bg-muted/60 rounded-lg p-2 overflow-x-auto">
XAI_API_KEY=xai-…</pre>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              نفس مفاتيح المساعد الذكي — إن كان مفتاح Gemini مفعّلاً فالاستوديو يعمل به
              فوراً. مفاتيح Groq (gsk_) لا تولّد صوراً، والسلسلة تجرّب Gemini ثم Grok.
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
// Main component
// ---------------------------------------------------------------------------

export function ImageStudioTool({ onBack }: { onBack: () => void }) {
  const { dir } = useI18n();
  const { user } = useAuth();
  const isOwner = user?.role === "OWNER";
  const rtl = dir === "rtl";

  const [prompt, setPrompt] = React.useState("");
  const [styleId, setStyleId] = React.useState<string>(STYLES[0].id);
  const [aspect, setAspect] = React.useState<Aspect>("1:1");
  const [loading, setLoading] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const [needsConfig, setNeedsConfig] = React.useState(false);
  const [error, setError] = React.useState<GenError | null>(null);
  const [gallery, setGallery] = React.useState<GalleryItem[]>([]);
  const [remaining, setRemaining] = React.useState<number | null>(null);

  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  // Elapsed-seconds ticker while generating (honest waiting UX).
  React.useEffect(() => {
    if (loading) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loading]);

  function applyStyleTo(text: string): string {
    const style = STYLES.find((s) => s.id === styleId);
    return style ? `${text}${style.suffix}` : text;
  }

  async function downloadImage(item: GalleryItem) {
    try {
      const res = await fetch(item.dataUrl);
      const blob = await res.blob();
      await shareOrDownload(blob, `talib-image-${dateStamp()}.png`, "صورة من استوديو طالب");
    } catch {
      toast.error("تعذّر تجهيز الصورة للتنزيل — أعد المحاولة.");
    }
  }

  async function generate(rawPrompt?: string) {
    const text = (rawPrompt ?? prompt).trim();
    if (text.length < 3) {
      toast.error("اكتب وصفاً للصورة أولاً.");
      inputRef.current?.focus();
      return;
    }
    // r61 lesson — fail fast and honestly when offline.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setError({ message: "أنت غير متصل بالإنترنت — توليد الصور يحتاج اتصالاً ليعمل." });
      return;
    }
    if (loading) return;

    setLoading(true);
    setError(null);
    setNeedsConfig(false);
    try {
      const res = await fetch("/api/ai/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: applyStyleTo(text), aspect }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        image?: string;
        provider?: string;
        model?: string;
        remainingToday?: number;
        needsConfig?: boolean;
        error?: string;
        hint?: string;
      };
      if (res.ok && data.image) {
        const item: GalleryItem = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          dataUrl: data.image,
          prompt: text,
          aspect,
          provider: data.provider ?? "",
          model: data.model ?? "",
          ts: Date.now(),
        };
        setGallery((g) => [item, ...g].slice(0, MAX_GALLERY));
        setRemaining(typeof data.remainingToday === "number" ? data.remainingToday : null);
        toast.success("جهزت الصورة — نزّلها أو ولّد نسخة أخرى.");
      } else if (data.needsConfig) {
        setNeedsConfig(true);
      } else if (data.error) {
        setError({ message: data.error, hint: isOwner ? data.hint : undefined });
      } else {
        setError({ message: "حدث خطأ غير متوقع — أعد المحاولة." });
      }
    } catch {
      setError({ message: "تعذّر الاتصال بالخادم — تحقق من الإنترنت ثم أعد المحاولة." });
    } finally {
      setLoading(false);
    }
  }

  const latest = gallery[0];

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)] space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="رجوع" className="shrink-0">
          <ChevronLeft className={cn("w-5 h-5", rtl && "rotate-180")} />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-black flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-fuchsia-500" />
            استوديو الصور
          </h2>
          <p className="text-xs text-muted-foreground truncate">
            صف صورتك بالعربية — مخططات، بطاقات مراجعة، ملصقات وغلف دراسية
          </p>
        </div>
        {remaining != null && (
          <Badge variant="outline" className="text-[10px] shrink-0">
            {remaining} متبقية اليوم
          </Badge>
        )}
      </div>

      {needsConfig ? (
        <NeedsConfigCard isOwner={isOwner} />
      ) : (
        <>
          {/* Prompt composer */}
          <Card className="p-4 space-y-3">
            <label htmlFor="image-prompt" className="text-[13px] font-bold flex items-center gap-1.5">
              <Palette className="w-4 h-4 text-fuchsia-500" />
              ماذا نرسم لك؟
            </label>
            <Textarea
              id="image-prompt"
              ref={inputRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value.slice(0, MAX_PROMPT_CHARS))}
              placeholder="مثال: رسم توضيحي لخلية نباتية بأجزائها الملوّنة…"
              className="min-h-24 text-sm leading-relaxed resize-none"
              disabled={loading}
            />
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span dir="ltr">
                {prompt.length}/{MAX_PROMPT_CHARS}
              </span>
              <span>الصورة تُولَّد في السحابة ولا تُخزَّن — نزّل ما يعجبك</span>
            </div>

            {/* Style chips */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-muted-foreground">الأسلوب</span>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5" role="group" aria-label="اختر الأسلوب">
                {STYLES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={styleId === s.id}
                    onClick={() => setStyleId(s.id)}
                    className={cn(
                      "shrink-0 h-9 px-4 rounded-full text-[13px] font-bold cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      styleId === s.id
                        ? "bg-fuchsia-600 text-white shadow-sm"
                        : "bg-card text-muted-foreground border hover:border-fuchsia-400/50 hover:text-fuchsia-600"
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Aspect chips */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-muted-foreground">الأبعاد</span>
              <div className="flex gap-2" role="group" aria-label="اختر الأبعاد">
                {ASPECTS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    aria-pressed={aspect === a.id}
                    onClick={() => setAspect(a.id)}
                    className={cn(
                      "h-9 px-3 rounded-full text-[12px] font-bold cursor-pointer inline-flex items-center gap-1.5 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      aspect === a.id
                        ? "bg-fuchsia-600 text-white shadow-sm"
                        : "bg-card text-muted-foreground border hover:border-fuchsia-400/50 hover:text-fuchsia-600"
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn("inline-block rounded-[3px] border-2", a.box, aspect === a.id ? "border-white/80" : "border-current opacity-60")}
                    />
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={() => generate()}
              disabled={loading || prompt.trim().length < 3}
              className="w-full h-12 text-[15px] font-black bg-gradient-to-l from-fuchsia-600 via-fuchsia-500 to-violet-500 hover:opacity-95 transition-opacity"
            >
              {loading ? (
                <>
                  <Square className="w-4 h-4 animate-pulse" />
                  جارٍ التوليد… {elapsed}ث
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  ولّد الصورة
                </>
              )}
            </Button>
          </Card>

          {/* Loading card — honest waiting with elapsed time */}
          {loading && (
            <Card className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-fuchsia-500/10 text-fuchsia-500 flex items-center justify-center shrink-0">
                  <Clock className="w-4.5 h-4.5 animate-pulse" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold">النموذج يرسم صورتك…</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    التوليد يستغرق عادة من ٥ إلى ٣٠ ثانية — {elapsed} ثانية حتى الآن
                  </p>
                </div>
              </div>
              <div className="rounded-xl bg-muted/50 p-6 flex items-center justify-center">
                <div
                  className={cn(
                    "rounded-lg bg-gradient-to-br from-fuchsia-500/20 to-violet-500/20 animate-pulse",
                    aspect === "1:1" && "w-40 h-40",
                    aspect === "4:3" && "w-48 h-36",
                    aspect === "3:4" && "w-36 h-48",
                    aspect === "16:9" && "w-56 h-32"
                  )}
                />
              </div>
            </Card>
          )}

          {/* Error card — honest, actionable, retryable */}
          {error && !loading && (
            <Card className="p-4 space-y-3 border-red-500/30 bg-red-500/5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center shrink-0">
                  <TriangleAlert className="w-4.5 h-4.5" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-[13px] font-bold">{error.message}</p>
                  {isOwner && error.hint && (
                    <p dir="auto" className="text-[11px] text-muted-foreground leading-relaxed">
                      {error.hint}
                    </p>
                  )}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => generate()} className="w-full">
                <RefreshCw className="w-3.5 h-3.5" />
                أعد المحاولة
              </Button>
            </Card>
          )}

          {/* Latest result */}
          {latest && !loading && (
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-bold flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-fuchsia-500" />
                  صورتك جاهزة
                </p>
                {isOwner && latest.provider && (
                  <Badge variant="outline" className="text-[10px] shrink-0" dir="ltr">
                    {latest.provider}
                  </Badge>
                )}
              </div>
              <img
                src={latest.dataUrl}
                alt={`صورة مولّدة: ${latest.prompt}`}
                className={cn(
                  "w-full rounded-xl shadow-sm bg-muted/30 object-contain",
                  aspect === "1:1" && "max-w-sm mx-auto",
                  aspect === "4:3" && "aspect-[4/3]",
                  aspect === "3:4" && "max-w-xs mx-auto",
                  aspect === "16:9" && "aspect-video"
                )}
              />
              <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{latest.prompt}</p>
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" onClick={() => downloadImage(latest)} className="h-10">
                  <Download className="w-3.5 h-3.5" />
                  نزّلها
                </Button>
                <Button variant="outline" size="sm" onClick={() => generate(latest.prompt)} className="h-10">
                  <RefreshCw className="w-3.5 h-3.5" />
                  نسخة أخرى
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(latest.prompt);
                      toast.success("نسخت الوصف.");
                    } catch {
                      toast.error("تعذّر النسخ.");
                    }
                  }}
                  className="h-10"
                >
                  <Copy className="w-3.5 h-3.5" />
                  انسخ الوصف
                </Button>
              </div>
            </Card>
          )}

          {/* Session gallery (in-memory only) */}
          {gallery.length > 1 && (
            <div className="space-y-2">
              <p className="text-[13px] font-bold">صور هذه الجلسة</p>
              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                {gallery.slice(1).map((item) => (
                  <div key={item.id} className="relative shrink-0 group">
                    <img
                      src={item.dataUrl}
                      alt={`صورة مولّدة: ${item.prompt}`}
                      className="w-24 h-24 rounded-xl object-cover border cursor-pointer"
                      onClick={() => setGallery((g) => [item, ...g.filter((x) => x.id !== item.id)].slice(0, MAX_GALLERY))}
                    />
                    <button
                      type="button"
                      aria-label="حذف الصورة"
                      onClick={() => setGallery((g) => g.filter((x) => x.id !== item.id))}
                      className="absolute -top-1.5 -left-1.5 w-6 h-6 rounded-full bg-background border shadow-sm text-muted-foreground hover:text-red-500 transition-colors cursor-pointer flex items-center justify-center"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Cloud className="w-3 h-3" />
                لا تُخزَّن أي صورة على الخادم — تختفي عند إغلاق الصفحة، فنزّل ما يهمك.
              </p>
            </div>
          )}

          {/* Empty state — suggestions */}
          {gallery.length === 0 && !loading && !error && (
            <div className="space-y-2">
              <p className="text-[13px] font-bold">أفكار جاهزة للتجربة</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      const style = STYLES.find((x) => x.id === s.style);
                      if (style) setStyleId(style.id);
                      setPrompt(s.prefill);
                      inputRef.current?.focus();
                    }}
                    className="text-right cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    aria-label={s.title}
                  >
                    <Card className="h-full p-3.5 transition-[border-color,box-shadow] duration-200 hover:border-fuchsia-400/50 hover:shadow-md">
                      <div className="flex items-center gap-2">
                        <Share2 className="w-4 h-4 text-fuchsia-500 shrink-0" />
                        <p className="text-[12px] font-bold leading-snug">{s.title}</p>
                      </div>
                    </Card>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
