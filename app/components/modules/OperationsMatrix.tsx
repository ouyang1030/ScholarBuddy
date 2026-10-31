"use client";

import { useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  rectIntersection,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import {
  OPERATION_QUADRANTS,
  operationQuadrant,
  operationFinished,
} from "../../../shared/operations.mjs";
import { useT } from "../../i18n";
import type { RecordItem } from "../../types";

export type Quadrant = (typeof OPERATION_QUADRANTS)[number] | "";
const zoneId = (quadrant: Quadrant) => `quadrant:${quadrant || "unclassified"}`;

// Arrow keys move between whole regions, rather than making a keyboard user
// traverse a large board 25 pixels at a time. Geometry also works in one column.
const quadrantCoordinates: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  const { collisionRect, droppableRects, droppableContainers, over, active } = context;
  if (!collisionRect || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.code))
    return;
  event.preventDefault();
  const currentId = over?.id || zoneId(operationQuadrant(active?.data.current?.quadrant));
  const current = droppableRects.get(currentId) || collisionRect;
  const center = { x: current.left + current.width / 2, y: current.top + current.height / 2 };
  const horizontal = event.code === "ArrowLeft" || event.code === "ArrowRight";
  const sign = event.code === "ArrowLeft" || event.code === "ArrowUp" ? -1 : 1;
  const candidates = droppableContainers
    .getEnabled()
    .flatMap(({ id }) => {
      const rect = droppableRects.get(id);
      if (!rect || id === currentId) return [];
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const along = horizontal ? x - center.x : y - center.y;
      const across = horizontal ? y - center.y : x - center.x;
      if (along * sign <= 1) return [];
      return [{ x, y, score: Math.abs(along) + Math.abs(across) * 3 }];
    })
    .sort((a, b) => a.score - b.score);
  const target = candidates[0];
  if (!target) return;
  return {
    x: currentCoordinates.x + target.x - (collisionRect.left + collisionRect.width / 2),
    y: currentCoordinates.y + target.y - (collisionRect.top + collisionRect.height / 2),
  };
};

function QuadrantRegion({
  quadrant,
  items,
  writable,
  onCreate,
  renderCard,
}: {
  quadrant: Quadrant;
  items: RecordItem[];
  writable: boolean;
  onCreate: (quadrant: Quadrant) => void;
  renderCard: (item: RecordItem) => ReactNode;
}) {
  const t = useT();
  const { setNodeRef, isOver, active } = useDroppable({
    id: zoneId(quadrant),
    data: { quadrant },
    disabled: !writable,
  });
  const name = quadrant ? t.operations.quadrants[quadrant] : t.operations.unclassified;
  const id = `operations-${quadrant || "unclassified"}`;
  return (
    <section
      ref={setNodeRef}
      className={`operation-quadrant ${quadrant ? `quadrant-${quadrant}` : "operation-unclassified"} ${isOver ? "is-drop-target" : ""}`}
      aria-labelledby={id}
      data-quadrant={quadrant || "unclassified"}
    >
      <header className="operation-quadrant-header">
        <div>
          <h2 id={id}>
            {name} <span className="operation-quadrant-count">{items.length}</span>
          </h2>
          {quadrant && <p>{t.operations.quadrantHints[quadrant]}</p>}
        </div>
        <button
          className="quiet-button operation-quadrant-add"
          aria-label={t.operations.createInQuadrant(name)}
          onClick={() => onCreate(quadrant)}
        >
          +
        </button>
      </header>
      <div className="operation-quadrant-cards">
        {items.map(renderCard)}
        {!items.length && (
          <p className="operation-quadrant-empty">
            {active ? t.operations.dropHere : t.operations.emptyQuadrant}
          </p>
        )}
      </div>
    </section>
  );
}

export function OperationsMatrix({
  operations,
  writable,
  onMove,
  onCreate,
  renderCard,
}: {
  operations: RecordItem[];
  writable: boolean;
  onMove: (id: string, quadrant: Quadrant, keyboard: boolean) => void;
  onCreate: (quadrant: Quadrant) => void;
  renderCard: (item: RecordItem) => ReactNode;
}) {
  const t = useT();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 7 } }),
    useSensor(KeyboardSensor, { coordinateGetter: quadrantCoordinates, scrollBehavior: "auto" }),
  );
  const activeOperations = operations.filter((item) => !operationFinished(item));
  const finished = operations.filter(operationFinished);
  const dragging = operations.find((item) => item.id === draggingId);
  const name = (quadrant: unknown) => {
    const key = operationQuadrant(quadrant);
    return key ? t.operations.quadrants[key] : t.operations.unclassified;
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={(args) =>
        args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args)
      }
      accessibility={{
        screenReaderInstructions: { draggable: t.operations.dragInstructions },
        announcements: {
          onDragStart: ({ active }) =>
            t.operations.pickedUp(
              operations.find((item) => item.id === active.id)?.title || String(active.id),
            ),
          onDragOver: ({ over }) =>
            over ? t.operations.dropTarget(name(over.data.current?.quadrant)) : undefined,
          // A drop back into the card's own region writes nothing.
          onDragEnd: ({ active, over }) => {
            if (!over) return t.operations.cancelled;
            const to = operationQuadrant(over.data.current?.quadrant);
            return to === operationQuadrant(active.data.current?.quadrant)
              ? t.operations.unchanged(name(to))
              : t.operations.savingClassification;
          },
          onDragCancel: () => t.operations.cancelled,
        },
      }}
      onDragStart={({ active }) => setDraggingId(String(active.id))}
      onDragCancel={() => setDraggingId(null)}
      onDragEnd={({ active, over, activatorEvent }) => {
        setDraggingId(null);
        if (over && writable)
          onMove(
            String(active.id),
            operationQuadrant(over.data.current?.quadrant),
            activatorEvent instanceof KeyboardEvent,
          );
      }}
    >
      <div className="operations-matrix" aria-label={t.operations.matrixView}>
        {OPERATION_QUADRANTS.map((quadrant) => (
          <QuadrantRegion
            key={quadrant}
            quadrant={quadrant}
            items={activeOperations.filter(
              (item) => operationQuadrant(item.eisenhowerQuadrant) === quadrant,
            )}
            writable={writable}
            onCreate={onCreate}
            renderCard={renderCard}
          />
        ))}
      </div>
      <QuadrantRegion
        quadrant=""
        items={activeOperations.filter((item) => !operationQuadrant(item.eisenhowerQuadrant))}
        writable={writable}
        onCreate={onCreate}
        renderCard={renderCard}
      />
      {finished.length > 0 && (
        <details className="operations-finished">
          <summary>
            {t.operations.closedOperations} · {finished.length}
          </summary>
          <div className="operation-quadrant-cards">{finished.map(renderCard)}</div>
        </details>
      )}
      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <div className="operation-drag-preview" aria-hidden="true">
            <strong>{dragging.title || dragging.id}</strong>
            <span>{t.operations.dropHere}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
