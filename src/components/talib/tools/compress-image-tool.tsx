"use client";

/**
 * أدواتي — Tool 8: ضغط الصور (round 43).
 *
 * Client-side image compression via browser-image-compression (MIT, web
 * worker): students shrink heavy photos (board photos, document scans)
 * before sending them to the group or uploading to Drive. Same honest-result
 * rule as ضغط PDF: if the output isn't smaller than the original, the tool
 * says so instead of pretending to help.
 *
 * PRIVACY: 100% on-device — no fetch, no upload.
 */

import * as React from "react";
import {
  CheckCircle2,
  ChevronLeft,
  Download,
  FileImage,
  ImageDown,
  Loader2,
  RefreshCw,
  Share2,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useI18n } from "@/components/talib/i18n-provider";
import { cn } from "@/lib/utils";
import {
  dateStamp,
  downloadBlob,
  formatBytes,
  friendlyFileError,
  nextPaint,
  pickFiles,
  shareOrDownload,
} from "./shared";

type Preset = "light" | "balanced" | "strong";

const PRESETS: Record<
  Preset,
  { label: string; desc: string; maxSizeMB: number; quality: number }
> = {
  light: {
    label: "خفيف — جودة عالية",
    desc: "صغّر بلا خسارة تُذكر — مثالي قبل رفع الصور إلى Drive",
    maxSizeMB: 2,
    quality: 0.85,
  },
  balanced: {
    label: "متوازن (موصى به)",
    desc: "حجم مناسب للإرسال في المجموعات مع جودة جيدة",
    maxSizeMB: 1,
    quality: 0.7,
  },
  strong: {
    label: "قوي — أصغر حجم",
    desc: "أصغر حجم ممكن — للصور النصية والوثائق",
    maxSizeMB: 0.35,
    quality: 0.55,
  },
};

interface ResultRow {
  original: File;
  compressed: Blob;
  name: string;
  grew: boolean;
}

