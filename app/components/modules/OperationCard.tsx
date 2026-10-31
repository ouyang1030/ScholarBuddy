"use client";

import { useDraggable } from "@dnd-kit/core";
import { useLocale, useT, valueLabel, type Messages } from "../../i18n";
import { clampProgress, shortDate } from "../../lib/format";
import { statusDefault } from "../../lib/workbench";
import { operationFinished, operationQuadrant } from "../../../shared/operations.mjs";
import type { RecordItem } from "../../types";
import { MetaPill } from "../primitives";

const OPEN_STATUS = statusDefault("operations");

function deadlineState(t: Messages, dueDate?: string) {
  if (!dueDate) return { label: t.operations.noDeadline, tone: "neutral" };
  const [year, month, day] = dueDate.split("-").map(Number);
  const today = new Date();
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((Date.UTC(year, month - 1, day) - start) / 86_400_000);
  if (!Number.isFinite(days)) return { label: t.operations.noDeadline, tone: "neutral" };
  if (days < 0) return { label: t.operations.overdue(Math.abs(days)), tone: "overdue" };
  if (days === 0) return { label: t.operations.dueToday, tone: "overdue" };
  if (days <= 7) return { label: t.operations.left(days), tone: "urgent" };
  if (days <= 30) return { label: t.operations.left(days), tone: "soon" };
  return { label: t.operations.left(days), tone: "neutral" };
}

export function OperationCard({
  item,
  matrix = false,
  writable = false,
  saving = false,
  timerReady,
  focusing,
  elsewhere,
  onFocus,
  onEdit,
}: {
  item: RecordItem;
  matrix?: boolean;
  writable?: boolean;
  saving?: boolean;
  timerReady: boolean;
  focusing: boolean;
  elsewhere: boolean;
  onFocus: () => void;
  onEdit: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const completed = operationFinished(item);
  const draggable = matrix && !completed && writable && !saving;
  const quadrant = operationQuadrant(item.eisenhowerQuadrant);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: item.id,
    disabled: !draggable,
    data: { quadrant },
  });
  const deadline = deadlineState(t, item.dueDate);
  const unknownQuadrant =
    item.eisenhowerQuadrant !== undefined && item.eisenhowerQuadrant !== "" && !quadrant;
  // Actions, details and text inputs keep their own gestures. The rest of the
  // card can be held and dragged; touch scrolling wins over a short swipe.
  const fromCard = (event: React.MouseEvent | React.TouchEvent) => {
    if ((event.target as HTMLElement).closest("button, a, input, select, textarea, details"))
      return;
    if (event.type === "mousedown") listeners?.onMouseDown?.(event);
    else listeners?.onTouchStart?.(event);
  };
  return (
    <article
      ref={setNodeRef}
      data-operation-id={item.id}
      aria-busy={saving || undefined}
      className={`record-card operation-card card ${matrix ? "operation-matrix-card" : ""} ${completed ? "is-completed" : ""} ${isDragging ? "is-dragging" : ""} ${draggable ? "is-draggable" : ""}`}
      onMouseDown={draggable ? fromCard : undefined}
      onTouchStart={draggable ? fromCard : undefined}
    >
      <div className="operation-main">
        <span className="object-id">
          {matrix && !completed && (
            <button
              type="button"
              className="operation-drag-handle"
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              disabled={!draggable}
              aria-label={t.operations.dragCard(item.title || item.id)}
              title={t.operations.dragInstructions}
            >
              <span aria-hidden="true">⠿</span>
            </button>
          )}
          {item.type ? valueLabel(t.values.operationType, item.type) : item.id}
        </span>
        <h2>{item.title}</h2>
        <div className="operation-status">
          <MetaPill
            tone={
              completed
                ? item.status === "Archived"
                  ? "neutral"
                  : "lime"
                : item.status === "Blocked"
                  ? "orange"
                  : item.status === "Planned"
                    ? "neutral"
                    : "blue"
            }
          >
            {valueLabel(t.values.status, item.status || OPEN_STATUS)}
          </MetaPill>
          {!completed && item.progress !== undefined && (
            <span className="record-card-progress">{clampProgress(item.progress)}%</span>
          )}
          {!matrix && quadrant && (
            <span className="operation-quadrant-label">{t.operations.quadrants[quadrant]}</span>
          )}
        </div>
        {unknownQuadrant && (
          <span className="operation-classification-warning">{t.operations.unknownQuadrant}</span>
        )}
      </div>
      <div className={`operation-deadline ${completed ? "complete" : deadline.tone}`}>
        <span>{item.dueDate ? shortDate(item.dueDate, locale) : t.operations.notScheduled}</span>
        <strong>{completed ? t.operations.completed : deadline.label}</strong>
      </div>
      <div className="record-card-footer">
        {!completed && (
          <button
            className="quiet-button"
            disabled={!timerReady}
            title={timerReady ? undefined : elsewhere ? t.focus.elsewhere : t.focus.preparing}
            onClick={onFocus}
          >
            {focusing ? t.operations.focusing : t.operations.focus}
          </button>
        )}
        <button className="quiet-button" disabled={saving} onClick={onEdit}>
          {t.operations.edit}
        </button>
      </div>
      {saving && <span className="operation-saving">{t.operations.savingClassification}</span>}
      {(item.description || item.manuscriptTitle || item.projectTitle) && (
        <details className="operation-details">
          <summary>{t.operations.details}</summary>
          {item.description && <p>{item.description}</p>}
          {item.manuscriptTitle && (
            <div className="record-meta-item">
              <span className="meta-tag">{t.operations.paper}</span>
              <strong title={item.manuscriptTitle}>{item.manuscriptTitle}</strong>
            </div>
          )}
          {item.projectTitle && (
            <div className="record-meta-item">
              <span className="meta-tag">{t.operations.project}</span>
              <strong title={item.projectTitle}>{item.projectTitle}</strong>
            </div>
          )}
        </details>
      )}
    </article>
  );
}
