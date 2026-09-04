"use client";

/**
 * سحابتي — the Google Drive tab inside ملفاتي (round 31).
 *
 * Owner request: "can't I add a cloud like Google Drive to upload my files
 * and connect it to the application, since the Supabase database is small?"
 *
 * Answer: yes — client-side connector to the student's OWN Drive (15 GB
 * free), zero server storage. Files upload from the browser straight to a
 * «طالب — Talib» folder via drive.file scope; the app can never see any
 * other Drive content. Without NEXT_PUBLIC_GOOGLE_CLIENT_ID the tab shows
 * a self-service setup guide instead of a broken button.
 */

import * as React from "react";
import {
  CloudUpload,
  Copy,
  Download,
  ExternalLink,
  FileText,
  HardDrive,
  Image as ImageIcon,
  Link2,
  Loader2,
  LogOut,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn, formatBytes } from "@/lib/utils";
import {
  DriveError,
  deleteDriveFile,
  disconnectDrive,
  downloadDriveFile,
  ensureDriveToken,
  findOrCreateDriveFolder,
  getDriveQuota,
  getGoogleClientId,
  isDriveConnected,
  listDriveFiles,
  shareDriveFile,
  uploadToDrive,
  type DriveFileMeta,
  type DriveQuota,
} from "@/lib/drive";

function fmtSize(bytes: number | null): string {
  return formatBytes(bytes);
}

function fmtDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

interface UploadState {
  name: string;
  pct: number;
}

