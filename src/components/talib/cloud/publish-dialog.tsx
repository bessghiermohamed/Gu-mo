"use client";

/**
 * PublishToLibraryDialog — نشر إلى المكتبة (round 32, extracted round 33).
 *
 * ONE shared dialog, TWO entry points:
 *   • ملفاتي → المكتبة → «إضافة ملف»          (specialty-wide)
 *   • تفاصيل المقياس → المواد → «إضافة مادة»  (course-scoped, moduleId set)
 *
 * Two modes:
 *   «رابط»    — link-only reference (original behaviour)
 *   «رفع ملف» — publish a REAL file from the supervisor's own Google Drive
 *               (15 GB). Bytes go browser → Drive with a progress bar, the
 *               file is shared anyone-with-link, students download directly
 *               from Drive — Supabase stores only the metadata row.
 *
 * When `moduleId` is passed, the created row is tagged with the course so
 * the material also appears in that course's المواد tab.
 */

import * as React from "react";
import { CloudUpload, HardDrive, Link2, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DriveError, ensureDriveToken, findOrCreateDriveFolder,
  findOrCreateLibraryFolder, getDriveShareLinks, getGoogleClientId,
  isDriveConnected, shareDriveFile, uploadToDrive,
} from "@/lib/drive";
import { formatBytes } from "@/lib/utils";
import { toast } from "sonner";

function prettifyFileName(name: string): string {
  const base = name
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base || name;
}

function formatFromFile(name: string): string {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (ext === "pdf") return "PDF";
  if (ext === "doc" || ext === "docx") return "DOCX";
  if (ext === "ppt" || ext === "pptx") return "PPTX";
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return "صورة";
  return "أخرى";
}