export function CompressImageTool({ onBack }: { onBack: () => void }) {
  const { dir } = useI18n();
  const [files, setFiles] = React.useState<File[]>([]);
  const [preset, setPreset] = React.useState<Preset>("balanced");
  const [processing, setProcessing] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [rows, setRows] = React.useState<ResultRow[] | null>(null);

  async function pick() {
    const picked = await pickFiles("image/jpeg,image/png,image/webp,image/jpg", true);
    if (!picked.length) return;
    if (picked.length > 20) {
      toast.error("حتى ٢٠ صورة في المرة — كرر العملية للباقي");
      return;
    }
    setFiles(picked);
    setRows(null);
  }

  async function compress() {
    if (!files.length || processing) return;
    setProcessing(true);
    setProgress(0);
    setRows(null);
    try {
      const { default: imageCompression } = await import("browser-image-compression");
      const out: ResultRow[] = [];
      const { maxSizeMB, quality } = PRESETS[preset];

      for (let i = 0; i < files.length; i++) {
        const original = files[i];
        const compressed = await imageCompression(original, {
          maxSizeMB,
          initialQuality: quality,
          useWebWorker: true,
          fileType: "image/jpeg",
        });
        const baseName = original.name.replace(/\.[a-z0-9]+$/i, "");
        out.push({
          original,
          compressed,
          name: `${baseName}-مضغوطة.jpg`,
          grew: compressed.size >= original.size,
        });
        setProgress(Math.round(((i + 1) / files.length) * 100));
        await nextPaint();
      }

      setRows(out);
      const totalIn = files.reduce((s, f) => s + f.size, 0);
      const totalOut = out.reduce((s, r) => s + r.compressed.size, 0);
      if (totalOut < totalIn) {
        toast.success(`تم — وفّرت ${Math.round((1 - totalOut / totalIn) * 100)}% من الحجم`);
      } else {
        toast.info("الصور أصلاً خفيفة — انظر الملاحظات بالأسفل");
      }
    } catch (e) {
      toast.error(friendlyFileError(e, "تعذّر ضغط هذه الصور."));
    } finally {
      setProcessing(false);
    }
  }

  const savedPct =
    rows && files.length
      ? (() => {
          const totalIn = files.reduce((s, f) => s + f.size, 0);
          const totalOut = rows.reduce((s, r) => s + r.compressed.size, 0);
          return totalOut < totalIn ? Math.round((1 - totalOut / totalIn) * 100) : 0;
        })()
      : 0;

  async function handleShare(row: ResultRow) {
    const outcome = await shareOrDownload(row.compressed, row.name, "صورة مضغوطة");
    if (outcome === "downloaded") toast.success("تم تنزيل الصورة");
  }

  function reset() {
    setFiles([]);
    setRows(null);
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
            <ImageDown className="w-5 h-5 text-primary" />
            ضغط الصور
          </h2>
          <p className="text-xs text-muted-foreground">صغّر حجم الصور الثقيلة قبل إرسالها</p>
        </div>
      </div>

      {/* Privacy reminder */}
      <Card className="flex-row items-center gap-3 p-3 bg-primary/5 border-primary/20">
        <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          المعالجة تتم داخل جهازك فقط — لا تُرفع صورك إلى أي خادم.
        </p>
      </Card>

      {!rows ? (
        <>
          <Button variant="outline" className="w-full" onClick={pick} disabled={processing}>
            <FileImage className="w-4 h-4 ml-2" />
            {files.length ? "اختيار صور أخرى" : "اختيار الصور (حتى ٢٠)"}
          </Button>

          {files.length > 0 && (
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold">{files.length} صورة مختارة</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(files.reduce((s, f) => s + f.size, 0))}
                </p>
              </div>
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
              <Button className="w-full" onClick={compress} disabled={processing}>
                {processing ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    جارٍ الضغط… {progress}%
                  </>
                ) : (
                  <>
                    <ImageDown className="w-4 h-4 ml-2" />
                    ابدأ الضغط
                  </>
                )}
              </Button>
              {processing && <Progress value={progress} />}
            </Card>
          )}
        </>
      ) : (
        <div className="space-y-3">
          {/* Summary */}
          <Card className="p-5 space-y-2 text-center">
            {savedPct > 0 ? (
              <>
                <CheckCircle2 className="w-12 h-12 mx-auto text-primary" />
                <h3 className="font-bold text-sm">تم ضغط {rows.length} صورة</h3>
                <p className="text-xs text-muted-foreground">
                  وفّرت {savedPct}% من الحجم الإجمالي
                </p>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-12 h-12 mx-auto text-amber-500" />
                <h3 className="font-bold text-sm">الصور أصلاً بحجم صغير</h3>
                <p className="text-xs text-muted-foreground">
                  لم نتمكن من تصغيرها أكثر — يمكنك تنزيل النتائج أو الإبقاء على الأصول
                </p>
              </>
            )}
          </Card>

          {/* Per-image rows */}
          {rows.map((row, i) => (
            <Card key={i} className="p-3 flex-row items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <FileImage className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold truncate" dir="auto">{row.original.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(row.original.size)} ←{" "}
                  <span className={row.grew ? "text-amber-600" : "text-primary font-bold"}>
                    {formatBytes(row.compressed.size)}
                  </span>
                </p>
              </div>
              {row.grew ? (
                <Badge variant="secondary" className="text-[10px] shrink-0">الأصل أفضل</Badge>
              ) : (
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleShare(row)} aria-label="مشاركة">
                    <Share2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => downloadBlob(row.compressed, row.name)} aria-label="تنزيل">
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </Card>
          ))}

          <Button variant="ghost" onClick={reset} className="w-full text-muted-foreground">
            <RefreshCw className="w-4 h-4 ml-2" />
            ضغط صور أخرى
          </Button>
        </div>
      )}
    </div>
  );
}
