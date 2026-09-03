"use client";

/**
 * أدواتي — Tool 1: صور إلى PDF.
 *
 * Student picks one or more images from the device; each image becomes one
 * A4 page (contained, centered, small margin) in the ORDER shown in the
 * reorderable list. Runs fully client-side (Canvas + pdf-lib) — no upload.
 */

import * as React from "react";
import {
  ChevronLeft,
  Images,
  Loader2,
  Plus,
  RefreshCw,
  Share2,
  Download,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useI18n } from "@/components/talib/i18n-provider";
import { cn } from "@/lib/utils";
import { SortableFileList } from "./sortable-file-list";
import {
  A4,
  canvasToBlob,
  dateStamp,
  downloadBlob,
  formatBytes,
  friendlyFileError,
  loadPdfLib,
  nextPaint,
  pdfBytesToBlob,
  pickFiles,
  shareOrDownload,
} from "./shared";

interface ImageItem {
  id: string;
  file: File;
  previewUrl: string;
}

interface Result {
  blob: Blob;
  pageCount: number;
}

const MARGIN = 20; // pt — small A4 margin so photos read like scanned pages

export function ImageToPdfTool({ onBack }: { onBack: () => void }) {
  const { dir } = useI18n();
  const [items, setItems] = React.useState<ImageItem[]>([]);
  const [processing, setProcessing] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [result, setResult] = React.useState<Result | null>(null);

  // Revoke preview object URLs when rows are removed / the tool unmounts.
  React.useEffect(() => {
    return () => {
      items.forEach((i) => URL.revokeObjectURL(i.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addImages() {
    const files = await pickFiles("image/*", true);
    if (files.length === 0) return;

    const accepted: ImageItem[] = [];
    let rejected = 0;
    for (const file of files) {
      // Decode check up front: HEIC and other exotic formats fail here with
      // a per-file toast instead of crashing mid-generation later.
      try {
        await createImageBitmap(file);
        accepted.push({
          id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
          file,
          previewUrl: URL.createObjectURL(file),
        });
      } catch {
        rejected++;
      }
    }
    if (rejected > 0) {
      toast.error(
        `تم تجاهل ${rejected} ${rejected === 1 ? "صورة" : "صور"} بصيغة غير مدعومة (مثلاً HEIC) — حوّلها إلى JPG ثم أعد إضافتها.`
      );
    }
    if (accepted.length > 0) setItems((prev) => [...prev, ...accepted]);
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }

  async function generate() {
    if (items.length === 0 || processing) return;
    setProcessing(true);
    setProgress(0);
    setResult(null);
    try {
      const { PDFDocument } = await loadPdfLib();
      const pdf = await PDFDocument.create();

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        // Re-decode per page (bitmaps from validation aren't kept — memory).
        const bitmap = await createImageBitmap(item.file);

        // Re-encode as JPEG so phone photos (often multi-MB HEIC/PNG) don't
        // bloat the PDF. Cap the longest side at 2000px — plenty for A4.
        const maxSide = 2000;
        const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
        const w = Math.max(1, Math.round(bitmap.width * scale));
        const h = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas unavailable");
        ctx.fillStyle = "#FFFFFF"; // JPEG has no alpha — avoid black backgrounds
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(bitmap, 0, 0, w, h);
        bitmap.close();

        const jpeg = await canvasToBlob(canvas, "image/jpeg", 0.85);
        const jpgBytes = new Uint8Array(await jpeg.arrayBuffer());
        const embedded = await pdf.embedJpg(jpgBytes);

        // A4 page, image contained + centered inside the margin.
        const [pageW, pageH] = A4;
        const availW = pageW - MARGIN * 2;
        const availH = pageH - MARGIN * 2;
        const fit = Math.min(availW / embedded.width, availH / embedded.height);
        const drawW = embedded.width * fit;
        const drawH = embedded.height * fit;
        const page = pdf.addPage([pageW, pageH]);
        page.drawImage(embedded, {
          x: (pageW - drawW) / 2,
          y: (pageH - drawH) / 2,
          width: drawW,
          height: drawH,
        });

        setProgress(Math.round(((i + 1) / items.length) * 100));
        await nextPaint();
      }

      const bytes = await pdf.save();
      setResult({ blob: pdfBytesToBlob(bytes), pageCount: items.length });
      toast.success("تم إنشاء ملف PDF بنجاح");
    } catch (e) {
      toast.error(friendlyFileError(e, "تعذّر إنشاء ملف PDF من هذه الصور."));
    } finally {
      setProcessing(false);
    }
  }

  async function handleShare() {
    if (!result) return;
    const outcome = await shareOrDownload(result.blob, `صور-${dateStamp()}.pdf`, "ملف PDF من الصور");
    if (outcome === "downloaded") toast.success("تم تنزيل الملف");
  }

  function handleDownload() {
    if (!result) return;
    downloadBlob(result.blob, `صور-${dateStamp()}.pdf`);
  }

  function reset() {
    items.forEach((i) => URL.revokeObjectURL(i.previewUrl));
    setItems([]);
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
            <Images className="w-5 h-5 text-primary" />
            صور إلى PDF
          </h2>
          <p className="text-xs text-muted-foreground">
            حوّل صور جهازك إلى ملف PDF واحد — كل صورة في صفحة
          </p>
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
          {/* Picker */}
          <Button variant="outline" className="w-full" onClick={addImages} disabled={processing}>
            <Plus className="w-4 h-4 ml-2" />
            اختيار الصور من الجهاز
          </Button>

          {/* Reorderable list */}
          {items.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  {items.length} {items.length === 1 ? "صورة" : "صور"} — اسحب ⠿ لإعادة الترتيب
                </p>
                <Button variant="ghost" size="sm" onClick={reset} className="h-7 text-xs text-muted-foreground">
                  مسح الكل
                </Button>
              </div>
              <SortableFileList
                items={items}
                onReorder={setItems}
                onRemove={removeItem}
                removeLabel="إزالة الصورة"
                renderItem={(item) => (
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.previewUrl}
                      alt=""
                      className="w-12 h-12 rounded-lg object-cover border shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold truncate" dir="auto">{item.file.name}</p>
                      <p className="text-xs text-muted-foreground">{formatBytes(item.file.size)}</p>
                    </div>
                    <Badge variant="secondary" className="text-xs shrink-0">صفحة</Badge>
                  </div>
                )}
              />
            </div>
          )}

          {/* Generate */}
          {items.length > 0 && (
            <Card className="p-4 space-y-3">
              <Button className="w-full" onClick={generate} disabled={processing}>
                {processing ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    جارٍ الإنشاء… {progress}%
                  </>
                ) : (
                  <>
                    <Images className="w-4 h-4 ml-2" />
                    إنشاء PDF ({items.length} {items.length === 1 ? "صفحة" : "صفحات"})
                  </>
                )}
              </Button>
              {processing && <Progress value={progress} />}
            </Card>
          )}
        </>
      ) : (
        /* Success card */
        <Card className="p-5 space-y-4 text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto text-primary" />
          <div>
            <h3 className="font-bold text-sm mb-1">ملف PDF جاهز</h3>
            <p className="text-xs text-muted-foreground">
              {result.pageCount} {result.pageCount === 1 ? "صفحة" : "صفحات"} — {formatBytes(result.blob.size)}
            </p>
          </div>
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
            إنشاء ملف جديد
          </Button>
        </Card>
      )}
    </div>
  );
}
