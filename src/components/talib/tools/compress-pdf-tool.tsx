"use client";

/**
 * أدواتي — Tool 2: ضغط PDF.
 *
 * True client-side compression: pdf.js renders each page to a canvas at a
 * preset resolution, the canvas is re-encoded as JPEG at a preset quality,
 * and pdf-lib rebuilds a fresh PDF from those images. This is the same
 * pipeline online compressors use — but here it never leaves the device.
 *
 * Honest-result rule: if the rebuild is NOT smaller than the original
 * (typical for pure-text PDFs whose vectors are already tiny), the student
 * is told so and advised to keep the original instead of being handed a
 * bigger file with a success message.
 */

import * as React from "react";
import {
  ChevronLeft,
  Shrink,
  Loader2,
  Share2,
  Download,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  FileText,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useI18n } from "@/components/talib/i18n-provider";
import { cn } from "@/lib/utils";
import {
  canvasToBlob,
  dateStamp,
  downloadBlob,
  formatBytes,
  friendlyFileError,
  loadPdfJs,
  loadPdfLib,
  nextPaint,
  pdfBytesToBlob,
  pickFiles,
  shareOrDownload,
} from "./shared";

type Preset = "light" | "balanced" | "strong";

const PRESETS: Record<
  Preset,
  { label: string; desc: string; scale: number; quality: number }
> = {
  light: {
    label: "خفيف — جودة عالية",
    desc: "حجم أصغر قليلاً، جودة قريبة جداً من الأصل",
    scale: 2.2,
    quality: 0.8,
  },
  balanced: {
    label: "متوازن (موصى به)",
    desc: "توازن جيد بين الحجم والجودة",
    scale: 1.6,
    quality: 0.65,
  },
  strong: {
    label: "قوي — أصغر حجم",
    desc: "أكبر توفير — قد تتأثر وضوح النص قليلاً",
    scale: 1.2,
    quality: 0.5,
  },
};

interface Result {
  blob: Blob;
  originalSize: number;
  pageCount: number;
  grew: boolean; // honest flag: output ended up >= original
}

