"use client";

import * as React from "react";
import {
  BookMarked, CloudUpload, Download, ExternalLink, HardDrive, Link2,
  Loader2, Pencil, Plus, StickyNote, Trash2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { canManageRoles } from "@/lib/auth/permissions";
import { DriveTab } from "@/components/talib/cloud/drive-tab";
import {
  DriveError, deleteDriveFile, ensureDriveToken, findOrCreateDriveFolder,
  findOrCreateLibraryFolder, getDriveShareLinks, getGoogleClientId,
  isDriveConnected, shareDriveFile, uploadToDrive,
} from "@/lib/drive";
import { formatBytes } from "@/lib/utils";
import { toast } from "sonner";

// fix ج: the Files screen had no way to add files. A new "المكتبة" tab shows
// reference files (books/summaries/PDF links) of the specialty, and privileged
// users get a "+ إضافة ملف" button.
// round 32: the add dialog gained a second mode — نشر ملف من Drive — where a
// supervisor uploads a REAL lecture file from their own 15 GB Google Drive
// (anyone-with-link); students download it straight from Drive. Supabase
// keeps only the metadata row — zero file bytes.

interface Note {
  id: number;
  title: string;
  content: string;
  color: string;
}

interface LibraryItem {
  id: number;
  title: string;
  author: string;
  category: string;
  description: string;
  fileFormat: string;
  downloadUrl: string;
  // round 32: present when the file was published from a supervisor's Drive
  fileSize: number | null;
  driveFileId: string | null;
}

// round 31: أدواتي was extracted into its own standalone screen (tools-screen.tsx)
// — it used to be a tab here AND a home tile, which duplicated navigation.
// Its place in this screen is taken by سحابتي (Google Drive, drive-tab.tsx).
export function TalibFilesScreen() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [notes, setNotes] = React.useState<Note[]>([]);
  const [newTitle, setNewTitle] = React.useState("");
  const [newContent, setNewContent] = React.useState("");
  const [library, setLibrary] = React.useState<LibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = React.useState(true);
  // round 6: edit/delete state for library items
  const [editItem, setEditItem] = React.useState<LibraryItem | null>(null);
  const [deleteItem, setDeleteItem] = React.useState<LibraryItem | null>(null);
  const [deletingItem, setDeletingItem] = React.useState(false);
  const canManage = canManageRoles(user ?? null);

  const fetchLibrary = React.useCallback(async () => {
    setLibraryLoading(true);
    try {
      const res = await fetch("/api/library", { cache: "no-store" });
      const data = await res.json();
      setLibrary(data.items ?? []);
    } catch { /* silent */ }
    finally { setLibraryLoading(false); }
  }, []);

  React.useEffect(() => { fetchLibrary(); }, [fetchLibrary]);

  React.useEffect(() => {
    const stored = localStorage.getItem("talib-notes");
    if (stored) {
      try {
        setNotes(JSON.parse(stored));
      } catch {
        // ignore
      }
    }
  }, []);

  function persist(next: Note[]) {
    setNotes(next);
    localStorage.setItem("talib-notes", JSON.stringify(next));
  }

  function addNote() {
    if (!newTitle.trim() && !newContent.trim()) {
      toast.error("اكتب عنواناً أو محتوى للملاحظة");
      return;
    }
    const note: Note = {
      id: Date.now(),
      title: newTitle.trim() || "بدون عنوان",
      content: newContent.trim(),
      color: "#1B5E4B",
    };
    persist([note, ...notes]);
    setNewTitle("");
    setNewContent("");
    toast.success("تم حفظ الملاحظة");
  }

  function deleteNote(id: number) {
    persist(notes.filter((n) => n.id !== id));
  }

  // round 6: delete a library item (a broken/wrong link could never be removed before)
  // round 32: if the item was published from Drive and the publisher is
  // connected, clean up the Drive copy too — best-effort, never blocks the
  // row deletion (the file may live on another supervisor's account).
  async function handleDeleteLibraryItem() {
    if (!deleteItem) return;
    setDeletingItem(true);
    try {
      if (deleteItem.driveFileId && isDriveConnected()) {
        try {
          const token = await ensureDriveToken(false);
          await deleteDriveFile(token, deleteItem.driveFileId);
        } catch { /* Drive copy untouched — remove the row anyway */ }
      }
      const res = await fetch(`/api/library?id=${deleteItem.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشل الحذف"); return; }
      toast.success("تم حذف الملف من المكتبة");
      setDeleteItem(null);
      fetchLibrary();
    } catch { toast.error("فشل الحذف"); }
    finally { setDeletingItem(false); }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black mb-1">{t("files.title")}</h1>
        <p className="text-sm text-muted-foreground">
          المكتبة، ملاحظاتك، وملفاتك السحابية في مكان واحد
        </p>
      </div>

      <Tabs defaultValue="library">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="library">
            <BookMarked className="w-3.5 h-3.5 ml-1.5" />
            المكتبة
          </TabsTrigger>
          <TabsTrigger value="notes">
            <StickyNote className="w-3.5 h-3.5 ml-1.5" />
            {t("files.tabNotes")}
          </TabsTrigger>
          <TabsTrigger value="cloud">
            <HardDrive className="w-3.5 h-3.5 ml-1.5" />
            سحابتي
          </TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="mt-4 space-y-3">
          {canManage && <AddLibraryItemDialog onCreated={fetchLibrary} />}

          {/* round 6: edit dialog for library items */}
          {editItem && <EditLibraryItemDialog item={editItem} onClose={() => setEditItem(null)} onSaved={() => { setEditItem(null); fetchLibrary(); }} />}

          {/* round 6: delete confirm */}
          {deleteItem && (
            <Dialog open onOpenChange={() => setDeleteItem(null)}>
              <DialogContent>
                <DialogHeader><DialogTitle className="text-destructive flex items-center gap-2"><Trash2 className="w-5 h-5" />حذف ملف من المكتبة</DialogTitle></DialogHeader>
                <p className="text-sm">هل تريد حذف <strong>{deleteItem.title}</strong> من مكتبة التخصص؟ لا يمكن التراجع.</p>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDeleteItem(null)}>إلغاء</Button>
                  <Button variant="destructive" onClick={handleDeleteLibraryItem} disabled={deletingItem}>{deletingItem && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حذف نهائي</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {libraryLoading ? (
            <Card className="p-8 text-center">
              <Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            </Card>
          ) : library.length === 0 ? (
            <Card className="p-8 text-center bg-muted/30 border-dashed">
              <BookMarked className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <h3 className="font-bold text-sm mb-1">المكتبة فارغة</h3>
              <p className="text-xs text-muted-foreground">
                {canManage
                  ? "أضف ملفات ومراجع لتخصصك بزر «إضافة ملف»."
                  : "ستظهر الكتب والملفات المرجعية هنا عند إضافتها من طرف الممثل أو الإدارة."}
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {library.map((item) => (
                <Card key={item.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-bold text-sm">{item.title}</h3>
                        <Badge variant="outline" className="text-xs">{item.fileFormat}</Badge>
                        <Badge variant="secondary" className="text-xs">{item.category}</Badge>
                        {item.fileSize != null && (
                          <Badge variant="outline" className="text-xs">{formatBytes(item.fileSize)}</Badge>
                        )}
                        {item.driveFileId && (
                          <Badge className="text-[10px] bg-primary/10 text-primary border border-primary/20">
                            <HardDrive className="w-3 h-3 ml-1" />على Drive
                          </Badge>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{item.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">بواسطة: {item.author}</p>
                    </div>
                    {item.downloadUrl && (
                      <a href={item.downloadUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                        {item.driveFileId ? (
                          <Button size="sm" variant="outline"><Download className="w-3.5 h-3.5 ml-1" />تنزيل</Button>
                        ) : (
                          <Button size="sm" variant="outline"><ExternalLink className="w-3.5 h-3.5 ml-1" />فتح</Button>
                        )}
                      </a>
                    )}
                    {canManage && (
                      <div className="flex flex-col gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditItem(item)} aria-label="تعديل الملف">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 h-8 w-8" onClick={() => setDeleteItem(item)} aria-label="حذف الملف">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="notes" className="mt-4 space-y-4">
          {/* Add note form */}
          <Card className="p-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="noteTitle">{t("files.noteTitle")}</Label>
              <Input
                id="noteTitle"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="عنوان الملاحظة"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="noteContent">{t("files.noteContent")}</Label>
              <Textarea
                id="noteContent"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="اكتب ملاحظتك هنا..."
                rows={3}
              />
            </div>
            <Button onClick={addNote} className="w-full">
              <Plus className="w-4 h-4 ml-2" />
              {t("files.addNote")}
            </Button>
          </Card>

          {/* Notes list */}
          {notes.length === 0 ? (
            <Card className="p-8 text-center bg-muted/30 border-dashed">
              <StickyNote className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <h3 className="font-bold text-sm mb-1">{t("files.noNotes")}</h3>
            </Card>
          ) : (
            <div className="space-y-2">
              {notes.map((note) => (
                <Card
                  key={note.id}
                  className="p-4 border-s-4"
                  style={{ borderInlineStartColor: "var(--primary)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-sm">{note.title}</h3>
                      {note.content && (
                        <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words">
                          {note.content}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteNote(note.id)}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* سحابتي — Google Drive connector (round 31): the student's own
            15 GB Drive instead of the small Supabase instance. Files go
            browser → Drive directly; see src/lib/drive.ts. */}
        <TabsContent value="cloud" className="mt-4 space-y-3">
          <DriveTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// round 32: two ways to add a library entry —
//  «رابط»    : the original link-only form (behaviour unchanged)
//  «رفع ملف» : publish a REAL file from the supervisor's own Google Drive
//              (15 GB). Bytes go browser → Drive with a progress bar, the
//              file is shared anyone-with-link, students download directly
//              from Drive — Supabase stores only the metadata row.
function AddLibraryItemDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"link" | "upload">("link");

  function close() {
    setOpen(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full"><Plus className="w-4 h-4 ml-1" />إضافة ملف</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>إضافة ملف/مرجع للمكتبة</DialogTitle></DialogHeader>
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
          ? <LinkMode onDone={close} onSwitchToUpload={() => setMode("upload")} />
          : <UploadMode onDone={close} onSwitchToLink={() => setMode("link")} />}
      </DialogContent>
    </Dialog>
  );
}

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

/** Original link-only form (fix ج). */
function LinkMode({ onDone, onSwitchToUpload }: { onDone: () => void; onSwitchToUpload: () => void }) {
  const [title, setTitle] = React.useState("");
  const [author, setAuthor] = React.useState("");
  const [category, setCategory] = React.useState("كتاب مرجعي");
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
          description: description.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشل الحفظ"); return; }
      toast.success("تمت إضافة الملف للمكتبة");
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
          <option value="محاضرة مصورة">محاضرة مصورة</option>
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
function UploadMode({ onDone, onSwitchToLink }: { onDone: () => void; onSwitchToLink: () => void }) {
  const hasClientId = getGoogleClientId() !== null;
  const [connected, setConnected] = React.useState(false);
  const [connecting, setConnecting] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [title, setTitle] = React.useState("");
  const [author, setAuthor] = React.useState("");
  const [category, setCategory] = React.useState("كتاب مرجعي");
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
        }),
      });
      const data = await res.json();
      if (!res.ok) { setPct(null); toast.error(data.error ?? "فشل نشر الملف"); return; }
      toast.success("تم نشر الملف في مكتبة التخصص — أصبح متاحاً للطلبة للتنزيل");
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
            <option value="محاضرة مصورة">محاضرة</option>
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
        ويظهر لطلبة تخصصك مباشرة بزر تنزيل.
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

// round 6: edit an existing library item (fix a broken link / typo without
// deleting and re-adding — the item stays in place for the whole specialty).
function EditLibraryItemDialog({ item, onClose, onSaved }: { item: LibraryItem; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = React.useState(item.title);
  const [author, setAuthor] = React.useState(item.author);
  const [category, setCategory] = React.useState(item.category);
  const [fileFormat, setFileFormat] = React.useState(item.fileFormat);
  const [downloadUrl, setDownloadUrl] = React.useState(item.downloadUrl);
  const [description, setDescription] = React.useState(item.description);
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    if (!title.trim()) { toast.error("العنوان مطلوب"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/library", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          title: title.trim(), author: author.trim(), category: category.trim(),
          fileFormat: fileFormat.trim(), downloadUrl: downloadUrl.trim(),
          description: description.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشل الحفظ"); return; }
      toast.success("تم تعديل الملف");
      onSaved();
    } finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="w-5 h-5 text-primary" />تعديل ملف المكتبة</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="editLibTitle">العنوان</Label>
            <Input id="editLibTitle" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="editLibAuthor">المؤلف / المُعد</Label>
              <Input id="editLibAuthor" value={author} onChange={(e) => setAuthor(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="editLibFormat">الصيغة</Label>
              <select id="editLibFormat" value={fileFormat} onChange={(e) => setFileFormat(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                <option value="PDF">PDF</option>
                <option value="DOCX">DOCX</option>
                <option value="PPTX">PPTX</option>
                <option value="صورة">صورة</option>
                <option value="رابط">رابط</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="editLibCategory">التصنيف</Label>
            <select id="editLibCategory" value={category} onChange={(e) => setCategory(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
              <option value="كتاب مرجعي">كتاب مرجعي</option>
              <option value="ملخص">ملخص</option>
              <option value="سلسلة تمارين">سلسلة تمارين</option>
              <option value="محاضرة مصورة">محاضرة مصورة</option>
              <option value="أخرى">أخرى</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="editLibUrl">رابط الملف</Label>
            <Input id="editLibUrl" value={downloadUrl} onChange={(e) => setDownloadUrl(e.target.value)} placeholder="https://..." dir="ltr" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="editLibDesc">وصف مختصر</Label>
            <Textarea id="editLibDesc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حفظ التعديلات</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
