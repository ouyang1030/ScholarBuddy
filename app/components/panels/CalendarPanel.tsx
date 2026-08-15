"use client";

import { useEffect, useRef, useState } from "react";
import { bridgeFetch } from "../../lib/bridge-client";
import { calendarDisplayName, durationMinutes, localDateKey, timeLabel } from "../../lib/format";
import type { CalendarEvent } from "../../types";
import { EmptyState } from "../primitives";

export function CalendarPanel() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [calendars, setCalendars] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [edit, setEdit] = useState<CalendarEvent | "new" | null>(null);
  const [draft, setDraft] = useState({ title: "", time: "09:00", minutes: "60", calendar: "" });
  const [deleteId, setDeleteId] = useState("");
  const failuresRef = useRef(0);
  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await bridgeFetch(`/calendar/today?date=${localDateKey(new Date())}`, {
        signal: AbortSignal.timeout(20000),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Calendar could not be loaded.");
      setEvents(body.events || []);
      setCalendars(body.calendars || []);
      failuresRef.current = 0;
    } catch (e) {
      failuresRef.current += 1;
      setError(e instanceof Error ? e.message : "Calendar could not be loaded.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    const start = window.setTimeout(() => void refresh(), 0);
    let ticks = 0;
    const timer = window.setInterval(() => {
      if (failuresRef.current && ticks++ % 5 !== 0) return;
      void refresh();
    }, 60000);
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(timer);
      window.clearInterval(clock);
    };
  }, []);
  useEffect(() => {
    const sync = () => void refresh();
    window.addEventListener("workbuddy-calendar-refresh", sync);
    return () => window.removeEventListener("workbuddy-calendar-refresh", sync);
  }, []);
  const openEditor = (event?: CalendarEvent) => {
    setEdit(event || "new");
    setDraft(
      event
        ? {
            title: event.title,
            time: timeLabel(event.start),
            minutes: String(durationMinutes(event.start, event.end)),
            calendar: event.calendar,
          }
        : {
            title: "",
            time: timeLabel(new Date().toISOString()),
            minutes: "60",
            calendar: calendars[0] || "",
          },
    );
  };
  const save = async () => {
    if (!draft.title.trim()) return;
    setLoading(true);
    try {
      const start = new Date(`${localDateKey(now)}T${draft.time}:00`);
      const minutes = Math.max(1, Number(draft.minutes) || 60);
      const existing = edit && typeof edit === "object" ? edit : null;
      const response = await bridgeFetch(`/calendar/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: existing?.id,
          title: draft.title.trim(),
          start: start.toISOString(),
          end: new Date(start.getTime() + minutes * 60000).toISOString(),
          calendar: existing ? undefined : draft.calendar,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setEdit(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Calendar event could not be saved.");
      setLoading(false);
    }
  };
  const remove = async (id: string) => {
    setLoading(true);
    try {
      const response = await bridgeFetch(`/calendar/event`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setDeleteId("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Calendar event could not be deleted.");
      setLoading(false);
    }
  };
  return (
    <article className="today-schedule card real-panel">
      <div className="section-heading">
        <div>
          <span className="label">MACOS CALENDAR / LIVE</span>
          <p>Today’s schedule</p>
        </div>
        <button className="mini-add" onClick={() => openEditor()}>
          ＋ Event
        </button>
      </div>
      {edit && (
        <section
          className="time-editor"
          aria-label={typeof edit === "object" ? "Edit calendar event" : "New calendar event"}
        >
          <header>
            <span>
              <small>{typeof edit === "object" ? "EDIT EVENT" : "NEW EVENT"}</small>
              <strong>
                {typeof edit === "object" ? "Update this calendar block" : "Add time to today"}
              </strong>
            </span>
            <button aria-label="Close calendar editor" onClick={() => setEdit(null)}>
              ×
            </button>
          </header>
          <label className="time-title">
            <span>Event name</span>
            <input
              autoFocus
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="What is this time for?"
            />
          </label>
          <div className="time-editor-fields">
            <label>
              <span>Starts</span>
              <input
                type="time"
                value={draft.time}
                onChange={(e) => setDraft({ ...draft, time: e.target.value })}
              />
            </label>
            <label>
              <span>Duration</span>
              <span className="duration-input">
                <input
                  inputMode="numeric"
                  value={draft.minutes}
                  onChange={(e) =>
                    setDraft({ ...draft, minutes: e.target.value.replace(/\D/g, "") })
                  }
                />
                <b>min</b>
              </span>
            </label>
            <label>
              <span>Calendar</span>
              <select
                disabled={typeof edit === "object"}
                value={draft.calendar}
                onChange={(e) => setDraft({ ...draft, calendar: e.target.value })}
              >
                {calendars.map((name) => (
                  <option key={name} value={name}>
                    {calendarDisplayName(name)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <footer>
            <span>
              {typeof edit === "object"
                ? `Saved in ${calendarDisplayName(draft.calendar)}`
                : "Saved directly to macOS Calendar"}
            </span>
            <div>
              <button onClick={() => setEdit(null)}>Cancel</button>
              <button className="save-edit" disabled={!draft.title.trim()} onClick={save}>
                {typeof edit === "object" ? "Save changes" : "Add event"}
              </button>
            </div>
          </footer>
        </section>
      )}
      {error && (
        <div className="calendar-error">
          <span>!</span>
          <p>{error}</p>
          <button onClick={refresh}>Retry</button>
        </div>
      )}
      <div className="schedule-list">
        {loading && !events.length ? (
          <div className="schedule-loading">
            <span />
            Reading Calendar…
          </div>
        ) : !events.length && !error ? (
          <EmptyState title="No events today" detail="Add an event here or in macOS Calendar." />
        ) : (
          events.map((event, index) => {
            const active =
              !event.allDay && now >= new Date(event.start) && now < new Date(event.end);
            return (
              <div
                className={`${active ? "now" : ""} ${deleteId === event.id ? "confirming-delete" : ""}`}
                key={event.id}
              >
                <time>{event.allDay ? "ALL DAY" : timeLabel(event.start)}</time>
                <i
                  className={["mint", "blue", "violet", "neutral"][index % 4]}
                  style={event.color ? { background: event.color } : undefined}
                />
                <span>
                  <strong>{event.title}</strong>
                  <small>{calendarDisplayName(event.calendar)}</small>
                </span>
                {deleteId === event.id ? (
                  <span
                    className="schedule-confirm"
                    aria-label={`Confirm deletion of ${event.title}`}
                  >
                    <button onClick={() => setDeleteId("")}>Keep</button>
                    <button className="danger" disabled={loading} onClick={() => remove(event.id)}>
                      Delete
                    </button>
                  </span>
                ) : (
                  <span className="schedule-actions">
                    {active && <b>NOW</b>}
                    <button
                      aria-label={`Edit ${event.title}`}
                      title="Edit event"
                      onClick={() => openEditor(event)}
                    >
                      <span aria-hidden="true">✎</span>
                    </button>
                    <button
                      aria-label={`Delete ${event.title}`}
                      title="Delete event"
                      onClick={() => setDeleteId(event.id)}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
      <button className="wide-button" disabled={loading} onClick={refresh}>
        {loading ? "Syncing…" : "Refresh Calendar"}
        <span>↻</span>
      </button>
    </article>
  );
}