export function PublishToLibraryDialog({
  onCreated,
  moduleId,
  defaultCategory,
  triggerLabel = "إضافة ملف",
}: {
  onCreated: () => void;
  /** When set, the material is linked to this course (المواد tab). */
  moduleId?: number | null;
  defaultCategory?: string;
  triggerLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"link" | "upload">("link");

  function close() {
    setOpen(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full">
          <CloudUpload className="w-4 h-4 ml-1" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {moduleId ? "إضافة مادة للمقياس" : "إضافة ملف/مرجع للمكتبة"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button" size="sm"
            variant={mode === "link" ? "default" : "outline"}
            onClick={() => setMode("link")}
          >
            <Link2 className="w-3.5 h-3.5 ml-1" />رابط خارجي
          </Button>
          <Button
            type="button" size="sm"
            variant={mode === "upload" ? "default" : "outline"}
            onClick={() => setMode("upload")}
          >
            <CloudUpload className="w-3.5 h-3.5 ml-1" />رفع ملف (Drive)
          </Button>
        </div>
        {mode === "link"
          ? <LinkMode onDone={close} onSwitchToUpload={() => setMode("upload")} defaultCategory={defaultCategory} moduleId={moduleId} />
          : <UploadMode onDone={close} onSwitchToLink={() => setMode("link")} defaultCategory={defaultCategory} moduleId={moduleId} />}
      </DialogContent>
    </Dialog>
  );
}

/** Original link-only form (fix ج). */
function LinkMode({
  onDone, onSwitchToUpload, defaultCategory, moduleId,
}: {
  onDone: () => void; onSwitchToUpload: () => void;
  defaultCategory?: string; moduleId?: number | null;
}) {
  const [title, setTitle] = React.useState("");
  const [author, setAuthor] = React.useState("");
  const [category, setCategory] = React.useState(defaultCategory ?? "كتاب مرجعي");
  const [fileFormat, setFileFormat] = React.useState("PDF");
  const [downloadUrl, setDownloadUrl] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    if (!title.trim()) { toast.error("العنوان مطلوب"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/library", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(), author: author.trim(), category: category.trim(),
          fileFormat: fileFormat.trim(), downloadUrl: downloadUrl.trim(),
          description: description.trim(), moduleId: moduleId ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشل الحفظ"); return; }
      toast.success(moduleId ? "تمت إضافة المادة للمقياس" : "تمت إضافة الملف للمكتبة");
      onDone();
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-3 py-2">
      <div className="space-y-1.5">
        <Label htmlFor="libTitle">العنوان</Label>
        <Input id="libTitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: ملخص الأدب الجاهلي" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="libAuthor">المؤلف / المُعد</Label>
          <Input id="libAuthor" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="اسمك أو اسم الأستاذ" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="libFormat">الصيغة</Label>
          <select id="libFormat" value={fileFormat} onChange={(e) => setFileFormat(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
            <option value="PDF">PDF</option>
            <option value="DOCX">DOCX</option>
            <option value="PPTX">PPTX</option>
            <option value="صورة">صورة</option>
            <option value="رابط">رابط</option>
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="libCategory">التصنيف</Label>
        <select id="libCategory" value={category} onChange={(e) => setCategory(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
          <option value="كتاب مرجعي">كتاب مرجعي</option>
          <option value="ملخص">ملخص</option>
          <option value="سلسلة تمارين">سلسلة تمارين</option>
          <option value="محاضرة">محاضرة</option>
          <option value="أخرى">أخرى</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="libUrl">رابط الملف (Google Drive أو غيره)</Label>
        <Input id="libUrl" value={downloadUrl} onChange={(e) => setDownloadUrl(e.target.value)} placeholder="https://..." dir="ltr" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="libDesc">وصف مختصر</Label>
        <Textarea id="libDesc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="وصف اختياري لمحتوى الملف..." rows={2} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        تريد رفع ملف PDF فعلي؟ اختر{" "}
        <button type="button" className="underline text-primary" onClick={onSwitchToUpload}>
          «رفع ملف (Drive)»
        </button>{" "}
        لينزل الطلبة الملف مباشرة.
      </p>
      <DialogFooter>
        <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}إضافة</Button>
      </DialogFooter>
    </div>
  );
}

/** Publish a real file from the supervisor's own Google Drive (round 32). */
function UploadMode({
  onDone, onSwitchToLink, defaultCategory, moduleId,
}: {
  onDone: () => void; onSwitchToLink: () => void;
  defaultCategory?: string; moduleId?: number | null;
}) {
  const hasClientId = getGoogleClientId() !== null;
  const [connected, setConnected] = React.useState(false);
  const [connecting, setConnecting] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [title, setTitle] = React.useState("");
  const [author, setAuthor] = React.useState("");
  const [category, setCategory] = React.useState(defaultCategory ?? "كتاب مرجعي");
  const [description, setDescription] = React.useState("");
  const [pct, setPct] = React.useState<number | null>(null);
  const [saving, setSaving] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (hasClientId && isDriveConnected()) setConnected(true);
  }, [hasClientId]);

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!f) return;
    setFile(f);
    if (!title.trim()) setTitle(prettifyFileName(f.name));
  }

  async function handleConnect() {
    setConnecting(true);
    try {
      await ensureDriveToken(true);
      setConnected(true);
      toast.success("تم ربط Google Drive بنجاح");
    } catch (err) {
      if (err instanceof DriveError && err.kind === "popup") {
        toast.error("تعذّر فتح نافذة Google — اسمح بالنوافذ المنبثقة وأعد المحاولة");
      } else if (err instanceof DriveError && err.kind === "needs-consent") {
        toast.error("لم يتم منح الإذن — أعد المحاولة ووافق على النافذة");
      } else {
        toast.error("فشل الاتصال بـ Google Drive");
      }
    } finally { setConnecting(false); }
  }

  async function handlePublish() {
    if (!file) { toast.error("اختر ملفاً أولاً"); return; }
    if (!title.trim()) { toast.error("العنوان مطلوب"); return; }
    setSaving(true);
    try {
      const token = await ensureDriveToken(false);
      setPct(0);
      const appFolder = await findOrCreateDriveFolder(token);
      const libFolder = await findOrCreateLibraryFolder(token, appFolder);
      const meta = await uploadToDrive(token, libFolder, file, setPct, "talib-library");
      await shareDriveFile(token, meta.id); // anyone-with-link reader
      const links = await getDriveShareLinks(token, meta.id);
      const res = await fetch("/api/library", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(), author: author.trim(), category: category.trim(),
          fileFormat: formatFromFile(file.name), downloadUrl: links.webContentLink,
          description: description.trim(), driveFileId: meta.id, fileSize: file.size,
          moduleId: moduleId ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setPct(null); toast.error(data.error ?? "فشل نشر الملف"); return; }
      toast.success(moduleId
        ? "تم نشر المادة في المقياس — أصبحت متاحة للطلبة للتنزيل"
        : "تم نشر الملف في مكتبة التخصص — أصبح متاحاً للطلبة للتنزيل");
      onDone();
    } catch (err) {
      setPct(null);
      if (err instanceof DriveError && err.kind === "needs-consent") {
        setConnected(false);
        toast.info("انتهت صلاحية الاتصال — اربط Google Drive من جديد");
      } else {
        toast.error("تعذّر رفع الملف إلى Drive — تحقق من اتصال الإنترنت وأعد المحاولة");
      }
    } finally { setSaving(false); }
  }

  // Google OAuth not configured yet — point at the سحابتي guide (single
  // source of truth for the 7 steps; no duplicated instructions here).
  if (!hasClientId) {
    return (
      <div className="space-y-3 py-2">
        <Card className="p-4 border-amber-500/30 bg-amber-500/5 space-y-2">
          <p className="text-xs leading-relaxed">
            رفع الملفات يحتاج إعداد Google مرة واحدة — نفس إعداد تبويب{" "}
            <strong>سحابتي</strong>: أضف المتغيّر{" "}
            <span className="font-mono">NEXT_PUBLIC_GOOGLE_CLIENT_ID</span> في
            Vercel ثم أعد النشر. الدليل الكامل (٧ خطوات) معروض في تبويب
            سحابتي تحت «دليل الإعداد».
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            حتى ذلك الحين يمكنك إضافة الملفات كروابط خارجية.
          </p>
        </Card>
        <DialogFooter>
          <Button variant="outline" onClick={onSwitchToLink}>إضافة كرابط بدلاً من ذلك</Button>
        </DialogFooter>
      </div>
    );
  }

  // Not connected yet — one-tap connect (same consent as سحابتي).
  if (!connected) {
    return (
      <div className="space-y-3 py-2">
        <Card className="p-4 space-y-2 text-center">
          <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <HardDrive className="w-5 h-5" />
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            اربط حساب Google Drive الخاص بك لرفع المحاضرات —{" "}
            <strong className="text-foreground">١٥ جيجابايت مجاناً</strong>{" "}
            من حسابك أنت، دون أن تستهلك أي شيء من مساحة التطبيق.
          </p>
          <Button onClick={handleConnect} disabled={connecting} className="w-full">
            {connecting
              ? <Loader2 className="w-4 h-4 ml-1 animate-spin" />
              : <HardDrive className="w-4 h-4 ml-1" />}
            ربط Google Drive
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3 py-2">
      <input
        ref={fileInputRef} type="file" className="hidden"
        accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.webp"
        onChange={pickFile}
      />

      {file ? (
        <Card className="p-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">{file.name}</p>
            <p className="text-[11px] text-muted-foreground">
              {formatBytes(file.size)} — {formatFromFile(file.name)}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} disabled={saving}>
            تغيير
          </Button>
        </Card>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full rounded-xl border border-dashed border-muted-foreground/40 bg-muted/30 p-6 text-center hover:bg-muted/50 transition-colors"
        >
          <CloudUpload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <span className="text-sm font-bold block">اختيار ملف</span>
          <span className="text-[11px] text-muted-foreground">PDF، Word، PowerPoint، صورة — من جهازك</span>
        </button>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="pubTitle">العنوان</Label>
        <Input id="pubTitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: محاضرة ١ — مقدمة في النحو" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="pubAuthor">المُعد / الأستاذ</Label>
          <Input id="pubAuthor" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="اختياري" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pubCategory">التصنيف</Label>
          <select id="pubCategory" value={category} onChange={(e) => setCategory(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
            <option value="كتاب مرجعي">كتاب مرجعي</option>
            <option value="ملخص">ملخص</option>
            <option value="سلسلة تمارين">سلسلة تمارين</option>
            <option value="محاضرة">محاضرة</option>
            <option value="أخرى">أخرى</option>
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pubDesc">وصف مختصر</Label>
        <Textarea id="pubDesc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="وصف اختياري..." rows={2} />
      </div>

      {pct !== null && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span>جارٍ الرفع إلى Drive…</span>
            <span className="text-muted-foreground">{pct}%</span>
          </div>
          <Progress value={pct} className="h-1.5" />
        </div>
      )}

      <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-lg p-2.5 leading-relaxed">
        يُرفع الملف إلى مجلد «📚 مكتبة طالب» في حسابك على Drive (١٥ ج.ب) —{" "}
        <strong className="text-foreground">لا يستهلك أي شيء من Supabase</strong> —
        ويظهر للطلبة مباشرة بزر تنزيل.
      </p>

      <DialogFooter>
        <Button onClick={handlePublish} disabled={saving || !file}>
          {saving
            ? <Loader2 className="w-4 h-4 ml-1 animate-spin" />
            : <CloudUpload className="w-4 h-4 ml-1" />}
          نشر إلى المكتبة
        </Button>
      </DialogFooter>
    </div>
  );
}
