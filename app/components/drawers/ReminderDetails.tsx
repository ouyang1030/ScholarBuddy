"use client";
import { useEffect, useState } from "react";
import { localDateKey } from "../../lib/format";
import { bridgeFetch } from "../../lib/bridge-client";
import type { RecordItem, CalendarEvent } from "../../types";
import { closeWithTransition, DrawerHeader } from "../primitives";
export type ReminderLink = { category: "operations" | "calendar"; id: string; date?: string };
export function ReminderDetails({
  items,
  operations,
  onOpenOperation,
  onClose,
  ref,
}: {
  items: ReminderLink[];
  operations: RecordItem[];
  onOpenOperation: (record: RecordItem) => void;
  onClose: () => void;
  ref?: React.Ref<HTMLElement>;
}) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    const dates = [
      ...new Set(
        items
          .filter((item) => item.category === "calendar")
          .map((item) => item.date)
          .filter(Boolean),
      ),
    ];
    void Promise.all(
      dates.map(async (date) => {
        const response = await bridgeFetch(`/reminders/events?date=${encodeURIComponent(date!)}`, {
          signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        return body.events as CalendarEvent[];
      }),
    )
      .then((results) => setEvents(results.flat()))
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "Calendar details could not be loaded. Check your local connection and Calendar permission.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [items]);
  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(event) => closeWithTransition(onClose, event.currentTarget)}
    >
      <aside
        className="action-drawer reminders-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reminder-details-title"
        ref={ref}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <DrawerHeader
          label="Reminder details"
          mark="◷"
          title="Upcoming reminders"
          titleId="reminder-details-title"
          onClose={onClose}
        />
        {error && <p role="alert">{error}</p>}
        {items.map((item, index) => {
          const record =
            item.category === "operations"
              ? operations.find((record) => record.id === item.id)
              : undefined;
          const event =
            item.category === "calendar"
              ? events.find(
                  (event) =>
                    event.id === item.id && localDateKey(new Date(event.start)) === item.date,
                ) || events.find((event) => event.id === item.id)
              : undefined;
          return (
            <article className="reminder-detail" key={`${item.category}:${item.id}:${index}`}>
              <span className="label">
                {item.category === "operations" ? "PHD OPERATION" : "CALENDAR EVENT"}
              </span>
              <h3>
                {record?.title ||
                  event?.title ||
                  (loading ? "Loading…" : "This item is no longer available")}
              </h3>
              {record && (
                <>
                  <p>
                    Due {record.dueDate || "date not set"} · {record.status}
                  </p>
                  <button className="primary-button" onClick={() => onOpenOperation(record)}>
                    Open operation
                  </button>
                </>
              )}
              {event && (
                <>
                  <p>
                    {event.allDay ? "All day · " : ""}
                    {new Date(event.start).toLocaleString()} —{" "}
                    {new Date(event.end).toLocaleString()}
                  </p>
                  <p>{event.calendar}</p>
                </>
              )}
            </article>
          );
        })}
      </aside>
    </div>
  );
}
