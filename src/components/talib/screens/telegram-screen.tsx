"use client";

/**
 * دروس تيليجرام (round 7) — شاشة الطالب
 *
 * مكتبة أكاديمية منظمة للمحتوى المنشور في قنوات تيليجرام:
 *  - "المكتبة": منشورات القنوات العامة مرتبة بالمقياس/النوع، بحث فوري،
 *    معاينة الصور داخل التطبيق، وفتح الأصل برابط t.me مباشر.
 *  - "مساحة الفوج": محتوى مشترك لفوج المتصل (مستورد من مجموعة الفوج +
 *    إضافات يدوية من الطلبة والممثلين) — إضافة وحذف إضافتك متاحان.
 *
 * فلسفة العرض: التطبيق فهرس ومكتبة، والملف الأصلي يبقى في تيليجرام.
 */

import * as React from "react";
import { motion } from "framer-motion";
import {
  Send, Search, Loader2, FileText, ImageIcon, Video, Headphones, File,
  MessageSquare, Link as LinkIcon, Star, Plus, Trash2, Users, ExternalLink,
  FolderOpen, Sparkles, Info, UserPlus, Settings,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/components/talib/auth-provider";
import { useShell } from "@/app/page";
import { canManageRoles } from "@/lib/auth/permissions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// =====================================================
// Types (mirror of the API response)
// =====================================================
interface TgItem {
  id: number;
  sourceId: number | null;
  mediaGroupId: string;
  kind: string;
  titleAr: string;
  captionText: string;
  fileName: string;
  fileId: string;
  sizeBytes: number;
  link: string;
  moduleId: number | null;
  moduleName: string | null;
  itemType: string;
  origin: string;
  postedBy: string;
  isFeatured: boolean;
  aiClassified: boolean;
  postedAt: string | null;
  sourceTitle: string | null;
  sourceUsername: string | null;
}

const TYPE_FILTERS = [
  { value: "", label: "الكل" },
  { value: "محاضرة", label: "محاضرات" },
  { value: "أعمال موجهة TD", label: "أعمال موجهة" },
  { value: "تمارين", label: "تمارين" },
  { value: "امتحان", label: "امتحانات" },
  { value: "ملخص", label: "ملخصات" },
  { value: "كتاب", label: "كتب" },
  { value: "إعلان", label: "إعلانات" },
  { value: "عام", label: "عام" },
];

const TYPE_COLORS: Record<string, string> = {
  "محاضرة": "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  "أعمال موجهة TD": "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  "تمارين": "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30",
  "امتحان": "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
  "ملخص": "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30",
  "كتاب": "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30",
  "إعلان": "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30",
  "عام": "bg-muted text-muted-foreground border-border",
};

const selectCls = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm";

function kindIcon(kind: string, className = "w-4 h-4") {
  switch (kind) {
    case "pdf": return <FileText className={className} />;
    case "image": return <ImageIcon className={className} />;
    case "video": return <Video className={className} />;
    case "audio": return <Headphones className={className} />;
    case "doc": case "ppt": return <File className={className} />;
    case "text": return <MessageSquare className={className} />;
    case "link": return <LinkIcon className={className} />;
    default: return <File className={className} />;
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("ar-DZ", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

function formatSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ك.ب`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
}

/** يدمج منشورات الألبوم الواحد (نفس media_group_id من نفس المصدر) في بطاقة واحدة */
function groupAlbums(items: TgItem[]): Array<{ key: string; item: TgItem; images: TgItem[] }> {
  const seen = new Map<string, { key: string; item: TgItem; images: TgItem[] }>();
  const singles: Array<{ key: string; item: TgItem; images: TgItem[] }> = [];
  for (const item of items) {
    if (item.mediaGroupId && item.sourceId != null) {
      const key = `${item.sourceId}:${item.mediaGroupId}`;
      if (seen.has(key)) {
        seen.get(key)!.images.push(item);
      } else {
        const entry = { key, item, images: item.kind === "image" ? [item] : [] };
        seen.set(key, entry);
      }
    } else {
      singles.push({ key: `i-${item.id}`, item, images: item.kind === "image" ? [item] : [] });
    }
  }
  return [...seen.values(), ...singles];
}

// =====================================================
// Main screen
// =====================================================
export function TalibTelegramScreen() {
  const { user } = useAuth();
  const { navigate } = useShell();
  const [tab, setTab] = React.useState<string>("library");
  const [loading, setLoading] = React.useState(true);
  const [items, setItems] = React.useState<TgItem[]>([]);
  const [setup, setSetup] = React.useState<{ bot: boolean; activeSources: number } | null>(null);
  const [tablesReady, setTablesReady] = React.useState(true);
  const [myCohortId, setMyCohortId] = React.useState<number | null>(null);

  // filters
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState("");
  const [courseId, setCourseId] = React.useState("");
  const [courses, setCourses] = React.useState<Array<{ id: number; name: string; semester: number }>>([]);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  React.useEffect(() => {
    fetch("/api/courses", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setCourses(data.courses ?? []))
      .catch(() => setCourses([]));
  }, []);

  const fetchItems = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("mode", tab);
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (typeFilter) params.set("itemType", typeFilter);
      if (tab === "library" && courseId) params.set("moduleId", courseId);
      const res = await fetch(`/api/telegram/items?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      setItems(data.items ?? []);
      setMyCohortId(data.myCohortId ?? null);
      setSetup(data.setup ?? null);
      if (data.tablesReady === false) setTablesReady(false);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tab, debouncedQuery, typeFilter, courseId]);

  React.useEffect(() => { fetchItems(); }, [fetchItems]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black mb-1 flex items-center gap-2">
            <Send className="w-6 h-6 text-primary" />
            دروس تيليجرام
          </h1>
          <p className="text-sm text-muted-foreground">
            محاضرات وواجبات وتمارين قنوات تيليجرام — منظمة حسب المقياس، والوصول للأصل برابط مباشر
          </p>
        </div>
        {canManageRoles(user ?? null) && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => {
              try { sessionStorage.setItem("talib-admin-tab", "telegram"); } catch { /* غير حرج */ }
              navigate("ADMIN");
            }}
            aria-label="إعدادات تيليجرام"
            title="ربط القنوات وتفعيل الاستيراد — من لوحة الإشراف"
          >
            <Settings className="w-4 h-4" />
            إعدادات
          </Button>
        )}
      </div>

      {/* الجداول غير منشأة — أقرب عطل للمشرفين مع الحل */}
      {!tablesReady && canManageRoles(user ?? null) && (
        <Card className="p-3 border-amber-500/40 bg-amber-500/10">
          <p className="text-xs text-amber-700 leading-relaxed">
            جداول تيليجرام غير منشأة في قاعدة البيانات — نفّذ ملف <span dir="ltr" className="font-mono">supabase_telegram.sql</span> في محرر SQL داخل Supabase، ثم أعد تحميل الصفحة. المحتوى سيظهر بعدها تلقائياً.
          </p>
        </Card>
      )}

      <Tabs value={tab} onValueChange={(v) => { setTab(v); setTypeFilter(""); }}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="library" className="data-[state=active]:font-bold text-xs">
            <FolderOpen className="w-4 h-4 ml-1" /> المكتبة
          </TabsTrigger>
          <TabsTrigger value="shared" className="data-[state=active]:font-bold text-xs">
            <Users className="w-4 h-4 ml-1" /> مساحة الفوج
          </TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="mt-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 right-3 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحث: امتحان الأدب الجاهلي، TD نحو…"
                className="pr-9"
                aria-label="البحث في دروس تيليجرام"
              />
            </div>
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className={cn(selectCls, "w-full sm:w-40 shrink-0")}
              aria-label="تصفية حسب المقياس"
            >
              <option value="">كل المقاييس</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin" role="group" aria-label="تصفية حسب النوع">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.value || "all"}
                onClick={() => setTypeFilter(f.value)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  typeFilter === f.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40"
                )}
                aria-pressed={typeFilter === f.value}
              >
                {f.label}
              </button>
            ))}
          </div>

          <LibraryList
            items={items}
            loading={loading}
            setup={setup}
            canManage={canManageRoles(user ?? null)}
            onRefresh={fetchItems}
          />
        </TabsContent>

        <TabsContent value="shared" className="mt-4 space-y-3">
          <SharedList
            items={items}
            loading={loading}
            myCohortId={myCohortId}
            courses={courses}
            currentUserName={user?.fullName ?? ""}
            onRefresh={fetchItems}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =====================================================
