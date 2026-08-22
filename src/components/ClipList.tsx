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
import { GapChip, GapInsertButton } from "./GapChip";
import {
  getClipGapAfter,
  getClipHook,
  getHookGapAfter,
  getPlaybackOrder,
} from "@/lib/defaults";

export function ClipList() {
  const { project, reorderClips, updateClip } = useEditor();
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

  const playbackOrder = getPlaybackOrder(project.clips, project.settings);
  const playIndex = new Map(playbackOrder.map((c, i) => [c.id, i]));
  const inDepth = project.settings.inDepthRanking === true;

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Clips</h2>
        <p className="muted">
          Drag to reorder · drop a video onto a clip · tap{" "}
          <strong>+ black</strong> between clips (or after a hook) for a short black hold
        </p>
        <p className="muted">
          {inDepth ? (
            <>
              Each clip shows its <strong>description</strong> while it plays, then
              switches to “name - score/10”.
            </>
          ) : (
            <>
              Turn on <strong>In Depth Ranking</strong> in Look to play the
              description first and reveal “name - score/10” afterwards.
            </>
          )}
        </p>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext
          items={project.clips.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="clip-list">
            {project.clips.map((clip) => {
              const playIdx = playIndex.get(clip.id) ?? -1;
              const canSetAfter =
                clip.status === "ready" &&
                playIdx >= 0 &&
                playIdx < playbackOrder.length - 1;
              const hasHook = Boolean(getClipHook(clip));
              const hookGap = getHookGapAfter(clip);
              const afterGap = getClipGapAfter(clip);

              return (
                <div key={clip.id} className="clip-stack">
                  <ClipCard clip={clip} />

                  {clip.status === "ready" && hasHook ? (
                    hookGap > 0 ? (
                      <GapChip
                        label="after hook"
                        seconds={hookGap}
                        onChange={(seconds) =>
                          updateClip(clip.id, { hookGapAfter: seconds })
                        }
                        onClear={() => updateClip(clip.id, { hookGapAfter: 0 })}
                      />
                    ) : (
                      <GapInsertButton
                        label="Add black after hook teaser"
                        onInsert={() => updateClip(clip.id, { hookGapAfter: 0.5 })}
                      />
                    )
                  ) : null}

                  {canSetAfter ? (
                    afterGap > 0 ? (
                      <GapChip
                        label="between clips"
                        seconds={afterGap}
                        onChange={(seconds) =>
                          updateClip(clip.id, { gapAfter: seconds })
                        }
                        onClear={() => updateClip(clip.id, { gapAfter: 0 })}
                      />
                    ) : (
                      <GapInsertButton
                        label="Add black between this clip and the next"
                        onInsert={() => updateClip(clip.id, { gapAfter: 0.5 })}
                      />
                    )
                  ) : null}
                </div>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  );
}
