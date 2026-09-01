"use client";

import * as React from "react";
import { StickyNote, Plus, Trash2, BookMarked, ExternalLink, Loader2, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { canManageRoles } from "@/lib/auth/permissions";
import { toast } from "sonner";

// fix ج: the Files screen had no way to add files. A new "المكتبة" tab shows
// reference files (books/summaries/PDF links) of the specialty, and privileged
// users get a "+ إضافة ملف" button.

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
}

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
  async function handleDeleteLibraryItem() {
    if (!deleteItem) return;
    setDeletingItem(true);
    try {
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
          مكتبة الملفات، محفوظاتك، وملاحظاتك في مكان واحد
        </p>
      </div>

      <Tabs defaultValue="library">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="library">
            <BookMarked className="w-3.5 h-3.5 ml-1.5" />
            المكتبة
          </TabsTrigger>
          <TabsTrigger value="notes">
            <StickyNote className="w-3.5 h-3.5 ml-1.5" />
            {t("files.tabNotes")}
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
                      </div>
                      {item.description && (
                        <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{item.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">بواسطة: {item.author}</p>
                    </div>
                    {item.downloadUrl && (
                      <a href={item.downloadUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                        <Button size="sm" variant="outline"><ExternalLink className="w-3.5 h-3.5 ml-1" />فتح</Button>
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
      </Tabs>
    </div>
  );
}

function AddLibraryItemDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = React.useState(false);
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
      setOpen(false); setTitle(""); setAuthor(""); setDownloadUrl(""); setDescription("");
      onCreated();
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full"><Plus className="w-4 h-4 ml-1" />إضافة ملف</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>إضافة ملف/مرجع للمكتبة</DialogTitle></DialogHeader>
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}إضافة</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
