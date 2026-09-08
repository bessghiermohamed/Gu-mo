"use client";

import * as React from "react";
import {
  BookMarked, Download, ExternalLink, HardDrive,
  Loader2, Pencil, Plus, StickyNote, Trash2, Search, CheckSquare,
  FlaskConical, BookOpen, FileText, Dumbbell, Folder,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { canManageRoles } from "@/lib/auth/permissions";
import { DriveTab } from "@/components/talib/cloud/drive-tab";
import { PublishToLibraryDialog } from "@/components/talib/cloud/publish-dialog";
import { deleteDriveFile, ensureDriveToken, isDriveConnected } from "@/lib/drive";
import { formatBytes } from "@/lib/utils";
import { toast } from "sonner";

// fix ج: the Files screen had no way to add files. A new "المكتبة" tab shows
// reference files (books/summaries/PDF links) of the specialty, and privileged
// users get a "+ إضافة ملف" button.
// round 32: the add dialog gained a second mode — نشر ملف من Drive — where a
// supervisor uploads a REAL lecture file from their own 15 GB Google Drive
// (anyone-with-link); students download it straight from Drive. Supabase
// keeps only the metadata row — zero file bytes.
// round 33: the dialog moved to cloud/publish-dialog.tsx (shared with the
// course detail screen's new المواد tab — single source, no duplication).

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
  // round 52: course link — files uploaded inside a course now surface here
  // too, badged with their course name and filterable by category.
  moduleId?: number | null;
  moduleName?: string | null;
}

// round 52 — ثوابت التصنيف (مطابقة لنافذة الرفع) — الفلاتر تُبنى ديناميكياً
// من الملفات الموجودة بحيث لا يظهر تصنيف فارغ أبداً، مع ترتيب ثابت معروف.
const CATEGORY_ORDER = ["محاضرة", "ملخص", "سلسلة تمارين", "كتاب مرجعي", "واجب", "اختبار", "أخرى"];

// round 55 (طلب المالك: «قسم الرفع في ملفاتي يحتاج تصنيفاً أفضل») —
// أيقونة لكل تصنيف تظهر في الشرائح ورؤوس المجموعات، فتُقرأ القائمة
// بصرياً قبل قراءة النص.
const CATEGORY_ICON: Record<string, React.ReactNode> = {
  "محاضرة": <BookOpen className="w-3.5 h-3.5" />,
  "ملخص": <FileText className="w-3.5 h-3.5" />,
  "سلسلة تمارين": <Dumbbell className="w-3.5 h-3.5" />,
  "كتاب مرجعي": <BookMarked className="w-3.5 h-3.5" />,
  "واجب": <CheckSquare className="w-3.5 h-3.5" />,
  "اختبار": <FlaskConical className="w-3.5 h-3.5" />,
  "أخرى": <Folder className="w-3.5 h-3.5" />,
};

