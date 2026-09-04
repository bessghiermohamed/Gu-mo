"use client";

/**
 * أدواتي — Tool 5: استخراج صفحات من PDF.
 *
 * Student picks ONE PDF, sees its real page count, then types which pages
 * to keep — "1-3, 5, 8-10" style — and pdf-lib copies just those pages
 * into a new document. The classic use: share only the exercise pages of
 * a 200-page course file, not the whole thing.
 *
 * Everything is client-side (same privacy guarantee as the other file
 * tools). Strict pdf-lib load (no ignoreEncryption) so password-protected
 * files fail LOUDLY with a friendly Arabic message instead of producing
 * a silently-broken output.
 */

import * as React from "react";
import {
  ChevronLeft,
  Scissors,
  Loader2,
  Plus,
  Share2,
  Download,
  ShieldCheck,
  CheckCircle2,
  FileText,
  AlertTriangle,
  RefreshCw,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { PDFDocument } from "pdf-lib";
import { useI18n } from "@/components/talib/i18n-provider";
import { cn } from "@/lib/utils";
import {
  dateStamp,
  downloadBlob,
  formatBytes,
  friendlyFileError,
  loadPdfLib,
  pdfBytesToBlob,
  pickFiles,
  shareOrDownload,
} from "./shared";

interface Result {
  blob: Blob;
  pageCount: number;
}

/** Parse "1-3, 5, 8-10" → deduped, sorted, 1-based page list (validated
 * against the document's real count by the caller). Empty string → []. */
function parseRanges(
  input: string,
  maxPages: number
): { pages: number[]; error?: string } {
  const trimmed = input.trim();
  if (!trimmed) return { pages: [] };
  const pages = new Set<number>();
  // Arabic keyboards sometimes yield Arabic-Indic digits — normalize them.
  const normalized = trimmed.replace(/[\u0660-\u0669]/g, (d) =>
    String(d.charCodeAt(0) - 0x0660)
  );
  for (const part of normalized.split(/[,،;؛\s]+/)) {
    if (!part) continue;
    const range = part.split("-").map((n) => n.trim());
    if (range.length === 1) {
      const n = Number(range[0]);
      if (!Number.isInteger(n) || n < 1) return { pages: [], error: `«${part}» ليس رقم صفحة صحيحاً.` };
      if (n > maxPages) return { pages: [], error: `الصفحة ${n} غير موجودة — الملف فيه ${maxPages} صفحات فقط.` };
      pages.add(n);
    } else if (range.length === 2) {
      const a = Number(range[0]);
      const b = Number(range[1]);
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < 1 || a > maxPages || b > maxPages) {
        return { pages: [], error: `المجال «${part}» غير صحيح (الملف فيه ${maxPages} صفحات).` };
      }
      if (a > b) return { pages: [], error: `في «${part}» البداية أكبر من النهاية.` };
      for (let n = a; n <= b; n++) pages.add(n);
    } else {
      return { pages: [], error: `«${part}» صيغة غير مفهومة — استخدم مثلاً: 1-3, 5, 8-10` };
    }
  }
  return { pages: [...pages].sort((a, b) => a - b) };
}

