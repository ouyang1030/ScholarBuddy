"use client";

import { useEffect, useState } from "react";
import { localDateKey } from "../../lib/format";

export function TaskPanel() {
  const today = localDateKey(new Date());
  const [tasks, setTasks] = useState<{ id: number; title: string; done: boolean; date: string }[]>(
    [],
  );
  const [newTask, setNewTask] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const load = () => {
      try {
        const stored = JSON.parse(
          window.localStorage.getItem("workbuddy-daily-tasks-en-v3") || "[]",
        );
        setTasks(
          stored.map((task: { id: number; title: string; done: boolean; date?: string }) => ({
            ...task,
            date: task.date || today,
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
    if (ready) window.localStorage.setItem("workbuddy-daily-tasks-en-v3", JSON.stringify(tasks));
  }, [ready, tasks]);
  const visibleTasks = tasks.filter((task) => task.date === today);
  const add = () => {
    if (newTask.trim()) {
      setTasks((items) => [
        ...items,
        { id: Date.now(), title: newTask.trim(), done: false, date: today },
      ]);
      setNewTask("");
    }
  };
  const primary = visibleTasks.find((task) => !task.done);
  return (
    <article className="today-tasks card real-panel">
      <div className="section-heading">
        <div>
          <span className="label">PRIMARY FOCUS</span>
          <p>Your next concrete research move</p>
        </div>
        <span className="completion-count">
          <b>{visibleTasks.filter((task) => task.done).length}</b> / {visibleTasks.length}
        </span>
      </div>
      {primary ? (
        <section className="primary-task">
          <span>NEXT OUTPUT · 50 MIN</span>
          <h2>{primary.title}</h2>
          <p>Finish one visible research output, then record what changed before moving on.</p>
          <button
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("workbuddy-start-focus", { detail: { target: primary.title } }),
              )
            }
          >
            Start focused work <b>▶</b>
          </button>
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
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add the next concrete output…"
        />
        <button onClick={add}>+</button>
      </div>
      <div className="daily-task-list">
        {visibleTasks.map((task) => (
          <div className={task.done ? "done" : ""} key={task.id}>
            <button
              className="task-check"
              onClick={() =>
                setTasks((items) =>
                  items.map((item) => (item.id === task.id ? { ...item, done: !item.done } : item)),
                )
              }
            >
              {task.done ? "✓" : ""}
            </button>
            <input
              className="task-inline-input"
              value={task.title}
              onChange={(e) =>
                setTasks((items) =>
                  items.map((item) =>
                    item.id === task.id ? { ...item, title: e.target.value } : item,
                  ),
                )
              }
            />
            <span className="task-actions">
              <button
                onClick={() => setTasks((items) => items.filter((item) => item.id !== task.id))}
              >
                ×
              </button>
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}
