"use client";

import { useEffect, useRef, useState } from "react";
import { localDateKey, shortDate } from "../../lib/format";
import type { DataProps } from "../../lib/workbench";
import type { RecordItem } from "../../types";

const DRAFT_KEY = "workbuddy-journal-draft-v1";

// The Bridge requires a title, but asking for one would turn the capture box
// into a form. The first line is the title; the whole text stays as the body.
function entryTitle(text: string, today: string) {
  const first = text.split(/\r?\n/).find((line) => line.trim());
  return first?.trim().slice(0, 90) || `Research log · ${today}`;
}

function dayLabel(day: string, today: string, yesterday: string) {
  if (!day) return "UNDATED";
  if (day === today) return "TODAY";
  if (day === yesterday) return "YESTERDAY";
  return shortDate(day).toUpperCase();
}

export function JournalPanel({
  state,
  saveRecord,
  openEditor,
  project,
  paper,
}: Pick<DataProps, "state" | "saveRecord" | "openEditor"> & {
  project?: RecordItem;
  paper?: RecordItem;
}) {
  const now = new Date();
  const today = localDateKey(now);
  // Built from the calendar day rather than a millisecond offset, so the label
  // stays right across a daylight-saving change.
  const yesterday = localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const [text, setText] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const boxRef = useRef<HTMLTextAreaElement>(null);
  // The draft survives a failed save, a refresh, and an offline Bridge: nothing
  // typed here is ever lost to a connection problem.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setText(window.localStorage.getItem(DRAFT_KEY) || "");
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (ready) window.localStorage.setItem(DRAFT_KEY, text);
  }, [ready, text]);
  useEffect(() => {
    const focus = (event: Event) => {
      if ((event as CustomEvent<{ target?: string }>).detail?.target !== "journal") return;
      boxRef.current?.focus();
    };
    window.addEventListener("workbuddy-capture-focus", focus);
    return () => window.removeEventListener("workbuddy-capture-focus", focus);
  }, []);
  const save = async () => {
    const body = text.trim();
    if (!body || saving) return;
    setSaving(true);
    setError("");
    try {
      // The project and paper links are taken from the current context instead of
      // being asked for: an entry nobody has to classify is an entry that gets written.
      await saveRecord("journal", {
        title: entryTitle(body, today),
        description: body,
        entryDate: today,
        ...(project ? { projectId: project.id, projectTitle: project.title } : {}),
        ...(paper ? { manuscriptId: paper.id, manuscriptTitle: paper.title } : {}),
      });
      setText("");
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "This entry could not be saved yet.",
      );
    } finally {
      setSaving(false);
    }
  };
  const entries = state.journal;
  const visible = [
    ...entries.filter((item) => (item.entryDate || "") === today),
    ...entries.filter((item) => (item.entryDate || "") !== today).slice(0, 5),
  ];
  const days = new Map<string, RecordItem[]>();
  for (const entry of visible) {
    const day = entry.entryDate || "";
    days.set(day, [...(days.get(day) || []), entry]);
  }
  return (
    <article className="research-log card real-panel">
      <div className="section-heading">
        <div>
          <span className="label">RESEARCH LOG / OBSIDIAN</span>
          <p>What actually changed today</p>
        </div>
        <span className="completion-count">
          <b>{days.get(today)?.length || 0}</b> today
        </span>
      </div>
      <div className="journal-capture">
        <textarea
          ref={boxRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void save();
            }
          }}
          placeholder="A result, a decision, a dead end — one entry, no fields to fill in…"
          aria-label="Research log entry"
        />
        <div className="journal-capture-actions">
          <kbd>⌘ J to capture · ⌘ ⏎ to save</kbd>
          <button className="primary-button" disabled={saving || !text.trim()} onClick={save}>
            {saving ? "Saving…" : "Save entry"}
          </button>
        </div>
      </div>
      {error && (
        <div className="capture-error">
          <span>!</span>
          <p>{error} Your text is kept here until it saves.</p>
          <button onClick={save}>Retry</button>
        </div>
      )}
      {Boolean(visible.length) &&
        [...days.entries()].map(([day, items]) => (
          <section key={day || "undated"}>
            <div className="journal-day">
              <span>{dayLabel(day, today, yesterday)}</span>
              <span>
                {items.length} entr{items.length === 1 ? "y" : "ies"}
              </span>
            </div>
            <div className="journal-entry-list">
              {items.map((item) => (
                <button key={item.id} onClick={() => openEditor("journal", item)}>
                  <strong>{item.title}</strong>
                  {item.manuscriptTitle && <small>{item.manuscriptTitle}</small>}
                </button>
              ))}
            </div>
          </section>
        ))}
    </article>
  );
}