export function CompressPdfTool({ onBack }: { onBack: () => void }) {
  const { dir } = useI18n();
  const [file, setFile] = React.useState<File | null>(null);
  const [preset, setPreset] = React.useState<Preset>("balanced");
  const [processing, setProcessing] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [result, setResult] = React.useState<Result | null>(null);

  async function pickPdf() {
    const [picked] = await pickFiles("application/pdf,.pdf", false);
    if (!picked) return;
    // Quick sanity check: a PDF must start with "%PDF" (handle BOM-less fakes).
    const head = new Uint8Array(await picked.slice(0, 5).arrayBuffer());
    const header = String.fromCharCode(...head);
    if (header !== "%PDF-") {
      toast.error("الملف ليس بصيغة PDF صحيحة.");
      return;
    }
    setFile(picked);
    setResult(null);
  }

  async function compress() {
    if (!file || processing) return;
    setProcessing(true);
    setProgress(0);
    setResult(null);
    let pdfjsDoc: PDFDocumentProxy | null = null;
    try {
      const pdfjs = await loadPdfJs();
      const { PDFDocument } = await loadPdfLib();

      // getDocument() detaches its input buffer — pass a copy and keep the
      // original File for the size comparison.
      const data = new Uint8Array(await file.arrayBuffer());
      pdfjsDoc = await pdfjs.getDocument({ data }).promise;
      const pageCount = pdfjsDoc.numPages;

      const out = await PDFDocument.create();
      const { scale, quality } = PRESETS[preset];

      for (let i = 1; i <= pageCount; i++) {
        const page = await pdfjsDoc.getPage(i);
        // scale 1 = original page size in PDF points → keep page geometry.
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas unavailable");
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        page.cleanup();

        const jpeg = await canvasToBlob(canvas, "image/jpeg", quality);
        const jpgBytes = new Uint8Array(await jpeg.arrayBuffer());
        const embedded = await out.embedJpg(jpgBytes);
        // Preserve the ORIGINAL page dimensions (not the scaled canvas ones).
        out.addPage([base.width, base.height]).drawImage(embedded, {
          x: 0,
          y: 0,
          width: base.width,
          height: base.height,
        });

        setProgress(Math.round((i / pageCount) * 100));
        await nextPaint();
      }

      const bytes = await out.save();
      const blob = pdfBytesToBlob(bytes);
      setResult({
        blob,
        originalSize: file.size,
        pageCount,
        grew: blob.size >= file.size,
      });
      if (blob.size < file.size) {
        toast.success(`تم التصغير بنجاح — وفّرت ${Math.round((1 - blob.size / file.size) * 100)}%`);
      } else {
        toast.info("لم يصغر الملف — انظر الملاحظة بالأسفل");
      }
    } catch (e) {
      toast.error(friendlyFileError(e, "تعذّر ضغط هذا الملف."));
    } finally {
      try { await pdfjsDoc?.destroy(); } catch { /* already gone */ }
      setProcessing(false);
    }
  }

  const outName = file ? `${file.name.replace(/\.pdf$/i, "")}-مضغوط.pdf` : "مضغوط.pdf";

  async function handleShare() {
    if (!result) return;
    const outcome = await shareOrDownload(result.blob, outName, "ملف PDF مضغوط");
    if (outcome === "downloaded") toast.success("تم تنزيل الملف");
  }

  function handleDownload() {
    if (!result) return;
    downloadBlob(result.blob, outName);
  }

  function reset() {
    setFile(null);
    setResult(null);
    setProgress(0);
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
            <Shrink className="w-5 h-5 text-primary" />
            ضغط PDF
          </h2>
          <p className="text-xs text-muted-foreground">قلّص حجم ملفاتك الكبيرة قبل إرسالها</p>
        </div>
      </div>

      {/* Privacy reminder */}
      <Card className="flex-row items-center gap-3 p-3 bg-primary/5 border-primary/20">
        <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          المعالجة تتم داخل جهازك فقط — لا يُرفع أي ملف إلى أي خادم.
        </p>
      </Card>

      {!result ? (
        <>
          {/* File picker */}
          <Button variant="outline" className="w-full" onClick={pickPdf} disabled={processing}>
            <FileText className="w-4 h-4 ml-2" />
            {file ? "اختيار ملف آخر" : "اختيار ملف PDF"}
          </Button>

          {file && (
            <Card className="flex-row items-center gap-3 p-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold truncate" dir="auto">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
              </div>
              <Badge variant="secondary" className="text-xs shrink-0">PDF</Badge>
            </Card>
          )}

          {/* Quality presets */}
          {file && (
            <Card className="p-4 space-y-3">
              <p className="text-sm font-bold">درجة الضغط</p>
              <div className="space-y-2">
                {(Object.keys(PRESETS) as Preset[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPreset(key)}
                    disabled={processing}
                    className={cn(
                      "w-full text-right rounded-xl border p-3 transition-colors",
                      preset === key
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40"
                    )}
                    aria-pressed={preset === key}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "w-4 h-4 rounded-full border-2 shrink-0",
                          preset === key ? "border-primary bg-primary" : "border-muted-foreground/40"
                        )}
                      />
                      <span className="text-sm font-bold">{PRESETS[key].label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 ps-6">{PRESETS[key].desc}</p>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed border-t pt-2">
                يتم إعادة ترميز الصفحات كصور مضغوطة — النص القابل للنسخ يتحول إلى صور،
                وتُحفظ أبعاد الصفحات كما هي.
              </p>
              <Button className="w-full" onClick={compress} disabled={processing}>
                {processing ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    جارٍ الضغط… {progress}%
                  </>
                ) : (
                  <>
                    <Shrink className="w-4 h-4 ml-2" />
                    ابدأ الضغط
                  </>
                )}
              </Button>
              {processing && <Progress value={progress} />}
            </Card>
          )}
        </>
      ) : (
        /* Result card */
        <Card className="p-5 space-y-4">
          {result.grew ? (
            <div className="space-y-2 text-center">
              <AlertTriangle className="w-12 h-12 mx-auto text-amber-500" />
              <h3 className="font-bold text-sm">لم نتمكن من تصغير هذا الملف</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                النتيجة ({formatBytes(result.blob.size)}) ليست أصغر من الأصل
                ({formatBytes(result.originalSize)}) — غالباً لأن الملف نصيّ ومضغوط أصلاً
                بكفاءة. ننصحك بالإبقاء على الملف الأصلي، ويمكنك مع ذلك تنزيل النتيجة إن أردت.
              </p>
            </div>
          ) : (
            <div className="space-y-2 text-center">
              <CheckCircle2 className="w-12 h-12 mx-auto text-primary" />
              <h3 className="font-bold text-sm">تم الضغط بنجاح</h3>
              <div className="flex items-center justify-center gap-3 text-sm">
                <span className="text-muted-foreground line-through decoration-muted-foreground/50">
                  {formatBytes(result.originalSize)}
                </span>
                <ChevronLeft className={cn("w-4 h-4 text-primary", dir === "rtl" && "rotate-180")} />
                <span className="font-black text-primary">{formatBytes(result.blob.size)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                وفّرت {Math.round((1 - result.blob.size / result.originalSize) * 100)}% من الحجم
                ({result.pageCount} {result.pageCount === 1 ? "صفحة" : "صفحات"})
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={handleShare}>
              <Share2 className="w-4 h-4 ml-2" />
              مشاركة
            </Button>
            <Button variant="outline" onClick={handleDownload}>
              <Download className="w-4 h-4 ml-2" />
              تنزيل
            </Button>
          </div>
          <Button variant="ghost" onClick={reset} className="w-full text-muted-foreground">
            <RefreshCw className="w-4 h-4 ml-2" />
            ضغط ملف آخر
          </Button>
        </Card>
      )}
    </div>
  );
}