// Library list (channels content)
// =====================================================
function LibraryList({ items, loading, setup, canManage, onRefresh }: {
  items: TgItem[];
  loading: boolean;
  setup: { bot: boolean; activeSources: number } | null;
  canManage: boolean;
  onRefresh: () => void;
}) {
  const { navigate } = useShell();
  const groups = React.useMemo(() => groupAlbums(items), [items]);

  if (loading) {
    return (
      <Card className="p-8 text-center">
        <Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">جارٍ تحميل المنشورات…</p>
      </Card>
    );
  }

  if (items.length === 0) {
    const noSources = setup != null && setup.activeSources === 0;
    return (
      <Card className="p-8 text-center bg-muted/30 border-dashed">
        <Send className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <h3 className="font-bold text-sm mb-1">
          {noSources ? "لم تُربط أي قنوات بعد" : "لا توجد منشورات مطابقة"}
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {noSources
            ? "ستظهر الدروس هنا تلقائياً فور ربط قنوات التخصص بالمقاييس."
            : "جرّب تغيير كلمة البحث أو النوع — تُستورد المنشورات الجديدة لحظة نشرها في القنوات."}
        </p>
        {canManage && noSources && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <Button
              size="sm"
              onClick={() => {
                try { sessionStorage.setItem("talib-admin-tab", "telegram"); } catch { /* غير حرج */ }
                navigate("ADMIN");
              }}
            >
              <Send className="w-4 h-4 ml-1" />
              الانتقال إلى إعدادات تيليجرام
            </Button>
            <p className="text-xs text-muted-foreground">
              من لوحة الإشراف ← تبويب «تيليجرام»: ربط القنوات، تفعيل الاستيراد، واختبار الخط كاملاً
            </p>
          </div>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{items.length} عنصراً — مرتبة حسب الأحدث</p>
      {groups.map(({ key, item, images }) => (
        <ItemCard key={key} item={item} images={images} showCourse onRefresh={onRefresh} />
      ))}
    </div>
  );
}

// =====================================================
// Item card (shared between both tabs)
// =====================================================
function ItemCard({ item, images, showCourse, currentUserName, onRefresh }: {
  item: TgItem;
  images: TgItem[];
  showCourse: boolean;
  currentUserName?: string;
  onRefresh: () => void;
}) {
  const isOwn = currentUserName != null && currentUserName !== "" && item.postedBy === currentUserName && item.origin === "manual";
  const [deleting, setDeleting] = React.useState(false);
  const [imgError, setImgError] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  async function handleDeleteOwn() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/telegram/items?id=${item.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error); return; }
      toast.success("تم حذف العنصر");
      onRefresh();
    } catch { toast.error("فشل الحذف"); }
    finally { setDeleting(false); setConfirmDelete(false); }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className={cn("p-4", item.isFeatured && "border-primary/40 shadow-sm")}>
        <div className="flex items-start gap-3">
          {/* صورة المعاينة أو الأيقونة */}
          <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 flex items-center justify-center bg-muted">
            {item.kind === "image" && item.fileId && !imgError ? (
              <img
                src={`/api/telegram/file?file_id=${encodeURIComponent(item.fileId)}`}
                alt={item.titleAr || "معاينة"}
                loading="lazy"
                onError={() => setImgError(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-muted-foreground">{kindIcon(item.kind, "w-6 h-6")}</div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              {item.isFeatured && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" aria-label="مثبَّت" />}
              <h3 className="font-bold text-sm leading-snug">{item.titleAr || item.fileName || "منشور"}</h3>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant="outline" className={cn("text-xs border", TYPE_COLORS[item.itemType] ?? TYPE_COLORS["عام"])}>
                {item.itemType}
              </Badge>
              <Badge variant="outline" className="text-xs gap-1">
                {kindIcon(item.kind, "w-3 h-3")}
                {kindLabel(item.kind)}
              </Badge>
              {images.length > 1 && (
                <Badge variant="outline" className="text-xs">ألبوم • {images.length} صور</Badge>
              )}
              {showCourse && item.moduleName && (
                <Badge variant="secondary" className="text-xs">{item.moduleName}</Badge>
              )}
              {item.aiClassified && (
                <span className="text-xs text-muted-foreground flex items-center gap-0.5" title="صُنِّف آلياً عبر Gemini" role="img" aria-label="صُنِّف آلياً عبر Gemini">
                  <Sparkles className="w-3 h-3" />
                </span>
              )}
            </div>
            {item.captionText && (
              <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">{item.captionText}</p>
            )}
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-2 flex-wrap">
              {item.sourceTitle && <span>{item.sourceTitle}</span>}
              {item.postedBy && <span>• {item.postedBy}</span>}
              {item.postedAt && <span>• {formatDate(item.postedAt)}</span>}
              {item.sizeBytes > 0 && <span>• {formatSize(item.sizeBytes)}</span>}
            </p>
          </div>

          <div className="flex flex-col gap-1 shrink-0">
            <Button asChild size="sm" variant="outline" className="h-8">
              <a href={item.link} target="_blank" rel="noopener noreferrer" aria-label={`فتح ${item.titleAr || "المنشور"} في تيليجرام`}>
                <ExternalLink className="w-3.5 h-3.5 ml-1" />
                فتح
              </a>
            </Button>
            {isOwn && (
              <Button
                size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmDelete(true)}
                aria-label="حذف إضافتي"
                disabled={deleting}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* شبكة صور الألبوم */}
        {images.length > 1 && (
          <div className="grid grid-cols-4 gap-1.5 mt-3">
            {images.slice(0, 4).map((img) => (
              <a
                key={img.id}
                href={img.link}
                target="_blank"
                rel="noopener noreferrer"
                className="aspect-square rounded-lg overflow-hidden bg-muted"
                aria-label="فتح صورة الألبوم في تيليجرام"
              >
                <img
                  src={`/api/telegram/file?file_id=${encodeURIComponent(img.fileId)}`}
                  alt={img.titleAr || "صورة"}
                  loading="lazy"
                  className="w-full h-full object-cover hover:scale-105 transition-transform"
                />
              </a>
            ))}
          </div>
        )}

        {confirmDelete && (
          <Dialog open onOpenChange={() => setConfirmDelete(false)}>
            <DialogContent>
              <DialogHeader><DialogTitle className="text-destructive">حذف من مساحة الفوج</DialogTitle></DialogHeader>
              <p className="text-sm">هل تريد حذف <strong>{item.titleAr}</strong>؟ يمكن للممثل استرجاعه إذا أُعيدت إضافته.</p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmDelete(false)}>إلغاء</Button>
                <Button variant="destructive" onClick={handleDeleteOwn} disabled={deleting}>
                  {deleting && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حذف
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </Card>
    </motion.div>
  );
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "pdf": return "PDF";
    case "image": return "صورة";
    case "video": return "فيديو";
    case "audio": return "صوت";
    case "doc": return "مستند";
    case "ppt": return "عرض";
    case "text": return "نص";
    case "link": return "رابط";
    default: return "ملف";
  }
}

// =====================================================
// Shared space (مساحة الفوج)
// =====================================================
function SharedList({ items, loading, myCohortId, courses, currentUserName, onRefresh }: {
  items: TgItem[];
  loading: boolean;
  myCohortId: number | null;
  courses: Array<{ id: number; name: string; semester: number }>;
  currentUserName: string;
  onRefresh: () => void;
}) {
  const [addOpen, setAddOpen] = React.useState(false);

  if (loading) {
    return (
      <Card className="p-8 text-center">
        <Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">جارٍ تحميل المساحة المشتركة…</p>
      </Card>
    );
  }

  if (myCohortId == null) {
    return (
      <Card className="p-8 text-center bg-muted/30 border-dashed">
        <UserPlus className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <h3 className="font-bold text-sm mb-1">انضم إلى فوجك أولاً</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          مساحة الفوج المشتركة متاحة لمنضمي الأفواج — أرسل طلب انضمام من شاشة «المجموعات»
          ثم شارك هنا ملفات وروابط الدروس الخاصة بفوجك.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="p-3 bg-primary/5 border-primary/20">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-foreground/80 leading-relaxed">
            مساحة مشتركة لكل منتميي الفوج: ما ينشر في مجموعة الفوج على تيليجرام يظهر هنا تلقائياً،
            ويمكن لأي طالب إضافة روابط وملفات يدوياً. المحتوى الخاص بالفوج فقط — لا يراه الطلبة الآخرون.
          </p>
        </div>
      </Card>

      <AddManualItemDialog open={addOpen} setOpen={setAddOpen} courses={courses} onCreated={onRefresh} />

      {items.length === 0 ? (
        <Card className="p-8 text-center bg-muted/30 border-dashed">
          <Users className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-bold text-sm mb-1">المساحة فارغة حتى الآن</h3>
          <p className="text-xs text-muted-foreground">كن أول من يشارك زميلاءه درساً أو تمارين عبر زر «مشاركة محتوى».</p>
        </Card>
      ) : (
        items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            images={item.kind === "image" ? [item] : []}
            showCourse
            currentUserName={currentUserName}
            onRefresh={onRefresh}
          />
        ))
      )}
    </div>
  );
}

// =====================================================
// Manual add dialog (students + reps)
// =====================================================
function AddManualItemDialog({ open, setOpen, courses, onCreated }: {
  open: boolean;
  setOpen: (v: boolean) => void;
  courses: Array<{ id: number; name: string; semester: number }>;
  onCreated: () => void;
}) {
  const [title, setTitle] = React.useState("");
  const [link, setLink] = React.useState("");
  const [itemType, setItemType] = React.useState("عام");
  const [moduleId, setModuleId] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    if (!title.trim()) { toast.error("أدخل عنواناً للمحتوى"); return; }
    if (!/^https?:\/\/.+\..+/i.test(link.trim())) { toast.error("أدخل رابطاً صحيحاً يبدأ بـ https://"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/telegram/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          link: link.trim(),
          itemType,
          ...(moduleId ? { moduleId: parseInt(moduleId) } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشلت المشاركة"); return; }
      toast.success("تمت المشاركة مع الفوج");
      setOpen(false);
      setTitle(""); setLink(""); setItemType("عام"); setModuleId("");
      onCreated();
    } catch { toast.error("فشل الاتصال"); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full"><Plus className="w-4 h-4 ml-2" />مشاركة محتوى مع الفوج</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>مشاركة محتوى في مساحة الفوج</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="tg-title">العنوان</Label>
            <Input id="tg-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: حل سلسلة النحو رقم 3" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tg-link">الرابط</Label>
            <Input id="tg-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://t.me/… (رابط المنشور أو الملف)" dir="ltr" />
            <p className="text-xs text-muted-foreground">الرابط يفتح الأصل في تيليجرام أو أي مصدر آخر.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="tg-type">النوع</Label>
              <select id="tg-type" value={itemType} onChange={(e) => setItemType(e.target.value)} className={selectCls}>
                {["عام", "محاضرة", "أعمال موجهة TD", "تمارين", "امتحان", "ملخص", "كتاب", "إعلان"].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tg-module">المقياس (اختياري)</Label>
              <select id="tg-module" value={moduleId} onChange={(e) => setModuleId(e.target.value)} className={selectCls}>
                <option value="">— بدون —</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}مشاركة</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
