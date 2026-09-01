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
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function TalibScheduleScreen() {
  const { t } = useI18n();
  const { user } = useAuth();
  const canManage = canManageSchedule(user ?? null);
  const [mode, setMode] = React.useState<"manual" | "image">("manual");
  const [items, setItems] = React.useState<ScheduleItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [addOpen, setAddOpen] = React.useState(false);
  // round 5: dialog-based delete (replaced native confirm) + edit dialog
  const [itemToDelete, setItemToDelete] = React.useState<ScheduleItem | null>(null);
  const [deletingItem, setDeletingItem] = React.useState(false);
  const [itemToEdit, setItemToEdit] = React.useState<ScheduleItem | null>(null);

  const fetchItems = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/schedule", { cache: "no-store" });
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  async function handleDelete() {
    if (!itemToDelete) return;
    setDeletingItem(true);
    try {
      const res = await fetch(`/api/schedule?id=${itemToDelete.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "فشل الحذف"); return; }
      toast.success("تم حذف الحصة");
      setItemToDelete(null);
      fetchItems();
    } catch {
      toast.error("فشل الحذف");
    } finally {
      setDeletingItem(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black mb-1">{t("schedule.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {mode === "manual"
            ? "أدخل حصصك يدوياً أو عدّلها"
            : "ارفع صورة جدولك الخاص"}
        </p>
      </div>

      <Tabs value={mode} onValueChange={(v) => setMode(v as "manual" | "image")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="manual">
            <CalendarDays className="w-4 h-4 ml-2" />
            {t("schedule.modeManual")}
          </TabsTrigger>
          <TabsTrigger value="image">
            <ImageIcon className="w-4 h-4 ml-2" />
            {t("schedule.modeImage")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="manual" className="mt-4 space-y-4">
          {canManage && (
            <AddSlotDialog
              open={addOpen}
              onOpenChange={setAddOpen}
              onCreated={fetchItems}
            />
          )}
          {loading ? (
            <Card className="p-8 text-center">
              <Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            </Card>
          ) : (
            DAYS.map((day) => {
              const dayItems = items.filter((i) => i.dayOfWeek === day.key);
              return (
                <Card key={day.key} className="p-4">
                  <h3 className="font-bold text-sm mb-2">{t(day.label)}</h3>
                  {dayItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">
                      {t("schedule.noSlots")}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {dayItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 p-2 rounded-lg bg-muted/40"
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
      </Tabs>
      {itemToEdit && (
        <EditSlotDialog
          item={itemToEdit}
          onClose={() => setItemToEdit(null)}
          onSaved={() => { setItemToEdit(null); fetchItems(); }}
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
  const { t } = useI18n();
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
          {t("schedule.addSlot")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إضافة حصة جديدة</DialogTitle>
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
