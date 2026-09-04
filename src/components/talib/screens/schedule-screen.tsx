"use client";

import * as React from "react";
import {
  CalendarDays,
  ImageIcon,
  Upload,
  Plus,
  Clock,
  MapPin,
  User,
  Trash2,
  Pencil,
  Loader2,
  CalendarX,
  ChevronDown,
  ChevronLeft,
  CheckCircle2,
  StickyNote,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useI18n } from "@/components/talib/i18n-provider";
import { useAuth } from "@/components/talib/auth-provider";
import { canManageSchedule } from "@/lib/auth/permissions";
import { toast } from "sonner";

const DAYS = [
  { key: 1, label: "schedule.sunday" },
  { key: 2, label: "schedule.monday" },
  { key: 3, label: "schedule.tuesday" },
  { key: 4, label: "schedule.wednesday" },
  { key: 5, label: "schedule.thursday" },
];

interface ScheduleItem {
  id: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  moduleName: string;
  type: string;
  room: string;
  professor: string;
}

// round 27 (review §7): the user's OWN classes — private, editable by
// them, visually distinguished from the official specialty schedule.
interface PersonalItem {
  id: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  moduleName: string;
  type: string;
  room: string;
  notes: string;
}

export function TalibScheduleScreen() {
  const { t } = useI18n();
  const { user } = useAuth();
  const canManage = canManageSchedule(user ?? null);
  // round 9 (spec §15): "manual" | "image" | "attendance" — the
  // personal attendance/absence feature lives INSIDE the Schedule section
  // (a clearly separated tab), never inside "My Files".
  const [mode, setMode] = React.useState<"manual" | "image" | "attendance">("manual");
  const [items, setItems] = React.useState<ScheduleItem[]>([]);
  // round 27 (review §7): personal classes live alongside the official ones
  const [personalItems, setPersonalItems] = React.useState<PersonalItem[]>([]);
  const [personalAddOpen, setPersonalAddOpen] = React.useState(false);
  const [personalToEdit, setPersonalToEdit] = React.useState<PersonalItem | null>(null);
  const [personalToDelete, setPersonalToDelete] = React.useState<PersonalItem | null>(null);
  const [deletingPersonal, setDeletingPersonal] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [addOpen, setAddOpen] = React.useState(false);
  // round 5: dialog-based delete (replaced native confirm) + edit dialog
  const [itemToDelete, setItemToDelete] = React.useState<ScheduleItem | null>(null);
  const [deletingItem, setDeletingItem] = React.useState(false);
  const [itemToEdit, setItemToEdit] = React.useState<ScheduleItem | null>(null);

  // round 27: official + personal are fetched together so the day cards
  // render once, fully merged. The personal endpoint degrades to an empty
  // list (e.g. before the production table exists) without breaking the
  // official schedule.
  const fetchAll = React.useCallback(async () => {
    setLoading(true);
    try {
      const [offRes, perRes] = await Promise.all([
        fetch("/api/schedule", { cache: "no-store" }),
        fetch("/api/schedule/personal", { cache: "no-store" }),
      ]);
      const off = await offRes.json().catch(() => ({ items: [] }));
      const per = await perRes.json().catch(() => ({ items: [] }));
      setItems(off.items ?? []);
      setPersonalItems(per.items ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  async function handleDelete() {
    if (!itemToDelete) return;
    setDeletingItem(true);
    try {
      const res = await fetch(`/api/schedule?id=${itemToDelete.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "فشل الحذف"); return; }
      toast.success("تم حذف الحصة");
      setItemToDelete(null);
      fetchAll();
    } catch {
      toast.error("فشل الحذف");
    } finally {
      setDeletingItem(false);
    }
  }

  // round 27 (review §7): delete one of MY personal classes
  async function handleDeletePersonal() {
    if (!personalToDelete) return;
    setDeletingPersonal(true);
    try {
      const res = await fetch(`/api/schedule/personal?id=${personalToDelete.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "فشل الحذف"); return; }
      toast.success("تم حذف الحصة الشخصية");
      setPersonalToDelete(null);
      fetchAll();
    } catch {
      toast.error("فشل الحذف");
    } finally {
      setDeletingPersonal(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black mb-1">{t("schedule.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {mode === "manual"
            ? "الجدول الرسمي لتخصصك وحصصك الشخصية في مكان واحد"
            : mode === "image"
            ? "ارفع صورة جدولك الخاص"
            : "سجل غياباتك الشخصية لكل مقياس"}
        </p>
      </div>

      <Tabs value={mode} onValueChange={(v) => setMode(v as "manual" | "image" | "attendance")}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="manual">
            <CalendarDays className="w-4 h-4 ml-2" />
            {t("schedule.modeManual")}
          </TabsTrigger>
          <TabsTrigger value="image">
            <ImageIcon className="w-4 h-4 ml-2" />
            {t("schedule.modeImage")}
          </TabsTrigger>
          <TabsTrigger value="attendance">
            <CalendarX className="w-4 h-4 ml-2" />
            غياباتي
          </TabsTrigger>
        </TabsList>
        <TabsContent value="manual" className="mt-4 space-y-4">
          {/* round 27 (review §7): everyone gets the personal-class button;
              the OFFICIAL add stays supervisor-only. Two side-by-side
              buttons for supervisors, one full-width for students. */}
          <div className={canManage ? "grid grid-cols-2 gap-2" : ""}>
            {canManage && (
              <AddSlotDialog
                open={addOpen}
                onOpenChange={setAddOpen}
                onCreated={fetchAll}
              />
            )}
            <PersonalSlotDialog
              open={personalAddOpen}
              onOpenChange={setPersonalAddOpen}
              onSaved={fetchAll}
            />
          </div>
          <p className="text-[11px] text-muted-foreground -mt-1">
            الحصص المُظلّلة بالبرتقالي هي حصصك الشخصية — تظهر لك فقط ولا تُخل بالجدول الرسمي.
          </p>
          {loading ? (
            <Card className="p-8 text-center">
              <Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            </Card>
          ) : (
            DAYS.map((day) => {
              const dayItems = items.filter((i) => i.dayOfWeek === day.key);
              const dayPersonal = personalItems.filter((i) => i.dayOfWeek === day.key);
              return (
                <Card key={day.key} className="p-4">
                  <h3 className="font-bold text-sm mb-2">{t(day.label)}</h3>
                  {dayItems.length === 0 && dayPersonal.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">
                      {t("schedule.noSlots")}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {dayItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 p-2 rounded-lg bg-muted/40 border border-border/70"
                        >
                          <div className="flex flex-col items-center justify-center w-14 h-14 rounded-lg bg-primary/10 text-primary shrink-0">
                            <span className="text-xs">يبدأ</span>
                            <span className="text-xs font-bold">{item.startTime}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm truncate">
                              {item.moduleName}
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
                              <span>{item.type}</span>
                              {item.room && (
                                <span className="flex items-center gap-0.5">
                                  <MapPin className="w-2.5 h-2.5" />
                                  {item.room}
                                </span>
                              )}
                              {item.professor && (
                                <span className="flex items-center gap-0.5">
                                  <User className="w-2.5 h-2.5" />
                                  {item.professor}
                                </span>
                              )}
                            </div>
                            {item.endTime && (
                              <div className="text-xs text-muted-foreground mt-0.5">
                                ينتهي: {item.endTime}
                              </div>
                            )}
                          </div>
                          {canManage && (
                            <div className="flex flex-col gap-1 shrink-0">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-primary h-8 w-8"
                                onClick={() => setItemToEdit(item)}
                                aria-label="تعديل الحصة"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-destructive h-8 w-8"
                                onClick={() => setItemToDelete(item)}
                                aria-label="حذف الحصة"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                      {/* round 27 (review §7): personal rows — amber-tinted,
                          explicitly badged «شخصية», always editable by their
                          owner (the API only ever returns the caller's rows). */}
                      {dayPersonal.map((item) => (
                        <div
                          key={`p-${item.id}`}
                          className="flex items-center gap-3 p-2 rounded-lg bg-amber-500/5 border border-amber-500/20"
                        >
                          <div className="flex flex-col items-center justify-center w-14 h-14 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 shrink-0">
                            <span className="text-xs">يبدأ</span>
                            <span className="text-xs font-bold">{item.startTime}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm truncate flex items-center gap-1.5">
                              <span className="truncate" title={item.moduleName}>{item.moduleName}</span>
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1.5 py-0 shrink-0 border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/10"
                              >
                                شخصية
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
                              <span>{item.type}</span>
                              {item.room && (
                                <span className="flex items-center gap-0.5">
                                  <MapPin className="w-2.5 h-2.5" />
                                  {item.room}
                                </span>
                              )}
                              {item.endTime && <span>حتى {item.endTime}</span>}
                            </div>
                            {item.notes && (
                              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 min-w-0">
                                <StickyNote className="w-2.5 h-2.5 shrink-0" />
                                <span className="truncate">{item.notes}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-primary h-8 w-8"
                              onClick={() => setPersonalToEdit(item)}
                              aria-label="تعديل الحصة الشخصية"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-destructive h-8 w-8"
                              onClick={() => setPersonalToDelete(item)}
                              aria-label="حذف الحصة الشخصية"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </TabsContent>
        <TabsContent value="image" className="mt-4">
          <ImageSchedule />
        </TabsContent>
        <TabsContent value="attendance" className="mt-4">
          <MyAttendance />
        </TabsContent>
      </Tabs>
      {itemToEdit && (
        <EditSlotDialog
          item={itemToEdit}
          onClose={() => setItemToEdit(null)}
          onSaved={() => { setItemToEdit(null); fetchAll(); }}
        />
      )}

      {/* round 27: edit dialog for one of MY personal classes */}
      {personalToEdit && (
        <PersonalSlotDialog
          item={personalToEdit}
          open
          onOpenChange={(v) => { if (!v) setPersonalToEdit(null); }}
          onSaved={() => { setPersonalToEdit(null); fetchAll(); }}
        />
      )}

      {itemToDelete && (
        <Dialog open onOpenChange={() => setItemToDelete(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="text-destructive flex items-center gap-2"><Trash2 className="w-5 h-5" />حذف حصة</DialogTitle></DialogHeader>
            <p className="text-sm">هل تريد حذف حصة <strong>{itemToDelete.moduleName}</strong> ({itemToDelete.startTime})؟</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setItemToDelete(null)}>إلغاء</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deletingItem}>{deletingItem && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حذف نهائي</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* round 27: delete dialog for one of MY personal classes */}
      {personalToDelete && (
        <Dialog open onOpenChange={() => setPersonalToDelete(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="text-destructive flex items-center gap-2"><Trash2 className="w-5 h-5" />حذف حصة شخصية</DialogTitle></DialogHeader>
            <p className="text-sm">هل تريد حذف حصتك الشخصية <strong>{personalToDelete.moduleName}</strong> ({personalToDelete.startTime})؟</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPersonalToDelete(null)}>إلغاء</Button>
              <Button variant="destructive" onClick={handleDeletePersonal} disabled={deletingPersonal}>{deletingPersonal && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}حذف نهائي</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function AddSlotDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [dayOfWeek, setDayOfWeek] = React.useState("1");
  const [startTime, setStartTime] = React.useState("");
  const [endTime, setEndTime] = React.useState("");
  const [moduleName, setModuleName] = React.useState("");
  const [type, setType] = React.useState("محاضرة");
  const [room, setRoom] = React.useState("");
  const [professor, setProfessor] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    if (!startTime.trim() || !moduleName.trim()) {
      toast.error("وقت البداية واسم المقياس مطلوبان");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dayOfWeek: parseInt(dayOfWeek),
          startTime: startTime.trim(),
          endTime: endTime.trim(),
          moduleName: moduleName.trim(),
          type,
          room: room.trim(),
          professor: professor.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "فشل الحفظ");
        return;
      }
      toast.success("تمت إضافة الحصة بنجاح");
      onOpenChange(false);
      setStartTime("");
      setEndTime("");
      setModuleName("");
      setRoom("");
      setProfessor("");
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="w-full">
          <Plus className="w-4 h-4 ml-2" />
          حصة رسمية
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إضافة حصة رسمية للجدول</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>اليوم</Label>
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="1">الأحد</option>
              <option value="2">الإثنين</option>
              <option value="3">الثلاثاء</option>
              <option value="4">الأربعاء</option>
              <option value="5">الخميس</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>وقت البداية</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>وقت النهاية</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>اسم المقياس</Label>
            <Input
              value={moduleName}
              onChange={(e) => setModuleName(e.target.value)}
              placeholder="مثال: الأدب الجاهلي"
            />
          </div>
          <div className="space-y-1.5">
            <Label>النوع</Label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="محاضرة">محاضرة</option>
              <option value="أعمال موجهة TD">أعمال موجهة (TD)</option>
              <option value="أعمال تطبيقية TP">أعمال تطبيقية (TP)</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>القاعة</Label>
              <Input
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="مثال: A12"
              />
            </div>
            <div className="space-y-1.5">
              <Label>الأستاذ</Label>
              <Input
                value={professor}
                onChange={(e) => setProfessor(e.target.value)}
                placeholder="اسم الأستاذ"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}
            حفظ الحصة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// round 27 (review §7): add OR edit a PERSONAL class — one form, two
// modes. item == null → POST (add); item != null → PATCH (edit). The
// dialog states explicitly that personal classes stay private, per the
// review's requirement that personal data is never mistaken for the
// official institutional schedule.
function PersonalSlotDialog({
  item,
  open,
  onOpenChange,
  onSaved,
}: {
  item?: PersonalItem | null; // when set → edit mode
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const editing = !!item;
  const [dayOfWeek, setDayOfWeek] = React.useState(String(item?.dayOfWeek ?? 1));
  const [startTime, setStartTime] = React.useState(item?.startTime ?? "");
  const [endTime, setEndTime] = React.useState(item?.endTime ?? "");
  const [moduleName, setModuleName] = React.useState(item?.moduleName ?? "");
  const [type, setType] = React.useState(item?.type ?? "محاضرة");
  const [room, setRoom] = React.useState(item?.room ?? "");
  const [notes, setNotes] = React.useState(item?.notes ?? "");
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    if (!startTime.trim() || !moduleName.trim()) {
      toast.error("وقت البداية واسم المقياس مطلوبان");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/schedule/personal", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editing ? { id: item!.id } : {}),
          dayOfWeek: parseInt(dayOfWeek),
          startTime: startTime.trim(),
          endTime: endTime.trim(),
          moduleName: moduleName.trim(),
          type,
          room: room.trim(),
          notes: notes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "فشل الحفظ");
        return;
      }
      toast.success(editing ? "تم تعديل الحصة الشخصية" : "تمت إضافة الحصة الشخصية");
      onOpenChange(false);
      if (!editing) {
        // reset the add form for next time (mirrors AddSlotDialog)
        setStartTime("");
        setEndTime("");
        setModuleName("");
        setRoom("");
        setNotes("");
      }
      onSaved();
    } catch {
      toast.error("فشل الاتصال");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {!editing && (
        <DialogTrigger asChild>
          <Button variant="outline" className="w-full">
            <Plus className="w-4 h-4 ml-2" />
            حصة شخصية
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {editing ? (
              <>
                <Pencil className="w-5 h-5" />
                تعديل الحصة الشخصية
              </>
            ) : (
              "إضافة حصة شخصية"
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>اليوم</Label>
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="1">الأحد</option>
              <option value="2">الإثنين</option>
              <option value="3">الثلاثاء</option>
              <option value="4">الأربعاء</option>
              <option value="5">الخميس</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>وقت البداية</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>وقت النهاية</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>اسم المقياس</Label>
            <Input
              value={moduleName}
              onChange={(e) => setModuleName(e.target.value)}
              placeholder="مثال: الأدب الجاهلي"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>النوع</Label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="محاضرة">محاضرة</option>
                <option value="أعمال موجهة TD">أعمال موجهة (TD)</option>
                <option value="أعمال تطبيقية TP">أعمال تطبيقية (TP)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>المكان</Label>
              <Input
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="مثال: A12"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>ملاحظات (اختياري)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: سأحضر مع تمارين المجموعة الثانية"
              rows={2}
            />
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            الحصة الشخصية تظهر لك فقط — لا يراها زملاؤك ولا تُعدّل الجدول الرسمي للتخصص.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}
            {editing ? "حفظ التعديل" : "حفظ الحصة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImageSchedule() {
  const { t } = useI18n();
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "application/pdf"].includes(file.type)) {
      toast.error("صيغة غير مدعومة. استخدم PNG أو JPG أو PDF.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("حجم الملف يتجاوز 10 ميغابايت.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageUrl(reader.result as string);
      toast.success("تم تحميل الصورة — تُعرض على هذا الجهاز أثناء الجلسة الحالية.");
    };
    reader.readAsDataURL(file);
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="font-bold text-sm mb-1">{t("schedule.uploadImage")}</h3>
          <p className="text-xs text-muted-foreground">{t("schedule.imageHint")}</p>
        </div>
        {imageUrl ? (
          <div className="space-y-3">
            <img
              src={imageUrl}
              alt="Schedule"
              className="w-full rounded-xl border border-border"
            />
            <Button variant="outline" size="sm" onClick={() => setImageUrl(null)}>
              تغيير الصورة
            </Button>
          </div>
        ) : (
          <label className="block">
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors">
              <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">اضغط لاختيار صورة</p>
              <p className="text-xs text-muted-foreground mt-1">
                PNG, JPG, PDF — حتى 10MB
              </p>
            </div>
            <input
              type="file"
              accept="image/png,image/jpeg,application/pdf"
              onChange={handleUpload}
              className="hidden"
            />
          </label>
        )}
      </div>
    </Card>
  );
}

// round 5: edit an existing schedule slot (fix a typo / move a slot
// without delete + retype). Mirrors AddSlotDialog but pre-filled.
function EditSlotDialog({ item, onClose, onSaved }: { item: ScheduleItem; onClose: () => void; onSaved: () => void }) {
  const [dayOfWeek, setDayOfWeek] = React.useState(String(item.dayOfWeek));
  const [startTime, setStartTime] = React.useState(item.startTime);
  const [endTime, setEndTime] = React.useState(item.endTime);
  const [moduleName, setModuleName] = React.useState(item.moduleName);
  const [type, setType] = React.useState(item.type || "محاضرة");
  const [room, setRoom] = React.useState(item.room);
  const [professor, setProfessor] = React.useState(item.professor);
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    if (!startTime.trim() || !moduleName.trim()) {
      toast.error("وقت البداية واسم المقياس مطلوبان");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          dayOfWeek: parseInt(dayOfWeek),
          startTime: startTime.trim(),
          endTime: endTime.trim(),
          moduleName: moduleName.trim(),
          type,
          room: room.trim(),
          professor: professor.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "فشل الحفظ");
        return;
      }
      toast.success("تم تعديل الحصة");
      onSaved();
    } catch {
      toast.error("فشل الاتصال");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Pencil className="w-5 h-5" />تعديل الحصة</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>اليوم</Label>
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="1">الأحد</option>
              <option value="2">الإثنين</option>
              <option value="3">الثلاثاء</option>
              <option value="4">الأربعاء</option>
              <option value="5">الخميس</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>وقت البداية</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>وقت النهاية</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>اسم المقياس</Label>
            <Input value={moduleName} onChange={(e) => setModuleName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>النوع</Label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="محاضرة">محاضرة</option>
              <option value="أعمال موجهة TD">أعمال موجهة (TD)</option>
              <option value="أعمال تطبيقية TP">أعمال تطبيقية (TP)</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>القاعة</Label>
              <Input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="مثال: A12" />
            </div>
            <div className="space-y-1.5">
              <Label>الأستاذ</Label>
              <Input value={professor} onChange={(e) => setProfessor(e.target.value)} placeholder="اسم الأستاذ" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}
            حفظ التعديل
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================
// round 9 — Personal attendance & absence tracking (spec §14–§19)
//
// STRICTLY PERSONAL: the API (/api/attendance) only ever touches the
// logged-in user's OWN records — supervisors have no administrative
// access, no approval workflow, and no way to see or edit a student's
// absences. This is unofficial personal bookkeeping only.
//
// Layout per spec §16: course name + absence count + "+" button,
// simple and compact. Tapping a row expands its records (deletable).
// =====================================================
interface AttendanceCourse {
  name: string;
  count: number;
  records: Array<{ id: number; moduleName: string; date: string; createdAt: string }>;
}

function MyAttendance() {
  const [courses, setCourses] = React.useState<AttendanceCourse[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [addFor, setAddFor] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<number | null>(null);

  const fetchAttendance = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/attendance", { cache: "no-store" });
      const data = await res.json();
      setCourses(data.courses ?? []);
      setTotal(data.totalAbsences ?? 0);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { fetchAttendance(); }, [fetchAttendance]);

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/attendance?id=${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "فشل الحذف"); return; }
      toast.success("تم حذف سجل الغياب");
      fetchAttendance();
    } catch {
      toast.error("فشل الاتصال");
    } finally {
      setDeletingId(null);
    }
  }

  const absenceLabel = (n: number) =>
    n === 0 ? "لا غياب" : n === 1 ? "غياب واحد" : n === 2 ? "غيابان" : `${n} غيابات`;

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-primary/5 border-primary/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <CalendarX className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h2 className="font-black text-sm">تتبع الغيابات — شخصي وغير رسمي</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              سجلك الخاص فقط: {absenceLabel(total)} • لا يطّلع عليه أي مشرف — البيانات تُعدَّل منك وحدك
            </p>
          </div>
          <Button size="sm" onClick={() => setAddFor(null)}>
            <Plus className="w-4 h-4 ml-1" />غياب
          </Button>
        </div>
      </Card>

      {loading ? (
        <Card className="p-8 text-center">
          <Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">جاري التحميل...</p>
        </Card>
      ) : courses.length === 0 ? (
        <Card className="p-8 text-center bg-muted/30 border-dashed">
          <CalendarX className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-bold text-sm mb-1">لا توجد مقاييس بعد</h3>
          <p className="text-xs text-muted-foreground">
            ستظهر مقاييسك هنا تلقائياً بمجرد إضافتها من لوحة الإدارة — يمكنك تسجيل أول غياب بزر «+».
          </p>
        </Card>
      ) : (
        <Card className="p-4 space-y-1.5">
          {courses.map((course) => {
            const isOpen = expanded === course.name;
            return (
              <div key={course.name} className="rounded-lg border border-border/60 overflow-hidden">
                <div
                  className="flex items-center gap-2 p-3 cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => setExpanded(isOpen ? null : course.name)}
                  role="button"
                  aria-expanded={isOpen}
                >
                  {course.count > 0 ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); setAddFor(course.name); }}
                      className="w-8 h-8 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 flex items-center justify-center shrink-0 transition-colors"
                      aria-label={`إضافة غياب لـ ${course.name}`}
                      title="إضافة غياب"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); setAddFor(course.name); }}
                      className="w-8 h-8 rounded-lg bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary flex items-center justify-center shrink-0 transition-colors"
                      aria-label={`إضافة غياب لـ ${course.name}`}
                      title="إضافة غياب"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  )}
                  <span className="font-bold text-sm flex-1 min-w-0 truncate">{course.name}</span>
                  <span className={`text-xs font-medium shrink-0 ${course.count > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                    {absenceLabel(course.count)}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                  </span>
                </div>
                {isOpen && (
                  <div className="border-t border-border/40 bg-muted/20 p-2 space-y-1.5">
                    {course.records.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-2">لا توجد سجلات</p>
                    ) : (
                      course.records.map((r) => (
                        <div key={r.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-background">
                          <div className="flex items-center gap-2 text-xs min-w-0">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="font-medium" dir="ltr">{r.date}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                            onClick={() => handleDelete(r.id)}
                            disabled={deletingId === r.id}
                            aria-label="حذف السجل"
                          >
                            {deletingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}

      {addFor !== null && (
        <AddAbsenceDialog
          courses={courses.map((c) => c.name)}
          initialCourse={addFor || undefined}
          onClose={() => setAddFor(null)}
          onSaved={() => { setAddFor(null); fetchAttendance(); }}
        />
      )}
    </div>
  );
}

/**
 * Add-absence modal (spec §17): student selects course + date → record
 * is created and the count for that course updates immediately.
 */
function AddAbsenceDialog({
  courses, initialCourse, onClose, onSaved,
}: {
  courses: string[];
  initialCourse?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [course, setCourse] = React.useState(initialCourse ?? (courses[0] ?? ""));
  const [customCourse, setCustomCourse] = React.useState("");
  const [date, setDate] = React.useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = React.useState(false);
  const effectiveCourse = course === "__custom__" ? customCourse : course;

  async function handleSave() {
    if (!effectiveCourse.trim()) { toast.error("اختر/اكتب اسم المقياس"); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast.error("اختر التاريخ"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleName: effectiveCourse.trim(), date }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "فشل الحفظ"); return; }
      toast.success("تم تسجيل الغياب");
      onSaved();
    } catch {
      toast.error("فشل الاتصال");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarX className="w-5 h-5 text-primary" />تسجيل غياب</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>المقياس</Label>
            {courses.length === 0 ? (
              <Input
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                placeholder="اسم المقياس"
              />
            ) : (
              <select value={course} onChange={(e) => setCourse(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                {courses.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value="__custom__">— مقياس آخر —</option>
              </select>
            )}
          </div>
          {course === "__custom__" && (
            <div className="space-y-1.5">
              <Label>اسم المقياس</Label>
              <Input
                value={customCourse}
                onChange={(e) => setCustomCourse(e.target.value)}
                placeholder="اكتب اسم المقياس"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>التاريخ</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              dir="ltr"
              className="text-right"
            />
          </div>
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <p>هذا سجل شخصي غير رسمي — لن يراه أي مشرف، ويمكنك حذفه في أي وقت.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saving || !effectiveCourse.trim()}>
            {saving && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}
            تسجيل الغياب
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
