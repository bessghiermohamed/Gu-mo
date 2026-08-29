"use client";

import * as React from "react";
import { StickyNote, Download, Save, Plus, Trash2, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useI18n } from "@/components/talib/i18n-provider";
import { toast } from "sonner";

// Fix "ج": merged "ملفاتي" + "محتوى مخزن" into single screen with sub-tabs

interface Note {
  id: number;
  title: string;
  content: string;
  color: string;
}

export function TalibFilesScreen() {
  const { t } = useI18n();
  const [notes, setNotes] = React.useState<Note[]>([]);
  const [newTitle, setNewTitle] = React.useState("");
  const [newContent, setNewContent] = React.useState("");

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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black mb-1">{t("files.title")}</h1>
        <p className="text-sm text-muted-foreground">
          محفوظاتك، تحميلاتك، وملاحظاتك في مكان واحد
        </p>
      </div>

      {/* Single screen with sub-tabs (fix "ج": merge files + offline) */}
      <Tabs defaultValue="notes">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="saved">
            <Save className="w-3.5 h-3.5 ml-1.5" />
            {t("files.tabSaved")}
          </TabsTrigger>
          <TabsTrigger value="downloads">
            <Download className="w-3.5 h-3.5 ml-1.5" />
            {t("files.tabDownloads")}
          </TabsTrigger>
          <TabsTrigger value="notes">
            <StickyNote className="w-3.5 h-3.5 ml-1.5" />
            {t("files.tabNotes")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="saved" className="mt-4">
          <Card className="p-8 text-center bg-muted/30 border-dashed">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-bold text-sm mb-1">{t("files.noFiles")}</h3>
            <p className="text-xs text-muted-foreground">
              المحاضرات التي تقرؤها ستحفظ هنا تلقائياً للوصول دون اتصال.
            </p>
          </Card>
        </TabsContent>

        <TabsContent value="downloads" className="mt-4">
          <Card className="p-8 text-center bg-muted/30 border-dashed">
            <Download className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-bold text-sm mb-1">لا توجد تحميلات</h3>
            <p className="text-xs text-muted-foreground">
              ملفات PDF التي تحمّلها ستظهر هنا.
            </p>
          </Card>
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
                  className="p-4 border-l-4"
                  style={{ borderLeftColor: note.color }}
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
