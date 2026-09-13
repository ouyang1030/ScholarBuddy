"use client";

import { useEffect, useMemo, useState } from "react";
import { localDateKey } from "../../lib/format";

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

const TASKS_KEY = "workbuddy-daily-tasks-en-v3";
const standardFocusLengths = new Set([25, 50]);

function focusLengthLabel(minutes?: number | null) {
  return minutes ? `${minutes} min` : "No time limit";
}

function compactTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function TaskPanel() {
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
    window.addEventListener("workbuddy-tasks-changed", load);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("workbuddy-tasks-changed", load);
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
    window.addEventListener("workbuddy-focus-state", updateFocus);
    window.addEventListener("workbuddy-focus-completed", completed);
    window.dispatchEvent(new Event("workbuddy-request-focus-state"));
    return () => {
      window.removeEventListener("workbuddy-focus-state", updateFocus);
      window.removeEventListener("workbuddy-focus-completed", completed);
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
          id: Date.now(),
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
      new CustomEvent("workbuddy-start-focus", {
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
          aria-label={task.done ? `Mark ${task.title} incomplete` : `Mark ${task.title} complete`}
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
            <span className="task-title">{task.title || "Untitled output"}</span>
          )}
          <small className="task-row-meta">
            {isPrimary && <b>PRIMARY</b>}
            {!task.done && <span>{focusLengthLabel(task.focusMinutes)}</span>}
          </small>
        </div>
        {isDeletePending ? (
          <span className="task-delete-confirm" role="group" aria-label={`Delete ${task.title}?`}>
            <button onClick={() => setConfirmDeleteId(null)}>Cancel</button>
            <button
              className="danger"
              onClick={() => {
                setTasks((items) => items.filter((item) => item.id !== task.id));
                setConfirmDeleteId(null);
              }}
            >
              Delete
            </button>
          </span>
        ) : (
          <span className="task-actions">
            {!task.done && !isPrimary && (
              <button
                aria-label={`Set ${task.title} as primary`}
                title="Set as Primary"
                onClick={() => setPrimary(task.id)}
              >
                ◎
              </button>
            )}
            <button
              aria-label={`Edit ${task.title}`}
              title="Edit task"
              onClick={() => setEditingTaskId(task.id)}
            >
              ✎
            </button>
            <button
              aria-label={`Delete ${task.title}`}
              title="Delete task"
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
          <span className="label">PRIMARY FOCUS</span>
          <p>Your next concrete research move</p>
        </div>
        <span className="completion-count">
          <b>{completedTasks.length}</b> / {visibleTasks.length}
        </span>
      </div>
      {primary ? (
        <section className={`primary-task ${primaryIsRunning ? "running" : ""}`}>
          <div className="primary-task-topline">
            <span>{primaryIsRunning ? "FOCUS IN PROGRESS" : "NEXT OUTPUT"}</span>
          </div>
          <h2>{primary.title}</h2>
          <p>
            {primaryIsRunning
              ? `${focusLengthLabel(focusState?.plannedMinutes)} · focus time is being recorded.`
              : "Finish one visible research output, then record what changed before moving on."}
          </p>
          <div className="primary-task-actions">
            {primaryReachedGoal ? (
              <button className="focus-start-button" onClick={() => toggleTask(primary.id)}>
                Mark output complete <b>✓</b>
              </button>
            ) : primaryIsRunning ? (
              <button className="focus-start-button" onClick={viewFocus}>
                View focus · {compactTimer(focusState?.seconds || 0)} <b>→</b>
              </button>
            ) : (
              <button className="focus-start-button" onClick={() => startFocus(primary)}>
                Start focused work <b>▶</b>
              </button>
            )}
            <label className="focus-length-control">
              <select
                aria-label="Focus session length"
                value={focusLengthValue}
                disabled={primaryIsRunning}
                onChange={(event) => {
                  const value = event.target.value;
                  updateTask(primary.id, {
                    focusMinutes: value === "none" ? null : value === "custom" ? 90 : Number(value),
                  });
                }}
              >
                <option value="none">No limit</option>
                <option value="25">25 min</option>
                <option value="50">50 min</option>
                <option value="custom">Custom</option>
              </select>
              {focusLengthValue === "custom" && (
                <span className="custom-focus-length">
                  <input
                    aria-label="Custom focus minutes"
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
                  min
                </span>
              )}
            </label>
          </div>
        </section>
      ) : (
        <section className="primary-task empty">
          <span>START HERE</span>
          <h2>Define one result worth finishing today.</h2>
          <p>
            Keep it concrete: a revised paragraph, an analysed model, a figure, or a reviewed paper.
          </p>
        </section>
      )}
      <div className="task-capture">
        <input
          aria-label="Add the next concrete output"
          value={newTask}
          onChange={(event) => setNewTask(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && add()}
          placeholder="Add the next concrete output…"
        />
        <button aria-label="Add output" disabled={!newTask.trim()} onClick={add}>
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
            <span>Completed ({completedTasks.length})</span>
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
