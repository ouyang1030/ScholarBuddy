"use client";

import { useEffect, useRef, useState } from "react";
import { failureText, useLocale, useT, type Locale, type Messages } from "../../i18n";
import { localDateKey, shortDate } from "../../lib/format";
import type { DataProps } from "../../lib/workbench";
import type { RecordItem } from "../../types";

const DRAFT_KEY = "scholarbuddy-journal-draft-v1";

// The Bridge requires a title, but asking for one would turn the capture box
// into a form. The first line is the title; the whole text stays as the body.
function entryTitle(text: string, today: string) {
  const first = text.split(/\r?\n/).find((line) => line.trim());
  return first?.trim().slice(0, 90) || `Research log · ${today}`;
}

function dayLabel(t: Messages, locale: Locale, day: string, today: string, yesterday: string) {
  if (!day) return t.log.undated;
  if (day === today) return t.log.todayLabel;
  if (day === yesterday) return t.log.yesterday;
  return shortDate(day, locale).toUpperCase();
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
  const t = useT();
  const { locale } = useLocale();
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
    window.addEventListener("scholarbuddy-capture-focus", focus);
    return () => window.removeEventListener("scholarbuddy-capture-focus", focus);
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
      setError(failureText(t, saveError, t.errors.saveFailed));
    } finally {
      setSaving(false);
    }
  };
  const visible = state.journal.filter((item) => item.entryDate === today);
  const days = new Map<string, RecordItem[]>();
  for (const entry of visible) {
    const day = entry.entryDate || "";
    days.set(day, [...(days.get(day) || []), entry]);
  }
  return (
    <article className="research-log card real-panel">
      <div className="section-heading">
        <div>
          <span className="label">{t.log.label}</span>
        </div>
        <span className="completion-count">{t.log.today(days.get(today)?.length || 0)}</span>
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
          placeholder={t.log.placeholder}
          aria-label={t.log.entry}
        />
        <div className="journal-capture-actions">
          <kbd>{t.log.shortcut}</kbd>
          <button className="primary-button" disabled={saving || !text.trim()} onClick={save}>
            {saving ? t.common.saving : t.log.save}
          </button>
        </div>
      </div>
      {error && (
        <div className="capture-error">
          <span>!</span>
          <p>{error}</p>
          <button onClick={save}>{t.common.retry}</button>
        </div>
      )}
      {Boolean(visible.length) &&
        [...days.entries()].map(([day, items]) => (
          <section key={day || "undated"}>
            <div className="journal-day">
              <span>{dayLabel(t, locale, day, today, yesterday)}</span>
              <span>{t.log.entries(items.length)}</span>
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
