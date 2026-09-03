"use client";

/**
 * أدواتي — shared drag-to-reorder file list (merge PDFs + images order).
 *
 * Uses the @dnd-kit packages that were ALREADY in package.json (previously
 * unused) instead of adding a new drag dependency. Vertical sorting is
 * direction-agnostic, so it is naturally RTL-safe.
 */

import * as React from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface SortableRowItem {
  id: string;
  /** Extra hook for error styling (a corrupt file row is tinted red). */
  invalid?: boolean;
}

interface SortableFileListProps<T extends SortableRowItem> {
  items: T[];
  onReorder: (next: T[]) => void;
  onRemove: (id: string) => void;
  /** Row body (thumbnail / icon + name + badges) — right of the grip. */
  renderItem: (item: T) => React.ReactNode;
  removeLabel?: string;
}

export function SortableFileList<T extends SortableRowItem>({
  items,
  onReorder,
  onRemove,
  renderItem,
  removeLabel = "إزالة",
}: SortableFileListProps<T>) {
  // 6px activation distance: a plain tap on the row must NOT start a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(items, oldIndex, newIndex));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {items.map((item) => (
            <SortableRow
              key={item.id}
              item={item}
              onRemove={onRemove}
              removeLabel={removeLabel}
            >
              {renderItem(item)}
            </SortableRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow<T extends SortableRowItem>({
  item,
  onRemove,
  removeLabel,
  children,
}: {
  item: T;
  onRemove: (id: string) => void;
  removeLabel: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  return (
    <Card
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex-row items-center gap-2 p-2.5",
        isDragging && "z-10 shadow-lg border-primary/50 opacity-90",
        item.invalid && "border-destructive/50 bg-destructive/5"
      )}
    >
      <button
        type="button"
        className="p-1.5 -ms-1 rounded-lg text-muted-foreground/60 hover:text-primary hover:bg-muted cursor-grab active:cursor-grabbing touch-none shrink-0"
        {...attributes}
        {...listeners}
        aria-label="اسحب لإعادة الترتيب"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="flex-1 min-w-0">{children}</div>
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
        aria-label={removeLabel}
      >
        <X className="w-4 h-4" />
      </button>
    </Card>
  );
}
