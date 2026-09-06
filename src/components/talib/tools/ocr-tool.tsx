"use client";

/**
 * أدواتي — Tool 9: صورة إلى نص (OCR, round 43).
 *
 * On-device text recognition via tesseract.js (Apache-2.0, WASM): the student
 * photographs the lecture board / a printed page and gets editable text
 * (Arabic, French, English). PRIVACY: the image itself is NEVER uploaded —
 * recognition runs inside the browser. Only the recognition ENGINE + language
 * data are downloaded from a public CDN on first use (~a few MB) and then
 * cached by the browser, which the tool states honestly in its note.
 *
 * Supported langs: ara / fra / eng / ara+eng (board photos mix Arabic text
 * with Latin symbols and numbers constantly).
 */

import * as React from "react";
import {
  ClipboardCopy,
  ChevronLeft,
  Download,
  Loader2,
  RefreshCw,
  ScanText,
  Share2,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import type { Worker as TesseractWorker } from "tesseract.js";
import { useI18n } from "@/components/talib/i18n-provider";
import { cn } from "@/lib/utils";
import {
  dateStamp,
  downloadBlob,
  friendlyFileError,
  pickFiles,
  shareOrDownload,
} from "./shared";

type Lang = "ara" | "fra" | "eng" | "ara+eng";

const LANGS: Array<{ id: Lang; label: string }> = [
  { id: "ara", label: "عربية" },
  { id: "ara+eng", label: "عربية + إنجليزية" },
  { id: "fra", label: "فرنسية" },
  { id: "eng", label: "إنجليزية" },
];

/** Arabic labels for tesseract.js progress statuses. */
function statusLabel(status: string): string | null {
  if (/loading tesseract core/i.test(status)) return "تحميل محرّك التعرّف (مرة واحدة)…";
  if (/initializing tesseract/i.test(status)) return "تهيئة المحرّك…";
  if (/loading language traineddata/i.test(status)) return "تحميل بيانات اللغة (مرة واحدة)…";
  if (/initializing api/i.test(status)) return "تهيئة القارئ…";
  if (/recognizing text/i.test(status)) return "قراءة الصورة واستخراج النص…";
  return null;
}

export function OcrTool({ onBack }: { onBack: () => void }) {
  const { dir } = useI18n();
  const [lang, setLang] = React.useState<Lang>("ara");
  const [file, setFile] = React.useState<File | null>(null);
  const [processing, setProcessing] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [stage, setStage] = React.useState("");
  const [text, setText] = React.useState<string | null>(null);

  async function pick() {
    const [picked] = await pickFiles("image/jpeg,image/png,image/webp,image/jpg,image/bmp", false);
    if (!picked) return;
    setFile(picked);
    setText(null);
  }

  async function recognize() {
    if (!file || processing) return;
    setProcessing(true);
    setProgress(0);
    setStage("");
    setText(null);
    let worker: TesseractWorker | null = null;
    try {
      const { createWorker } = await import("tesseract.js");
      worker = await createWorker(lang, 1, {
        logger: (m: { status?: string; progress?: number }) => {
          const label = m.status ? statusLabel(m.status) : null;
          if (label) setStage(label);
          if (typeof m.progress === "number") setProgress(Math.round(m.progress * 100));
        },
      });
      const { data } = await worker.recognize(file);
      const clean = (data.text ?? "").replace(/\n{3,}/g, "\n\n").trim();
      if (!clean) {
        toast.error("لم يتم العثور على نص واضح — جرّب صورة أوضح أو إضاءة أفضل");
      } else {
        setText(clean);
        toast.success("تم استخراج النص");
      }
    } catch (e) {
      toast.error(friendlyFileError(e, "تعذّر قراءة هذه الصورة — تأكد من اتصالك بالإنترنت لأول تحميل ثم أعد المحاولة."));
    } finally {
      try { await worker?.terminate(); } catch { /* already gone */ }
      setProcessing(false);
    }
  }

  function outName(): string {
    return `نص-مستخرج-${dateStamp()}.txt`;
  }

  async function handleShare() {
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const outcome = await shareOrDownload(blob, outName(), "نص مستخرج");
    if (outcome === "downloaded") toast.success("تم التنزيل كملف نصي");
  }

  async function copyText() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("نُسخ النص");
    } catch {
      toast.error("تعذّر النسخ — انسخ النص يدوياً");
    }
  }

  function reset() {
    setFile(null);
    setText(null);
    setProgress(0);
    setStage("");
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="رجوع" className="shrink-0">
          <ChevronLeft className={cn("w-5 h-5", dir === "rtl" && "rotate-180")} />
        </Button>
        <div>
          <h2 className="text-lg font-black flex items-center gap-2">
            <ScanText className="w-5 h-5 text-primary" />
            صورة إلى نص
          </h2>
          <p className="text-xs text-muted-foreground">صوّر السبورة أو الورقة — انسخ النص</p>
        </div>
      </div>

      {/* Privacy + first-run honesty */}
      <Card className="flex-row items-start gap-3 p-3 bg-primary/5 border-primary/20">
        <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          صورتك تُقرأ داخل جهازك فقط ولا تُرفع لأي خادم. محرّك القراءة نفسه
          يُحمَّل مرة واحدة من الإنترنت (~بضعة ميغا) ثم يعمل بعدها من ذاكرة جهازك.
        </p>
      </Card>

      {!text ? (
        <>
          <Button variant="outline" className="w-full" onClick={pick} disabled={processing}>
            <ScanText className="w-4 h-4 ml-2" />
            {file ? "اختيار صورة أخرى" : "اختيار صورة"}
          </Button>

          {file && (
            <Card className="p-3 flex-row items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <ScanText className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold truncate" dir="auto">{file.name}</p>
                <p className="text-xs text-muted-foreground">صورة جاهزة للقراءة</p>
              </div>
              <Badge variant="secondary" className="text-xs shrink-0">صورة</Badge>
            </Card>
          )}

          {/* Language chips */}
          <Card className="p-4 space-y-3">
            <p className="text-sm font-bold">لغة النص في الصورة</p>
            <div className="grid grid-cols-2 gap-2">
              {LANGS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLang(l.id)}
                  disabled={processing}
                  aria-pressed={lang === l.id}
                  className={cn(
                    "rounded-xl border p-2.5 text-sm font-bold transition-colors",
                    lang === l.id
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:border-primary/40"
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <Button className="w-full" onClick={recognize} disabled={processing || !file}>
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  {stage || "جارٍ العمل…"} {progress}%
                </>
              ) : (
                <>
                  <ScanText className="w-4 h-4 ml-2" />
                  استخرج النص
                </>
              )}
            </Button>
            {processing && <Progress value={progress} />}
            {processing && (
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                أول عملية قد تستغرق دقيقة لتحميل المحرّك — العمليات التالية أسرع بكثير.
              </p>
            )}
          </Card>
        </>
      ) : (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold text-sm">النص المستخرج</h3>
            <Button variant="ghost" size="sm" onClick={copyText} className="h-7 text-xs">
              <ClipboardCopy className="w-3.5 h-3.5 ml-1" />
              نسخ
            </Button>
          </div>
          <div
            dir="auto"
            className="text-sm leading-relaxed whitespace-pre-wrap bg-muted/40 rounded-xl p-3 max-h-[55vh] overflow-y-auto"
          >
            {text}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={handleShare}>
              <Share2 className="w-4 h-4 ml-2" />
              مشاركة / تنزيل
            </Button>
            <Button variant="outline" onClick={() => downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), outName())}>
              <Download className="w-4 h-4 ml-2" />
              ملف نصي
            </Button>
          </div>
          <Button variant="ghost" onClick={reset} className="w-full text-muted-foreground">
            <RefreshCw className="w-4 h-4 ml-2" />
            قراءة صورة أخرى
          </Button>
        </Card>
      )}
    </div>
  );
}
