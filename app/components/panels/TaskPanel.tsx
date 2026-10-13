"use client";

import { useEffect, useMemo, useState } from "react";
import { useT, type Messages } from "../../i18n";
import { localDateKey } from "../../lib/format";
import { nextTaskId } from "../../lib/workbench";

type DailyTask = {
  id: number;
  title: string;
  done: boolean;
  date: string;
  primary?: boolean;
  focusMinutes?: number | null;
};

type FocusState = {
  running: boolean;
  seconds: number;
  target: string;
  taskId: number | null;
  plannedMinutes: number | null;
};

const TASKS_KEY = "scholarbuddy-daily-tasks-en-v3";
const standardFocusLengths = new Set([25, 50]);

function focusLengthLabel(t: Messages, minutes?: number | null) {
  return minutes ? t.tasks.minutes(minutes) : t.tasks.noLimit;
}

function compactTimer(value: number) {
  const seconds = Math.floor(value);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function TaskPanel() {
  const t = useT();
  const today = localDateKey(new Date());
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [newTask, setNewTask] = useState("");
  const [ready, setReady] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [completedFocusTaskId, setCompletedFocusTaskId] = useState<number | null>(null);
  const [focusState, setFocusState] = useState<FocusState | null>(null);

  useEffect(() => {
    const load = () => {
      try {
        const stored = JSON.parse(window.localStorage.getItem(TASKS_KEY) || "[]");
        setTasks(
          stored.map((task: Omit<DailyTask, "date"> & { date?: string }) => ({
            ...task,
            date: task.date || today,
            focusMinutes:
              typeof task.focusMinutes === "number" && task.focusMinutes > 0
                ? Math.round(task.focusMinutes)
                : null,
          })),
        );
      } catch {
        /* empty */
      }
      setReady(true);
    };
    const timer = window.setTimeout(load, 0);
    // An AI workflow can append a task straight to storage; re-read it, or the
    // next save from this panel would write the list back without it.
    window.addEventListener("scholarbuddy-tasks-changed", load);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scholarbuddy-tasks-changed", load);
    };
  }, [today]);

  useEffect(() => {
    if (ready) window.localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  }, [ready, tasks]);

  useEffect(() => {
    const updateFocus = (event: Event) => {
      const detail = (event as CustomEvent<FocusState>).detail;
      if (detail) setFocusState(detail);
    };
    const completed = (event: Event) => {
      const detail = (event as CustomEvent<{ taskId?: number | null }>).detail;
      if (detail?.taskId) setCompletedFocusTaskId(detail.taskId);
    };
    window.addEventListener("scholarbuddy-focus-state", updateFocus);
    window.addEventListener("scholarbuddy-focus-completed", completed);
    window.dispatchEvent(new Event("scholarbuddy-request-focus-state"));
    return () => {
      window.removeEventListener("scholarbuddy-focus-state", updateFocus);
      window.removeEventListener("scholarbuddy-focus-completed", completed);
    };
  }, []);

  const visibleTasks = useMemo(() => tasks.filter((task) => task.date === today), [tasks, today]);
  const incompleteTasks = visibleTasks.filter((task) => !task.done);
  const completedTasks = visibleTasks.filter((task) => task.done);
  const primary = incompleteTasks.find((task) => task.primary) || incompleteTasks[0];

  const updateTask = (id: number, changes: Partial<DailyTask>) => {
    setTasks((items) => items.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  };

  const setPrimary = (id: number) => {
    setTasks((items) =>
      items.map((item) =>
        item.date === today ? { ...item, primary: item.id === id && !item.done } : item,
      ),
    );
  };

  const toggleTask = (id: number) => {
    const update = () =>
      setTasks((items) => {
        const toggled = items.find((item) => item.id === id);
        const next = items.map((item) =>
          item.id === id ? { ...item, done: !item.done, primary: item.done && item.primary } : item,
        );
        if (toggled?.primary && !toggled.done) {
          const nextPrimary = next.find((item) => item.date === today && !item.done);
          return next.map((item) =>
            item.date === today ? { ...item, primary: item.id === nextPrimary?.id } : item,
          );
        }
        return next;
      });
    if (document.startViewTransition) document.startViewTransition(update);
    else update();
    setCompletedFocusTaskId((current) => (current === id ? null : current));
  };

  const add = () => {
    const title = newTask.trim();
    if (!title) return;
    setTasks((items) => {
      const hasOpenTask = items.some((item) => item.date === today && !item.done);
      return [
        ...items,
        {
          id: nextTaskId(items),
          title,
          done: false,
          date: today,
          primary: !hasOpenTask,
          focusMinutes: null,
        },
      ];
    });
    setNewTask("");
  };

  const startFocus = (task: DailyTask) => {
    const accepted = window.dispatchEvent(
      new CustomEvent("scholarbuddy-start-focus", {
        cancelable: true,
        detail: {
          target: task.title,
          taskId: task.id,
          plannedMinutes: task.focusMinutes || null,
        },
      }),
    );
    if (!accepted) return;
    window.setTimeout(
      () =>
        document
          .querySelector(".focus-session")
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      0,
    );
  };

  const viewFocus = () =>
    document
      .querySelector(".focus-session")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });

  const renderTask = (task: DailyTask) => {
    const isPrimary = primary?.id === task.id;
    const isDeletePending = confirmDeleteId === task.id;
    return (
      <div
        className={`${task.done ? "done" : ""} ${isPrimary ? "is-primary" : ""}`}
        key={task.id}
        style={{ viewTransitionName: `daily-task-${task.id}` }}
      >
        <button
          className="task-check"
          aria-label={task.done ? t.tasks.markOpen(task.title) : t.tasks.markDone(task.title)}
          onClick={() => toggleTask(task.id)}
        >
          {task.done ? "✓" : ""}
        </button>
        <div className="task-row-main">
          {editingTaskId === task.id ? (
            <input
              autoFocus
              className="task-inline-input"
              value={task.title}
              onBlur={() => setEditingTaskId(null)}
              onChange={(event) => updateTask(task.id, { title: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === "Escape") setEditingTaskId(null);
              }}
            />
          ) : (
            <span className="task-title">{task.title || t.tasks.untitled}</span>
          )}
          <small className="task-row-meta">
            {isPrimary && <b>{t.tasks.primary}</b>}
            {!task.done && <span>{focusLengthLabel(t, task.focusMinutes)}</span>}
          </small>
        </div>
        {isDeletePending ? (
          <span
            className="task-delete-confirm"
            role="group"
            aria-label={t.tasks.deleteQuestion(task.title)}
          >
            <button onClick={() => setConfirmDeleteId(null)}>{t.common.cancel}</button>
            <button
              className="danger"
              onClick={() => {
                setTasks((items) => items.filter((item) => item.id !== task.id));
                setConfirmDeleteId(null);
              }}
            >
              {t.common.delete}
            </button>
          </span>
        ) : (
          <span className="task-actions">
            {!task.done && !isPrimary && (
              <button
                aria-label={t.tasks.setPrimaryFor(task.title)}
                title={t.tasks.setPrimary}
                onClick={() => setPrimary(task.id)}
              >
                ◎
              </button>
            )}
            <button
              aria-label={t.tasks.editFor(task.title)}
              title={t.tasks.edit}
              onClick={() => setEditingTaskId(task.id)}
            >
              ✎
            </button>
            <button
              aria-label={t.tasks.deleteFor(task.title)}
              title={t.tasks.delete}
              onClick={() => setConfirmDeleteId(task.id)}
            >
              ×
            </button>
          </span>
        )}
      </div>
    );
  };

  const primaryIsRunning = Boolean(
    primary && focusState?.running && focusState.taskId === primary.id,
  );
  const primaryReachedGoal = Boolean(
    primary &&
    (primary.id === completedFocusTaskId ||
      (focusState?.taskId === primary.id &&
        !focusState.running &&
        focusState.plannedMinutes &&
        focusState.seconds >= focusState.plannedMinutes * 60)),
  );
  const selectedLength = primary?.focusMinutes;
  const focusLengthValue = !selectedLength
    ? "none"
    : standardFocusLengths.has(selectedLength)
      ? String(selectedLength)
      : "custom";

  return (
    <article className="today-tasks card real-panel">
      <div className="section-heading">
        <div>
          <span className="label">{t.tasks.label}</span>
        </div>
        <span className="completion-count">
          <b>{completedTasks.length}</b> / {visibleTasks.length}
        </span>
      </div>
      {primary ? (
        <section className={`primary-task ${primaryIsRunning ? "running" : ""}`}>
          <div className="primary-task-topline">
            <span>{primaryIsRunning ? t.tasks.running : t.tasks.next}</span>
          </div>
          <h2>{primary.title}</h2>
          {primaryIsRunning && (
            <p>{t.tasks.recording(focusLengthLabel(t, focusState?.plannedMinutes))}</p>
          )}
          <div className="primary-task-actions">
            {primaryReachedGoal ? (
              <button className="focus-start-button" onClick={() => toggleTask(primary.id)}>
                {t.tasks.complete} <b>✓</b>
              </button>
            ) : primaryIsRunning ? (
              <button className="focus-start-button" onClick={viewFocus}>
                {t.tasks.viewFocus(compactTimer(focusState?.seconds || 0))} <b>→</b>
              </button>
            ) : (
              <button className="focus-start-button" onClick={() => startFocus(primary)}>
                {t.tasks.start} <b>▶</b>
              </button>
            )}
            <label className="focus-length-control">
              <select
                aria-label={t.tasks.length}
                value={focusLengthValue}
                disabled={primaryIsRunning}
                onChange={(event) => {
                  const value = event.target.value;
                  updateTask(primary.id, {
                    focusMinutes: value === "none" ? null : value === "custom" ? 90 : Number(value),
                  });
                }}
              >
                <option value="none">{t.tasks.noLimit}</option>
                <option value="25">{t.tasks.minutes(25)}</option>
                <option value="50">{t.tasks.minutes(50)}</option>
                <option value="custom">{t.tasks.custom}</option>
              </select>
              {focusLengthValue === "custom" && (
                <span className="custom-focus-length">
                  <input
                    aria-label={t.tasks.customMinutes}
                    type="number"
                    min="1"
                    max="480"
                    value={selectedLength || 90}
                    disabled={primaryIsRunning}
                    onChange={(event) =>
                      updateTask(primary.id, {
                        focusMinutes: Math.max(1, Math.min(480, Number(event.target.value) || 1)),
                      })
                    }
                  />
                  {t.tasks.minuteUnit}
                </span>
              )}
            </label>
          </div>
        </section>
      ) : (
        <section className="primary-task empty">
          <span>{t.tasks.startHere}</span>
          <h2>{t.tasks.empty}</h2>
        </section>
      )}
      <div className="task-capture">
        <input
          aria-label={t.tasks.add}
          value={newTask}
          onChange={(event) => setNewTask(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && add()}
          placeholder={t.tasks.add}
        />
        <button aria-label={t.tasks.addButton} disabled={!newTask.trim()} onClick={add}>
          +
        </button>
      </div>
      <div className="daily-task-list">{incompleteTasks.map(renderTask)}</div>
      {completedTasks.length > 0 && (
        <div className="completed-task-section">
          <button
            className="completed-task-toggle"
            aria-expanded={showCompleted}
            onClick={() => setShowCompleted((shown) => !shown)}
          >
            <span>{t.tasks.completed(completedTasks.length)}</span>
            <b>{showCompleted ? "−" : "+"}</b>
          </button>
          {showCompleted && (
            <div className="daily-task-list completed-list">{completedTasks.map(renderTask)}</div>
          )}
        </div>
      )}
    </article>
  );
}
