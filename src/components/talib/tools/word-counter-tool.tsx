"use client";

/**
 * أدواتي — Tool 6: عدّاد الكلمات والأحرف.
 *
 * Professors set word limits ("تقرير في 500 كلمة") and students write in
 * WhatsApp notes / Google Docs / anywhere. Paste here and get instant,
 * live-updating Arabic-aware stats: words, characters with/without spaces,
 * sentences, paragraphs, and estimated reading time.
 *
 * All counting is local — the text NEVER leaves the device (same privacy
 * guarantee as the file tools). Arabic-Indic digits and punctuation are
 * handled natively (؟،؛ counted as sentence/word separators where relevant).
 */

import * as React from "react";
import {
  ChevronLeft,
  Type,
  ShieldCheck,
  Trash2,
  ClipboardPaste,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { useI18n } from "@/components/talib/i18n-provider";
import { cn } from "@/lib/utils";

/** Strip Arabic tashkeel so "الْعَرَبِيَّة" counts as one word, not fragments. */
const TASHKEEL = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;

function analyze(raw: string) {
  const text = raw.trim();
  if (!text) {
    return {
      words: 0,
      chars: 0,
      charsNoSpaces: 0,
      sentences: 0,
      paragraphs: 0,
      readingMinutes: 0,
      uniqueWords: 0,
    };
  }

  const stripped = text.replace(TASHKEEL, "");
  const words = stripped.split(/[\s\u00A0]+/).filter(Boolean);
  const chars = raw.length;
  const charsNoSpaces = raw.replace(/\s/g, "").length;
  // Arabic/Latin sentence enders: . ! ؟ ! … ؛ (؛ is a soft separator)
  const sentences = stripped
    .split(/[.!؟?!…]+/)
    .map((s) => s.trim())
    .filter(Boolean).length;
  const paragraphs = raw
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean).length;
  // Average silent reading speed for Arabic ≈ 175–200 wpm → 190.
  const readingMinutes = words.length / 190;
  const unique = new Set(words.map((w) => w.replace(/[^\p{L}\p{N}\u0640]/gu, "")));

  return {
    words: words.length,
    chars,
    charsNoSpaces,
    sentences,
    paragraphs,
    readingMinutes,
    uniqueWords: unique.size,
  };
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="p-3.5 text-center">
      <p className="text-2xl font-black text-primary tabular-nums" dir="ltr">
        {value}
      </p>
      <p className="text-xs font-bold mt-1">{label}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </Card>
  );
}

export function WordCounterTool({ onBack }: { onBack: () => void }) {
  const { dir } = useI18n();
  const [text, setText] = React.useState("");
  const stats = React.useMemo(() => analyze(text), [text]);

  async function pasteFromClipboard() {
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip.trim()) {
        toast.info("الحافظة فارغة");
        return;
      }
      setText((prev) => (prev ? prev + "\n" + clip : clip));
      toast.success("تم لصق النص");
    } catch {
      toast.error("تعذّر الوصول إلى الحافظة — انسخ النص ثم الصقه يدوياً");
    }
  }

  function clearAll() {
    if (!text) return;
    setText("");
    toast.info("تم إفراغ الحقل — لم يُحفظ أي نص");
  }

  const minutes = stats.readingMinutes;
  const readingLabel =
    stats.words === 0
      ? "—"
      : minutes < 1
        ? `${Math.max(1, Math.round(minutes * 60))} ثانية`
        : `${Math.round(minutes)} دقيقة`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="رجوع" className="shrink-0">
          <ChevronLeft className={cn("w-5 h-5", dir === "rtl" && "rotate-180")} />
        </Button>
        <div>
          <h2 className="text-lg font-black flex items-center gap-2">
            <Type className="w-5 h-5 text-primary" />
            عدّاد الكلمات والأحرف
          </h2>
          <p className="text-xs text-muted-foreground">
            تحقّق من حد الكلمات الذي طلبه الأستاذ قبل التسليم
          </p>
        </div>
      </div>

      {/* Privacy reminder */}
      <Card className="flex-row items-center gap-3 p-3 bg-primary/5 border-primary/20">
        <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          العدّ يحصل داخل جهازك فقط — لا يُرسل النص إلى أي خادم ولا يُحفظ بعد الخروج.
        </p>
      </Card>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2.5">
        <StatCard label="كلمة" value={String(stats.words)} hint={`${stats.uniqueWords} مختلفة`} />
        <StatCard label="حرف" value={String(stats.chars)} hint={`بدون فراغات ${stats.charsNoSpaces}`} />
        <StatCard label="جملة" value={String(stats.sentences)} hint={`${stats.paragraphs} فقرات`} />
      </div>

      {/* Text area */}
      <Card className="p-3 space-y-2">
        <label htmlFor="wc-input" className="text-xs font-medium text-muted-foreground">
          الصق نصك هنا — الإحصائيات تتحدث فورياً أثناء الكتابة
        </label>
        <textarea
          id="wc-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder="الصق التقرير أو المقال هنا…"
          className="w-full resize-y rounded-xl border bg-background px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={pasteFromClipboard}>
              <ClipboardPaste className="w-3.5 h-3.5 ml-1" />
              لصق
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard?.writeText(text);
                toast.success("تم نسخ النص");
              }}
              disabled={!text}
            >
              <Copy className="w-3.5 h-3.5 ml-1" />
              نسخ
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            disabled={!text}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="w-3.5 h-3.5 ml-1" />
            إفراغ
          </Button>
        </div>
      </Card>

      {/* Reading time + tip */}
      <Card className="p-4 flex items-start gap-3 bg-muted/30">
        <div className="w-9 h-9 rounded-xl bg-secondary/15 text-secondary flex items-center justify-center shrink-0">
          <Type className="w-4.5 h-4.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">زمن القراءة التقديري: {readingLabel}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            يحسب بسرعة قراءة صامتة معتادة (~١٩٠ كلمة/دقيقة). عدّ الكلمات يستبعد
            التشكيل حتى لا تتضخم الأرقام، والجملة تنتهي بنقطة أو علامة استفهام.
          </p>
        </div>
      </Card>
    </div>
  );
}
