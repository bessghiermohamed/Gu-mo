"use client";

/**
 * أدواتي — Tool 3: دمج ملفات PDF.
 *
 * Student picks several PDFs, each file is validated up front (readable?
 * encrypted?) and its page count shown, drag-reorders the list, then pdf-lib
 * copyPages() stitches them into one document — fully client-side.
 *
 * Validation uses a strict pdf-lib load (no ignoreEncryption) so
 * password-protected files fail LOUDLY here with a friendly Arabic message,
 * instead of producing a silently-broken merged PDF. Encrypted-but-openable
 * files can still be flattened via the ضغط tool first, then merged.
 */

import * as React from "react";
import {
  ChevronLeft,
  Combine,
  Loader2,
  Plus,
  Share2,
  Download,
  ShieldCheck,
  CheckCircle2,
  FileText,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import type { PDFDocument } from "pdf-lib";
import { useI18n } from "@/components/talib/i18n-provider";
import { cn } from "@/lib/utils";
import { SortableFileList } from "./sortable-file-list";
import {
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

interface MergeItem {
  id: string;
  file: File;
  status: "checking" | "ok" | "error";
  pageCount?: number;
  error?: string;
}

interface Result {
  blob: Blob;
  pageCount: number;
  fileCount: number;
}

export function MergePdfTool({ onBack }: { onBack: () => void }) {
  const { dir } = useI18n();
  const [items, setItems] = React.useState<MergeItem[]>([]);
  const [processing, setProcessing] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [result, setResult] = React.useState<Result | null>(null);

  // Loaded PDFDocument cache (validation result reused at merge time —
  // avoids parsing every file twice). Kept in a ref: not render state.
  const docsRef = React.useRef<Map<string, PDFDocument>>(new Map());

  async function addPdfs() {
    const files = await pickFiles("application/pdf,.pdf", true);
    if (files.length === 0) return;

    const newItems: MergeItem[] = files.map((file) => ({
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
      file,
      status: "checking",
    }));
    setItems((prev) => [...prev, ...newItems]);

    // Validate each file as its own async unit — one bad PDF must never
    // block or crash the others; the row simply turns red and is skipped.
    let failedCount = 0;
    for (const item of newItems) {
      try {
        const bytes = await item.file.arrayBuffer();
        const { PDFDocument } = await loadPdfLib();
        const doc = await PDFDocument.load(bytes);
        docsRef.current.set(item.id, doc);
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, status: "ok", pageCount: doc.getPageCount() } : i
          )
        );
      } catch (e) {
        failedCount++;
        const friendly = friendlyFileError(e, "تعذّر قراءة الملف.");
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: "error", error: friendly } : i))
        );
      }
    }
    if (failedCount > 0) {
      toast.error(
        `${failedCount === 1 ? "ملف واحد لم" : failedCount + " ملفات لم"} يُمكن قراءته — راجع القائمة بالأسفل.`
      );
    }
  }

  function removeItem(id: string) {
    docsRef.current.delete(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  const validItems = items.filter((i) => i.status === "ok");
  const totalPages = validItems.reduce((sum, i) => sum + (i.pageCount ?? 0), 0);

  async function merge() {
    if (validItems.length < 2 || processing) return;
    setProcessing(true);
    setProgress(0);
    setResult(null);
    try {
      const { PDFDocument } = await loadPdfLib();
      const merged = await PDFDocument.create();

      for (let i = 0; i < validItems.length; i++) {
        const item = validItems[i];
        const src =
          docsRef.current.get(item.id) ??
          (await PDFDocument.load(await item.file.arrayBuffer()));
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach((p) => merged.addPage(p));
        setProgress(Math.round(((i + 1) / validItems.length) * 100));
        await nextPaint();
      }

      const bytes = await merged.save();
      setResult({
        blob: pdfBytesToBlob(bytes),
        pageCount: merged.getPageCount(),
        fileCount: validItems.length,
      });
      toast.success("تم الدمج بنجاح");
    } catch (e) {
      toast.error(friendlyFileError(e, "تعذّر دمج هذه الملفات."));
    } finally {
      setProcessing(false);
    }
  }

  async function handleShare() {
    if (!result) return;
    const outcome = await shareOrDownload(result.blob, `مدموج-${dateStamp()}.pdf`, "ملف PDF مدموج");
    if (outcome === "downloaded") toast.success("تم تنزيل الملف");
  }

  function handleDownload() {
    if (!result) return;
    downloadBlob(result.blob, `مدموج-${dateStamp()}.pdf`);
  }

  function reset() {
    docsRef.current.clear();
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
            <Combine className="w-5 h-5 text-primary" />
            دمج ملفات PDF
          </h2>
          <p className="text-xs text-muted-foreground">اجمع عدة ملفات في ملف واحد بنفس الترتيب</p>
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
          <Button variant="outline" className="w-full" onClick={addPdfs} disabled={processing}>
            <Plus className="w-4 h-4 ml-2" />
            اختيار ملفات PDF
          </Button>

          {items.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground">
                {validItems.length} ملفات صالحة — اسحب ⠿ لإعادة الترتيب (الترتيب هنا هو ترتيب الدمج)
              </p>
              <SortableFileList
                items={items}
                onReorder={setItems}
                onRemove={removeItem}
                removeLabel="إزالة الملف"
                renderItem={(item) => (
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                        item.status === "error"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-primary/10 text-primary"
                      )}
                    >
                      {item.status === "checking" ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : item.status === "error" ? (
                        <AlertTriangle className="w-5 h-5" />
                      ) : (
                        <FileText className="w-5 h-5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold truncate" dir="auto">{item.file.name}</p>
                      {item.status === "ok" && (
                        <p className="text-xs text-muted-foreground">
                          {formatBytes(item.file.size)}
                          {item.pageCount != null &&
                            ` — ${item.pageCount} ${item.pageCount === 1 ? "صفحة" : "صفحات"}`}
                        </p>
                      )}
                      {item.status === "checking" && (
                        <p className="text-xs text-muted-foreground">جارٍ التحقق…</p>
                      )}
                      {item.status === "error" && (
                        <p className="text-xs text-destructive leading-relaxed">
                          {item.error}
                          {item.error?.includes("كلمة مرور") && " — جرّب أداة الضغط أولاً ثم ادمج الناتج."}
                        </p>
                      )}
                    </div>
                    {item.status === "ok" && item.pageCount != null && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {item.pageCount}
                      </Badge>
                    )}
                  </div>
                )}
              />
            </div>
          )}

          {validItems.length >= 2 && (
            <Card className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground text-center">
                سيتم دمج {validItems.length} ملفات ({totalPages}{" "}
                {totalPages === 1 ? "صفحة" : "صفحات"}) بالترتيب المعروض
              </p>
              <Button className="w-full" onClick={merge} disabled={processing}>
                {processing ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    جارٍ الدمج… {progress}%
                  </>
                ) : (
                  <>
                    <Combine className="w-4 h-4 ml-2" />
                    دمج الملفات
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
            <h3 className="font-bold text-sm mb-1">تم الدمج بنجاح</h3>
            <p className="text-xs text-muted-foreground">
              {result.fileCount} ملفات → {result.pageCount}{" "}
              {result.pageCount === 1 ? "صفحة" : "صفحات"} — {formatBytes(result.blob.size)}
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
            دمج ملفات أخرى
          </Button>
        </Card>
      )}
    </div>
  );
}
