"use client";

import { useEffect, useRef, useState } from "react";
import { bridgeFailure, failureText, useLocale, useT } from "../../i18n";
import { bridgeFetch } from "../../lib/bridge-client";
import { calendarDisplayName, durationMinutes, localDateKey, timeLabel } from "../../lib/format";
import type { CalendarEvent } from "../../types";
import { EmptyState } from "../primitives";

export function CalendarPanel() {
  const t = useT();
  const { locale } = useLocale();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [calendars, setCalendars] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [now, setNow] = useState(() => new Date());
  const [edit, setEdit] = useState<CalendarEvent | "new" | null>(null);
  const [draft, setDraft] = useState({ title: "", time: "09:00", minutes: "60", calendar: "" });
  const [deleteId, setDeleteId] = useState("");
  const failuresRef = useRef(0);
  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await bridgeFetch(`/calendar/today?date=${localDateKey(new Date())}`, {
        signal: AbortSignal.timeout(20000),
      });
      const body = await response.json();
      if (!response.ok) throw bridgeFailure(body, "");
      setEvents(body.events || []);
      setCalendars(body.calendars || []);
      failuresRef.current = 0;
    } catch (e) {
      failuresRef.current += 1;
      setError(e);
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
    window.addEventListener("scholarbuddy-calendar-refresh", sync);
    return () => window.removeEventListener("scholarbuddy-calendar-refresh", sync);
  }, []);
  const openEditor = (event?: CalendarEvent) => {
    setEdit(event || "new");
    setDraft(
      event
        ? {
            title: event.title,
            time: timeLabel(event.start, locale),
            minutes: String(durationMinutes(event.start, event.end)),
            calendar: event.calendar,
          }
        : {
            title: "",
            time: timeLabel(new Date().toISOString(), locale),
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
      if (!response.ok) throw bridgeFailure(body, "");
      setEdit(null);
      await refresh();
    } catch (e) {
      setError(e);
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
      if (!response.ok) throw bridgeFailure(body, "");
      setDeleteId("");
      await refresh();
    } catch (e) {
      setError(e);
      setLoading(false);
    }
  };
  return (
    <article className="today-schedule card real-panel">
      <div className="section-heading">
        <div>
          <span className="label">{t.calendar.label}</span>
        </div>
        <button className="mini-add" onClick={() => openEditor()}>
          {t.calendar.add}
        </button>
      </div>
      {edit && (
        <section
          className="time-editor"
          aria-label={typeof edit === "object" ? t.calendar.editTitle : t.calendar.newTitle}
        >
          <header>
            <span>
              <strong>
                {typeof edit === "object" ? t.calendar.editTitle : t.calendar.newTitle}
              </strong>
            </span>
            <button aria-label={t.calendar.closeEditor} onClick={() => setEdit(null)}>
              ×
            </button>
          </header>
          <label className="time-title">
            <span>{t.calendar.name}</span>
            <input
              autoFocus
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <div className="time-editor-fields">
            <label>
              <span>{t.calendar.starts}</span>
              <input
                type="time"
                value={draft.time}
                onChange={(e) => setDraft({ ...draft, time: e.target.value })}
              />
            </label>
            <label>
              <span>{t.calendar.duration}</span>
              <span className="duration-input">
                <input
                  inputMode="numeric"
                  value={draft.minutes}
                  onChange={(e) =>
                    setDraft({ ...draft, minutes: e.target.value.replace(/\D/g, "") })
                  }
                />
                <b>{t.tasks.minuteUnit}</b>
              </span>
            </label>
            <label>
              <span>{t.calendar.calendar}</span>
              <select
                disabled={typeof edit === "object"}
                value={draft.calendar}
                onChange={(e) => setDraft({ ...draft, calendar: e.target.value })}
              >
                {calendars.map((name) => (
                  <option key={name} value={name}>
                    {calendarDisplayName(name, locale)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <footer>
            <span />
            <div>
              <button onClick={() => setEdit(null)}>{t.common.cancel}</button>
              <button className="save-edit" disabled={!draft.title.trim()} onClick={save}>
                {typeof edit === "object" ? t.calendar.saveChanges : t.calendar.addEvent}
              </button>
            </div>
          </footer>
        </section>
      )}
      {Boolean(error) && (
        <div className="calendar-error">
          <span>!</span>
          <p>{failureText(t, error, t.calendar.loadFailed)}</p>
          <button onClick={refresh}>{t.common.retry}</button>
        </div>
      )}
      <div className="schedule-list">
        {loading && !events.length ? (
          <div className="schedule-loading">
            <span />
            {t.calendar.loading}
          </div>
        ) : !events.length && !error ? (
          <EmptyState title={t.calendar.empty} />
        ) : (
          events.map((event, index) => {
            const active =
              !event.allDay && now >= new Date(event.start) && now < new Date(event.end);
            return (
              <div
                className={`${active ? "now" : ""} ${deleteId === event.id ? "confirming-delete" : ""}`}
                key={event.id}
              >
                <time>{event.allDay ? t.calendar.allDay : timeLabel(event.start, locale)}</time>
                <i
                  className={["mint", "blue", "violet", "neutral"][index % 4]}
                  style={event.color ? { background: event.color } : undefined}
                />
                <span>
                  <strong>{event.title}</strong>
                  <small>{calendarDisplayName(event.calendar, locale)}</small>
                </span>
                {deleteId === event.id ? (
                  <span
                    className="schedule-confirm"
                    aria-label={t.calendar.confirmDelete(event.title)}
                  >
                    <button onClick={() => setDeleteId("")}>{t.common.keep}</button>
                    <button className="danger" disabled={loading} onClick={() => remove(event.id)}>
                      {t.common.delete}
                    </button>
                  </span>
                ) : (
                  <span className="schedule-actions">
                    {active && <b>{t.calendar.now}</b>}
                    <button
                      aria-label={t.calendar.editFor(event.title)}
                      title={t.calendar.edit}
                      onClick={() => openEditor(event)}
                    >
                      <span aria-hidden="true">✎</span>
                    </button>
                    <button
                      aria-label={t.calendar.deleteFor(event.title)}
                      title={t.calendar.delete}
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
      <button
        className="wide-button icon-only"
        disabled={loading}
        aria-label={loading ? t.calendar.syncing : t.calendar.refresh}
        title={t.calendar.refresh}
        onClick={refresh}
      >
        <span className={loading ? "spinning" : ""} aria-hidden="true">
          ↻
        </span>
      </button>
    </article>
  );
}