export function DriveTab() {
  const hasClientId = getGoogleClientId() !== null;
  const [connected, setConnected] = React.useState(false);
  const [connecting, setConnecting] = React.useState(false);
  const [loadingList, setLoadingList] = React.useState(false);
  const [files, setFiles] = React.useState<DriveFileMeta[]>([]);
  const [quota, setQuota] = React.useState<DriveQuota | null>(null);
  const [uploads, setUploads] = React.useState<UploadState[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [deletingFile, setDeletingFile] = React.useState<DriveFileMeta | null>(null);
  const [shareBusy, setShareBusy] = React.useState<string | null>(null);
  // round 33: owner request — disconnecting Drive must warn first, not act
  // silently. The dialog below spells out that files stay in the user's
  // account and only the connection is removed.
  const [confirmDisconnect, setConfirmDisconnect] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const folderIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (hasClientId && isDriveConnected()) {
      setConnected(true);
    }
  }, [hasClientId]);

  const refreshList = React.useCallback(async () => {
    setLoadingList(true);
    try {
      const token = await ensureDriveToken(false);
      if (!folderIdRef.current) {
        folderIdRef.current = await findOrCreateDriveFolder(token);
      }
      const [list, q] = await Promise.all([
        listDriveFiles(token, folderIdRef.current),
        getDriveQuota(token).catch(() => null),
      ]);
      setFiles(list);
      if (q) setQuota(q);
    } catch (err) {
      if (err instanceof DriveError && err.kind === "needs-consent") {
        setConnected(false);
        toast.info("انتهت صلاحية الاتصال — اضغط «ربط Google Drive» من جديد");
      } else if (err instanceof DriveError && err.kind !== "auth") {
        toast.error("تعذّر تحميل ملفات السحابة");
      }
    } finally {
      setLoadingList(false);
    }
  }, []);

  React.useEffect(() => {
    if (connected) refreshList();
  }, [connected, refreshList]);

  async function handleConnect() {
    setConnecting(true);
    try {
      await ensureDriveToken(true);
      setConnected(true);
      toast.success("تم ربط Google Drive بنجاح");
    } catch (err) {
      if (err instanceof DriveError) {
        if (err.kind === "popup") {
          toast.error("تعذّر فتح نافذة Google — اسمح بالنوافذ المنبثقة وأعد المحاولة");
        } else if (err.kind === "needs-consent") {
          toast.error("لم يتم منح الإذن — أعد المحاولة ووافق على النافذة");
        } else if (err.kind === "auth" && err.message === "missing-client-id") {
          toast.error("إعداد Google مفقود — راجع دليل الإعداد أدناه");
        } else {
          toast.error("فشل الاتصال بـ Google Drive");
        }
      }
    } finally {
      setConnecting(false);
    }
  }

  function handlePickUpload() {
    fileInputRef.current?.click();
  }

  async function handleFilesChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!chosen.length || uploading) return;
    setUploading(true);
    try {
      const token = await ensureDriveToken(false);
      if (!folderIdRef.current) {
        folderIdRef.current = await findOrCreateDriveFolder(token);
      }
      const folder = folderIdRef.current;
      const done: DriveFileMeta[] = [];
      for (const file of chosen) {
        setUploads((u) => [...u, { name: file.name, pct: 0 }]);
        try {
          const meta = await uploadToDrive(token, folder, file, (pct) => {
            setUploads((u) =>
              u.map((x) => (x.name === file.name ? { ...x, pct } : x))
            );
          });
          done.push(meta);
          setUploads((u) => u.filter((x) => x.name !== file.name));
        } catch {
          setUploads((u) => u.filter((x) => x.name !== file.name));
          toast.error(`فشل رفع: ${file.name}`);
        }
      }
      if (done.length) {
        toast.success(
          chosen.length === 1
            ? "تم رفع الملف إلى Drive"
            : `تم رفع ${done.length} ملفات إلى Drive`
        );
        setFiles((prev) => [...done, ...prev]);
        refreshList(); // also refreshes quota
      }
    } catch (err) {
      if (err instanceof DriveError && err.kind === "needs-consent") {
        setConnected(false);
        toast.info("انتهت صلاحية الاتصال — اضغط «ربط Google Drive» من جديد");
      } else {
        toast.error("تعذّر الرفع — تحقق من الاتصال بالإنترنت");
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(file: DriveFileMeta) {
    try {
      const token = await ensureDriveToken(false);
      toast.info(`جارٍ تحميل: ${file.name}`);
      await downloadDriveFile(token, file);
    } catch (err) {
      if (err instanceof DriveError && err.kind === "needs-consent") {
        setConnected(false);
        toast.info("انتهت صلاحية الاتصال — اضغط «ربط Google Drive» من جديد");
      } else {
        toast.error("فشل التحميل");
      }
    }
  }

  async function handleShare(file: DriveFileMeta) {
    setShareBusy(file.id);
    try {
      const token = await ensureDriveToken(false);
      const link = await shareDriveFile(token, file.id);
      await navigator.clipboard.writeText(link);
      toast.success("رابط المُشاركة نُسخ — أي شخص لديه الرابط يرى الملف");
    } catch {
      toast.error("تعذّر إنشاء رابط المشاركة");
    } finally {
      setShareBusy(null);
    }
  }

  async function handleDeleteConfirm() {
    if (!deletingFile) return;
    try {
      const token = await ensureDriveToken(false);
      await deleteDriveFile(token, deletingFile.id);
      setFiles((prev) => prev.filter((f) => f.id !== deletingFile.id));
      toast.success("حُذف الملف من Drive");
      refreshList();
    } catch {
      toast.error("فشل الحذف من Drive");
    } finally {
      setDeletingFile(null);
    }
  }

  // opens the confirmation dialog — actual disconnect happens only after
  // the user confirms (round 33)
  function handleDisconnect() {
    setConfirmDisconnect(true);
  }

  function handleDisconnectConfirm() {
    disconnectDrive();
    setConnected(false);
    setFiles([]);
    setQuota(null);
    folderIdRef.current = null;
    setConfirmDisconnect(false);
    toast.info("تم فصل Google Drive — ملفاتك ما تزال في Drive نفسه");
  }

  // ------------------------------------------------------------------
  // No client ID configured → self-service setup guide (not an error)
  // ------------------------------------------------------------------
  if (!hasClientId) {
    return <SetupGuide />;
  }

  // ------------------------------------------------------------------
  // Not connected → connect card
  // ------------------------------------------------------------------
  if (!connected) {
    return (
      <div className="space-y-3">
        <Card className="p-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <HardDrive className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold">اربط ملفاتك بسحابة Google Drive</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              ارفع ملفاتك إلى مساحتك الخاصة في Google Drive —{" "}
              <strong>١٥ جيجابايت مجاناً</strong> — وتصفّحها وحماّلها وشاركها
              من هنا في أي وقت. الملفات تُحفظ في مجلد «طالب — Talib» داخل
              حسابك أنت، لا في قاعدة بيانات التطبيق.
            </p>
          </div>
          <div className="bg-muted/40 rounded-xl p-3 text-start">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              <strong className="text-foreground">الخصوصية:</strong> التطبيق
              يرى فقط الملفات التي يرفعها هو — لا يستطيع قراءة أي شيء آخر في
              حسابك، ويمكنك فصل الاتصال بضغطة واحدة.
            </p>
          </div>
          <Button
            onClick={handleConnect}
            disabled={connecting}
            className="w-full"
            size="lg"
          >
            {connecting ? (
              <Loader2 className="w-4 h-4 ml-1 animate-spin" />
            ) : (
              <HardDrive className="w-4 h-4 ml-1" />
            )}
            ربط Google Drive
          </Button>
        </Card>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Connected → quota bar + upload + file list
  // ------------------------------------------------------------------
  const quotaPct =
    quota && quota.limit
      ? Math.min(100, Math.round((quota.usage / quota.limit) * 100))
      : null;

  return (
    <div className="space-y-3">
      {/* hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFilesChosen}
      />

      {/* storage summary */}
      <Card className="p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <HardDrive className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm font-bold truncate">
              مجلد «طالب — Talib»
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={refreshList}
              aria-label="تحديث القائمة"
              disabled={loadingList}
            >
              <RefreshCw
                className={cn("w-3.5 h-3.5", loadingList && "animate-spin")}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={handleDisconnect}
              aria-label="فصل الاتصال"
            >
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        {quota && (
          <div className="space-y-1">
            <Progress value={quotaPct ?? 0} className="h-1.5" />
            <p className="text-[11px] text-muted-foreground">
              {fmtSize(quota.usage)}{" "}
              {quota.limit ? `من ${fmtSize(quota.limit)}` : "(غير محدود)"}
              {quotaPct !== null ? ` — ${quotaPct}%` : ""} من مساحة Drive
              الإجمالية
            </p>
          </div>
        )}
      </Card>

      {/* upload button + active uploads */}
      <Button
        onClick={handlePickUpload}
        disabled={uploading}
        className="w-full"
        variant="outline"
        size="lg"
      >
        {uploading ? (
          <Loader2 className="w-4 h-4 ml-1 animate-spin" />
        ) : (
          <CloudUpload className="w-4 h-4 ml-1" />
        )}
        رفع ملفات إلى Drive
      </Button>

      {uploads.length > 0 && (
        <Card className="p-4 space-y-3">
          {uploads.map((u) => (
            <div key={u.name} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-medium">{u.name}</span>
                <span className="text-muted-foreground shrink-0">
                  {u.pct}%
                </span>
              </div>
              <Progress value={u.pct} className="h-1.5" />
            </div>
          ))}
        </Card>
      )}

      {/* file list */}
      {loadingList && files.length === 0 ? (
        <Card className="p-8 text-center">
          <Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">جارٍ قراءة الملفات…</p>
        </Card>
      ) : files.length === 0 ? (
        <Card className="p-8 text-center bg-muted/30 border-dashed">
          <CloudUpload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-bold text-sm mb-1">السحابة فارغة</h3>
          <p className="text-xs text-muted-foreground">
            ارفع أول ملف لك بزر «رفع ملفات إلى Drive» — PDF، صور، مستندات…
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {files.map((file) => {
            const isPdf = file.mimeType === "application/pdf";
            const isImage = file.mimeType.startsWith("image/");
            return (
              <Card key={file.id} className="p-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    {isPdf ? (
                      <FileText className="w-4 h-4" />
                    ) : isImage ? (
                      <ImageIcon className="w-4 h-4" />
                    ) : (
                      <FileText className="w-4 h-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-sm truncate max-w-full">
                        {file.name}
                      </h3>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {fmtSize(file.size ? Number(file.size) : null)}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {fmtDate(file.createdTime)}
                    </p>
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleDownload(file)}
                      >
                        <Download className="w-3 h-3 ml-1" />
                        تحميل
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleShare(file)}
                        disabled={shareBusy === file.id}
                      >
                        {shareBusy === file.id ? (
                          <Loader2 className="w-3 h-3 ml-1 animate-spin" />
                        ) : (
                          <Link2 className="w-3 h-3 ml-1" />
                        )}
                        نسخ رابط
                      </Button>
                      {file.webViewLink && (
                        <a
                          href={file.webViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                          >
                            <ExternalLink className="w-3 h-3 ml-1" />
                            فتح في Drive
                          </Button>
                        </a>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive mr-auto"
                        onClick={() => setDeletingFile(file)}
                        aria-label={`حذف ${file.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* delete confirm */}
      {deletingFile && (
        <Dialog open onOpenChange={() => setDeletingFile(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                حذف من Drive
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm">
              حذف <strong>{deletingFile.name}</strong> من مجلد «طالب — Talib»
              في حسابك؟ سيُنقل إلى سلة مهملات Google Drive.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeletingFile(null)}>
                إلغاء
              </Button>
              <Button variant="destructive" onClick={handleDeleteConfirm}>
                حذف
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* round 33: disconnect confirmation — files stay in Drive, only the
          app's access is removed; user must confirm before it happens */}
      {confirmDisconnect && (
        <Dialog open onOpenChange={() => setConfirmDisconnect(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2">
                <LogOut className="w-5 h-5" />
                فصل Google Drive
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm leading-relaxed">
              هل تريد فصل حساب Drive؟ <strong>ملفاتك لن تُحذف</strong> — ستبقى
              في مجلد «طالب — Talib» داخل حسابك على Google. ستحتاج فقط إلى
              إعادة الربط لعرض ملفاتك أو رفع ملفات جديدة من هنا.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDisconnect(false)}>
                إلغاء
              </Button>
              <Button variant="destructive" onClick={handleDisconnectConfirm}>
                فصل الاتصال
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setup guide — shown until NEXT_PUBLIC_GOOGLE_CLIENT_ID is configured
// ---------------------------------------------------------------------------

function SetupGuide() {
  const origins = "https://gu-mo.vercel.app";
  const steps = [
    "افتح console.cloud.google.com وأنشئ مشروعاً (أو استخدم مشروعاً قائماً).",
    "من «APIs & Services → Library» فعّل Google Drive API.",
    "من «OAuth consent screen» اختر External وأدخل اسم التطبيق، ثم أضف بريدك كمستخدم تجريبي (Test user).",
    "من «Credentials → Create credentials → OAuth client ID» اختر Web application.",
    `في «Authorized JavaScript origins» أضف: ${origins} (وأضِف http://localhost:3000 للتجربة المحلية).`,
    "انسخ Client ID (ينتهي بـ .apps.googleusercontent.com).",
    "في إعدادات Vercel لمشروع gu-mo أضف المتغير NEXT_PUBLIC_GOOGLE_CLIENT_ID بالقيمة المنسوخة، ثم أعد النشر (Redeploy).",
  ];
  return (
    <div className="space-y-3">
      <Card className="p-5 text-center space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center mx-auto">
          <TriangleAlert className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <h3 className="font-bold">سحابتي — Google Drive</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            الربط جاهز في التطبيق، لكن يحتاج مفتاحاً واحداً من حساب Google
            الذي تملكه أنت (خطوة لمرة واحدة).
          </p>
        </div>
      </Card>

      <Card className="p-4">
        <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
          <Copy className="w-4 h-4 text-primary" />
          دليل الإعداد (٧ خطوات — ٥ دقائق)
        </h4>
        <ol className="space-y-2.5">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              <span
                className={cn(
                  "text-xs leading-relaxed",
                  s.includes("NEXT_PUBLIC") && "font-mono"
                )}
                dir={s.includes("NEXT_PUBLIC") || s.includes("http") ? "auto" : undefined}
              >
                {s}
              </span>
            </li>
          ))}
        </ol>
        <p className="text-[11px] text-muted-foreground mt-3 bg-muted/40 rounded-lg p-2.5 leading-relaxed">
          لماذا هذه الخطوة؟ Google تتطلب أن يكون مفتاح الربط ملكاً لحساب
          التطبيق — بهذا تبقى بيانات الطلاب في Drive الخاص بهم (١٥ ج.ب
          مجاناً) ولا تمر عبر خوادمنا إطلاقاً، ولا تستهلك من مساحة Supabase
          الصغيرة.
        </p>
      </Card>
    </div>
  );
}