export function ExtractPdfTool({ onBack }: { onBack: () => void }) {
  const { dir } = useI18n();
  const [file, setFile] = React.useState<File | null>(null);
  const [pageCount, setPageCount] = React.useState<number | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [ranges, setRanges] = React.useState("");
  const [processing, setProcessing] = React.useState(false);
  const [result, setResult] = React.useState<Result | null>(null);

  // Loaded PDFDocument cache (validated once, reused at extract time).
  const docRef = React.useRef<PDFDocument | null>(null);

  async function pickPdf() {
    const files = await pickFiles("application/pdf,.pdf", false);
    if (files.length === 0) return;
    const picked = files[0];
    setResult(null);
    setLoadError(null);
    setPageCount(null);
    setRanges("");
    setFile(picked);
    try {
      const bytes = await picked.arrayBuffer();
      const { PDFDocument } = await loadPdfLib();
      const doc = await PDFDocument.load(bytes);
      docRef.current = doc;
      setPageCount(doc.getPageCount());
    } catch (e) {
      docRef.current = null;
      setFile(picked);
      setLoadError(friendlyFileError(e, "تعذّر قراءة الملف."));
    }
  }

  const parsed = pageCount ? parseRanges(ranges, pageCount) : { pages: [] };
  const selectionValid = parsed.pages.length > 0 && !parsed.error;
  // Keeping every page would just duplicate the file — require a real subset.
  const isSubset = parsed.pages.length > 0 && parsed.pages.length < (pageCount ?? Infinity);

  async function extract() {
    if (!docRef.current || !file || !selectionValid || !isSubset || processing) return;
    setProcessing(true);
    try {
      const { PDFDocument } = await loadPdfLib();
      const src = docRef.current;
      const out = await PDFDocument.create();
      // Set to 0-based indices for copyPages.
      const indices = parsed.pages.map((p) => p - 1);
      const copied = await out.copyPages(src, indices);
      copied.forEach((p) => out.addPage(p));
      const bytes = await out.save();
      setResult({ blob: pdfBytesToBlob(bytes), pageCount: out.getPageCount() });
      toast.success("تم استخراج الصفحات بنجاح");
    } catch (e) {
      toast.error(friendlyFileError(e, "تعذّر استخراج الصفحات من هذا الملف."));
    } finally {
      setProcessing(false);
    }
  }

  async function handleShare() {
    if (!result) return;
    const base = file?.name.replace(/\.pdf$/i, "") ?? "ملف";
    const outcome = await shareOrDownload(result.blob, `مقتطف-${base}-${dateStamp()}.pdf`, "مقتطف PDF");
    if (outcome === "downloaded") toast.success("تم تنزيل الملف");
  }

  function handleDownload() {
    if (!result) return;
    const base = file?.name.replace(/\.pdf$/i, "") ?? "ملف";
    downloadBlob(result.blob, `مقتطف-${base}-${dateStamp()}.pdf`);
  }

  function reset() {
    docRef.current = null;
    setFile(null);
    setPageCount(null);
    setLoadError(null);
    setRanges("");
    setResult(null);
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
            <Scissors className="w-5 h-5 text-primary" />
            استخراج صفحات من PDF
          </h2>
          <p className="text-xs text-muted-foreground">شارك فقط الصفحات التي تهمّ زميلك</p>
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
          {!file ? (
            <Button variant="outline" className="w-full" onClick={pickPdf}>
              <Plus className="w-4 h-4 ml-2" />
              اختيار ملف PDF
            </Button>
          ) : (
            <Card className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                    loadError ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
                  )}
                >
                  {loadError ? <AlertTriangle className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold truncate" dir="auto">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(file.size)}
                    {pageCount != null && ` — ${pageCount} ${pageCount === 1 ? "صفحة" : "صفحات"}`}
                  </p>
                  {loadError && (
                    <p className="text-xs text-destructive leading-relaxed mt-1">{loadError}</p>
                  )}
                </div>
                {pageCount != null && (
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {pageCount}
                  </Badge>
                )}
              </div>

              {pageCount != null && (
                <>
                  <div className="space-y-1.5">
                    <label htmlFor="extract-ranges" className="text-xs font-medium">
                      الصفحات المطلوبة (مثال: <span dir="ltr">1-3, 5, 8-10</span>)
                    </label>
                    <Input
                      id="extract-ranges"
                      dir="ltr"
                      inputMode="numeric"
                      value={ranges}
                      onChange={(e) => setRanges(e.target.value)}
                      placeholder="1-3, 5, 8-10"
                    />
                  </div>

                  <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <p>
                      ترتيب الصفحات في الملف الناتج يتبع ترتيبك هنا. الأرقام المتكررة تُستخرج مرة واحدة.
                    </p>
                  </div>

                  {parsed.error && (
                    <p className="text-xs text-destructive">{parsed.error}</p>
                  )}
                  {selectionValid && !isSubset && !parsed.error && (
                    <p className="text-xs text-muted-foreground">
                      اخترت كل الصفحات ({parsed.pages.length}) — الناتج سيطابق الملف الأصلي، اختر مجالاً أضيق.
                    </p>
                  )}

                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={extract}
                      disabled={processing || !isSubset || !!parsed.error}
                    >
                      {processing ? (
                        <>
                          <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                          جارٍ الاستخراج…
                        </>
                      ) : (
                        <>
                          <Scissors className="w-4 h-4 ml-2" />
                          استخراج {selectionValid ? `${parsed.pages.length} ${parsed.pages.length === 1 ? "صفحة" : "صفحات"}` : ""}
                        </>
                      )}
                    </Button>
                    <Button variant="ghost" onClick={reset} aria-label="اختيار ملف آخر">
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  </div>
                </>
              )}
            </Card>
          )}
        </>
      ) : (
        /* Success card */
        <Card className="p-5 space-y-4 text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto text-primary" />
          <div>
            <h3 className="font-bold text-sm mb-1">تم الاستخراج بنجاح</h3>
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
            استخراج صفحات أخرى
          </Button>
        </Card>
      )}
    </div>
  );
}
