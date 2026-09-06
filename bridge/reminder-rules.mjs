import { createHash } from "node:crypto";
import { CLOSED_RECORD_STATUSES } from "../shared/constants.mjs";

export const reminderDefaults = {
  enabled: false,
  calendar: false,
  operations: false,
  initialized: false,
};
const DAY = 86_400_000;
export function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function localDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isFinite(+date) && dateKey(date) === value ? date : null;
}
function atNine(date, days = 0) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  result.setHours(9, 0, 0, 0);
  return result;
}
export function monthBefore(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), 0, 9);
  result.setDate(Math.min(date.getDate(), result.getDate()));
  return result;
}
export function reminderId(keys) {
  return createHash("sha256")
    .update([...keys].sort().join("\n"))
    .digest("hex");
}

// Rebuilt from current source data every tick: deleted, completed and rescheduled
// records therefore cannot leave behind a stale future notification.
export function reminderCandidates({ settings, operations = [], events = [], now = new Date() }) {
  if (!settings.enabled) return [];
  const result = [];
  if (settings.operations)
    for (const record of operations) {
      if (CLOSED_RECORD_STATUSES.includes(record.status)) continue;
      const due = localDate(record.dueDate);
      if (!due) continue;
      const expires = new Date(due);
      expires.setDate(expires.getDate() + 1);
      if (+expires <= +now) continue;
      for (const [node, when] of [
        ["month", monthBefore(due)],
        ["week", atNine(due, -7)],
        ["day", atNine(due, -1)],
      ]) {
        result.push({
          key: `operations:${record.id}:${record.dueDate}:${node}`,
          category: "operations",
          id: record.id,
          title: record.title,
          detail: `Due ${record.dueDate}`,
          when: +when,
          expires: +expires,
        });
      }
    }
  if (settings.calendar)
    for (const event of events) {
      const start = new Date(event.start);
      if (!Number.isFinite(+start) || +start <= +now) continue;
      const when = event.allDay ? +atNine(start, -1) : +start - DAY;
      result.push({
        key: `calendar:${event.calendarId || event.calendar}:${event.id}:${event.start}`,
        category: "calendar",
        id: event.id,
        date: dateKey(start),
        title: event.title,
        detail: event.allDay ? `${dateKey(start)} · All day` : start.toLocaleString("en-GB"),
        when,
        expires: +start,
      });
    }
  return result;
}
export function dueReminders(candidates, delivered, now = new Date()) {
  return candidates.filter(
    (item) => item.when <= +now && item.expires > +now && !delivered[item.key],
  );
}
export function reminderNotification(due, siteUrl) {
  const unique = [
    ...new Map(due.map((item) => [`${item.category}:${item.id}:${item.expires}`, item])).values(),
  ];
  const first = unique[0];
  const url = new URL(siteUrl);
  const params = new URLSearchParams();
  params.set("reminder", unique.length === 1 ? first.category : "summary");
  if (unique.length === 1) {
    params.set("id", first.id);
    // The URL is rebuilt from `url.origin`, which drops the query string, so the
    // date has to travel in the hash params the client actually reads.
    if (first.date) params.set("date", first.date);
  } else {
    // Only navigation identifiers are stored; source details are fetched on click.
    params.set(
      "items",
      JSON.stringify(unique.map(({ category, id, date }) => ({ category, id, date }))),
    );
  }
  return {
    id: reminderId(due.map((item) => item.key)),
    title:
      unique.length === 1
        ? first.category === "calendar"
          ? "Upcoming calendar event"
          : "PhD Operation deadline"
        : `${unique.length} upcoming reminders`,
    body:
      unique
        .slice(0, 3)
        .map((item) => `${item.title} — ${item.detail}`)
        .join("\n") + (unique.length > 3 ? `\n+${unique.length - 3} more` : ""),
    url: `${url.origin}/#${params}`,
  };
}
