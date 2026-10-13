"use client";

import { useEffect, useState } from "react";
import { bridgeFetch } from "../../lib/bridge-client";
import { focusCalendar, onFocusCalendarChange, setFocusCalendar } from "../../lib/focus-store";
import { calendarDisplayName, localDateKey } from "../../lib/format";

/**
 * Finished focus sessions can be written to macOS Calendar as events. Which
 * calendar is the researcher's call and nothing is written until they make it,
 * so the choice sits here with the other per-Mac connections.
 */
export function FocusCalendarSetting({ paired }: { paired: boolean }) {
  const [calendar, setCalendar] = useState("");
  const [calendars, setCalendars] = useState<string[]>([]);
  useEffect(() => {
    const timer = window.setTimeout(() => setCalendar(focusCalendar()), 0);
    const stop = onFocusCalendarChange(() => setCalendar(focusCalendar()));
    return () => {
      window.clearTimeout(timer);
      stop();
    };
  }, []);
  useEffect(() => {
    if (!paired) return;
    let cancelled = false;
    void bridgeFetch(`/calendar/today?date=${localDateKey(new Date())}`)
      .then(async (response) => (response.ok ? (await response.json()).calendars : []))
      .then((names) => {
        if (!cancelled && Array.isArray(names)) setCalendars(names);
      })
      .catch(() => {
        /* Calendar is unavailable: the saved choice below still shows. */
      });
    return () => {
      cancelled = true;
    };
  }, [paired]);
  // A calendar renamed or removed since it was chosen still has to be shown, or
  // the select would read "Off" while sessions kept failing to save.
  const choices = calendar && !calendars.includes(calendar) ? [calendar, ...calendars] : calendars;
  return (
    <section className="reminder-settings" aria-labelledby="focus-calendar-title">
      <div className="drawer-section-title">
        <strong id="focus-calendar-title">Focus sessions</strong>
      </div>
      <label className="setting-row">
        <span className="setting-row-copy">
          <strong>Save sessions to Calendar</strong>
          <small>
            Each finished session becomes an event in the calendar you choose. Off until you pick
            one; your focus history in Profile is kept either way.
          </small>
        </span>
        <select
          value={calendar}
          onChange={(event) => {
            setCalendar(event.target.value);
            setFocusCalendar(event.target.value);
          }}
        >
          <option value="">Off</option>
          {choices.map((name) => (
            <option key={name} value={name}>
              {calendarDisplayName(name)}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