function categoryIcon(c: string): React.ReactNode {
  return CATEGORY_ICON[c] ?? <Folder className="w-3.5 h-3.5" />;
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
  // round 52: category filter — «الكل» افتراضياً، والفلاتر تُشتق من الملفات
  const [categoryFilter, setCategoryFilter] = React.useState<string>("الكل");
  // round 55 — بحث فوري بالعنوان/الوصف/المقياس/المُعد فوق الفلاتر
  const [search, setSearch] = React.useState("");
  // round 6: edit/delete state for library items
  const [editItem, setEditItem] = React.useState<LibraryItem | null>(null);
  const [deleteItem, setDeleteItem] = React.useState<LibraryItem | null>(null);
  const [deletingItem, setDeletingItem] = React.useState(false);
  const canManage = canManageRoles(user ?? null);

  // round 52: derive the visible list from the category filter
  // round 55: + free-text search across title/description/module/author
  const filteredLibrary = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return library.filter((i) => {
      if (categoryFilter !== "الكل" && i.category !== categoryFilter) return false;
      if (!q) return true;
      return [
        i.title, i.description, i.author, i.category, i.moduleName ?? "",
      ].some((f) => f.toLowerCase().includes(q));
    });
  }, [library, categoryFilter, search]);

  // round 55 — التجميع: عند «الكل» (وبلا بحث) تُعرض الملفات تحت رؤوس
  // تصنيفاتها بالترتيب الثابت بدل قائمة مختلطة — التصنيف يُرى قبل الفتح.
  const groupedLibrary = React.useMemo(() => {
    if (categoryFilter !== "الكل" || search.trim()) return null;
    const counts = new Map<string, LibraryItem[]>();
    for (const item of library) {
      const arr = counts.get(item.category) ?? [];
      arr.push(item);
      counts.set(item.category, arr);
    }
    const ordered = [
      ...CATEGORY_ORDER.filter((c) => counts.has(c)),
      ...Array.from(counts.keys()).filter((c) => !CATEGORY_ORDER.includes(c)),
    ];
    return ordered.map((c) => ({ category: c, items: counts.get(c) ?? [] }));
  }, [library, categoryFilter, search]);

  const fetchLibrary = React.useCallback(async () => {
    setLibraryLoading(true);
    try {
      // round 52: includeCourseFiles — ملفات المقاييس تُقرأ هنا أيضاً حتى
      // تجد الملفات كلها في مكان واحد مصنّفة (كانت محصورة داخل المقياس).
      const res = await fetch("/api/library?includeCourseFiles=1", { cache: "no-store" });
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

  // round 55 — بطاقة الملف مستخرجة كدالة ليُعاد استخدامها في العرضين:
  // المجمّع تحت رؤوس التصنيفات، والمسطّح عند فلتر/بحث محدد.
  const renderItemCard = (item: LibraryItem) => (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="font-bold text-sm">{item.title}</h3>
            <Badge variant="outline" className="text-xs">{item.fileFormat}</Badge>
            <Badge variant="secondary" className="text-xs">{item.category}</Badge>
            {item.moduleName && (
              <Badge variant="outline" className="text-xs text-primary border-primary/30">
                📘 {item.moduleName}
              </Badge>
            )}
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
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">{t("files.title")}</h1>
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
          {canManage && <PublishToLibraryDialog onCreated={fetchLibrary} />}

          {/* round 55 — بحث فوري فوق الفلاتر: بالعنوان أو الوصف أو اسم
              المقياس أو المُعد — يُصفّي القائمة مع أي فلتر تصنيف. */}
          {library.length > 3 && (
            <div className="relative">
              <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث في ملفاتك… (عنوان، وصف، مقياس، مُعد)"
                className="ps-9 h-9 text-sm"
                aria-label="البحث في الملفات"
              />
            </div>
          )}

          {/* round 52 — فلاتر التصنيف: شرائح أفقية قابلة للتمرير تُبنى من
              التصنيفات الموجودة فعلاً في ملفات التخصص، مع العدد لكل شريحة. */}
          {library.length > 0 && (() => {
            const counts = new Map<string, number>();
            for (const item of library) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
            const ordered = [
              ...CATEGORY_ORDER.filter((c) => counts.has(c)),
              ...Array.from(counts.keys()).filter((c) => !CATEGORY_ORDER.includes(c)),
            ];
            return (
              <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="تصفية حسب التصنيف">
                {["الكل", ...ordered].map((c) => {
                  const active = categoryFilter === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategoryFilter(c)}
                      className={cn(
                        "shrink-0 h-8 px-3 rounded-full text-xs font-bold border transition-colors inline-flex items-center",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      )}
                      aria-pressed={active}
                    >
                      {c !== "الكل" && categoryIcon(c)}
                      {c}
                      <span className={cn("mr-1.5 tabular-nums", active ? "opacity-80" : "opacity-60")}>
                        {c === "الكل" ? library.length : counts.get(c) ?? 0}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })()}

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
              <h3 className="font-bold text-sm mb-1">لا توجد ملفات بعد</h3>
              <p className="text-xs text-muted-foreground">
                {canManage
                  ? "أضف ملفات ومراجع عامة لتخصصك بزر «إضافة ملف» — وملفات المقاييس تُرفع من داخل المقياس فتظهر هنا مصنّفة."
                  : "ستظهر ملفات تخصصك هنا عند رفعها من طرف الممثل أو الإدارة — وملفات كل مقياس تجدها في صفحة المقياس وفي هذه القائمة أيضاً."}
              </p>
            </Card>
          ) : filteredLibrary.length === 0 ? (
            <Card className="p-6 text-center bg-muted/30 border-dashed">
              <p className="text-xs text-muted-foreground leading-relaxed">
                {search.trim()
                  ? `لا نتائج لـ«${search.trim()}»${categoryFilter !== "الكل" ? ` ضمن تصنيف «${categoryFilter}»` : ""} — جرّب كلمات أخرى أو أزل البحث.`
                  : `لا توجد ملفات بتصنيف «${categoryFilter}» — اختر تصنيفاً آخر.`}
              </p>
            </Card>
          ) : groupedLibrary ? (
            /* round 55 — عرض مجمّع: رأس لكل تصنيف بأيقونته وعدده والملفات
                تحته — التصنيف يُقرأ من التخطيط نفسه لا من شارة داخل البطاقة */
            <div className="space-y-5">
              {groupedLibrary.map((g) => (
                <section key={g.category} aria-label={`ملفات التصنيف: ${g.category}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      {categoryIcon(g.category)}
                    </span>
                    <h3 className="font-black text-sm">{g.category}</h3>
                    <Badge variant="secondary" className="text-[10px] tabular-nums">{g.items.length}</Badge>
                    <div className="flex-1 h-px bg-border/60" aria-hidden="true" />
                  </div>
                  <div className="space-y-2">
                    {g.items.map((item) => (
                      <React.Fragment key={item.id}>{renderItemCard(item)}</React.Fragment>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLibrary.map((item) => (
                <React.Fragment key={item.id}>{renderItemCard(item)}</React.Fragment>
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
              {/* round 55 — نفس الثوابت المعتمدة في الفلاتر ونافذة الرفع
                  (كانت القائمة قديمة: «محاضرة مصورة» بلا محاضرة/واجب/اختبار) */}
              {!CATEGORY_ORDER.includes(category) && <option value={category}>{category}</option>}
              {CATEGORY_ORDER.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
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
