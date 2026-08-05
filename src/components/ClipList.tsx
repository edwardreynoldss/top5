"use client";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useEditor } from "@/lib/store";
import { ClipCard } from "./ClipCard";

export function ClipList() {
  const { project, reorderClips } = useEditor();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorderClips(String(active.id), String(over.id));
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Clips</h2>
        <p className="muted">
          Drag to reorder · drop a video onto a clip · black gap slider adds a black
          screen between clips (overlays stay)
        </p>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext
          items={project.clips.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="clip-list">
            {project.clips.map((clip) => (
              <ClipCard key={clip.id} clip={clip} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  );
}
