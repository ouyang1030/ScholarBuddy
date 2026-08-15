"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bridgeFetch } from "../../lib/bridge-client";
import { localDateKey, timeLabel } from "../../lib/format";
import type { FocusCalendarBlock } from "../../types";
import { FocusCelebration } from "../Celebrations";

export function FocusPanel() {
  const [now, setNow] = useState(() => new Date());
  const [elapsed, setElapsed] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [target, setTarget] = useState("");
  const [focusDate, setFocusDate] = useState(() => localDateKey(new Date()));
  const [pending, setPending] = useState<FocusCalendarBlock[]>([]);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [calendarMessage, setCalendarMessage] = useState("");
  const [celebrating, setCelebrating] = useState(false);
  const syncingRef = useRef(false);
  const celebratedRef = useRef(false);
  const celebrationTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const today = localDateKey(new Date());
    const hydrate = window.setTimeout(() => {
      try {
        const saved = JSON.parse(
          window.localStorage.getItem("workbuddy-focus-en-v2") ||
            window.localStorage.getItem("workbuddy-focus-en-v1") ||
            "{}",
        );
        const savedDate = saved.date || today;
        const savedPending = Array.isArray(saved.pending)
          ? saved.pending.filter((item: FocusCalendarBlock) => item?.id && item?.start && item?.end)
          : [];

        if (savedDate === today) {
          setElapsed(Number(saved.elapsed) || 0);
          setStartedAt(Number(saved.startedAt) || null);
          setTarget(String(saved.target || ""));
          setFocusDate(today);
          setPending(savedPending);
        } else {
          const pendingItems = [...savedPending];
          if (saved.startedAt) {
            const startTimestamp = Number(saved.startedAt);
            const boundary = new Date(startTimestamp);
            boundary.setHours(23, 59, 59, 999);
            pendingItems.push({
              id: `focus-${crypto.randomUUID()}`,
              start: new Date(startTimestamp).toISOString(),
              end: new Date(Math.max(startTimestamp + 1000, boundary.getTime())).toISOString(),
              target: String(saved.target || "").trim(),
            });
          }
          setElapsed(0);
          setStartedAt(null);
          setTarget(String(saved.target || ""));
          setFocusDate(today);
          setPending(pendingItems);
        }
        celebratedRef.current =
          window.localStorage.getItem("workbuddy-focus-celebrated-date") === today;
      } catch {
        /* new timer */
      }
      setReady(true);
    }, 0);
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    return () => {
      window.clearTimeout(hydrate);
      window.clearInterval(clock);
    };
  }, []);
  useEffect(
    () => () => {
      if (celebrationTimerRef.current) window.clearTimeout(celebrationTimerRef.current);
    },
    [],
  );
  useEffect(() => {
    if (ready)
      window.localStorage.setItem(
        "workbuddy-focus-en-v2",
        JSON.stringify({ date: focusDate, elapsed, startedAt, target, pending }),
      );
  }, [elapsed, focusDate, pending, ready, startedAt, target]);
  useEffect(() => {
    const start = (event: Event) => {
      const detail = (event as CustomEvent<{ target?: string }>).detail;
      if (detail?.target) setTarget(detail.target);
      const currentTime = Date.now();
      const currentDay = localDateKey(new Date(currentTime));
      setFocusDate((prevDate) => {
        if (prevDate !== currentDay) {
          setElapsed(0);
          return currentDay;
        }
        return prevDate;
      });
      setStartedAt((current) => current || currentTime);
    };
    window.addEventListener("workbuddy-start-focus", start);
    return () => window.removeEventListener("workbuddy-start-focus", start);
  }, []);
  const syncPending = useCallback(async (blocks: FocusCalendarBlock[]) => {
    if (!blocks.length || syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    let synced = 0;
    try {
      for (const block of blocks) {
        try {
          const minutes = Math.max(
            1,
            Math.round((new Date(block.end).getTime() - new Date(block.start).getTime()) / 60000),
          );
          const safeTarget =
            String(block.target || "Research")
              .trim()
              .slice(0, 180) || "Research";
          const response = await bridgeFetch("/calendar/event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(20000),
            body: JSON.stringify({
              title: `Focus ${minutes} min · ${safeTarget}`,
              start: block.start,
              end: block.end,
              externalId: block.id,
              notes: `ScholarBuddy focus session\nTarget: ${safeTarget}`,
            }),
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || "Calendar sync failed.");
          setPending((items) => items.filter((item) => item.id !== block.id));
          synced += 1;
        } catch {
          setCalendarMessage("Paused · Calendar sync pending");
          break;
        }
      }
      if (synced) {
        setCalendarMessage("Paused · saved to Calendar");
        window.dispatchEvent(new Event("workbuddy-calendar-refresh"));
      }
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);
  useEffect(() => {
    if (ready && pending.length) void syncPending(pending);
  }, [pending, ready, syncPending]);
  const currentDate = localDateKey(now);
  const isCurrentDay = focusDate === currentDate;
  const running = startedAt !== null;
  const seconds = isCurrentDay
    ? elapsed + (startedAt ? Math.max(0, Math.floor((now.getTime() - startedAt) / 1000)) : 0)
    : 0;
  useEffect(() => {
    if (!ready || focusDate === currentDate) return;
    const rollover = window.setTimeout(() => {
      if (startedAt !== null) {
        const midnight = new Date(now);
        midnight.setHours(0, 0, 0, 0);
        const boundary = Math.max(startedAt + 1000, midnight.getTime());
        setPending((items) => [
          ...items,
          {
            id: `focus-${crypto.randomUUID()}`,
            start: new Date(startedAt).toISOString(),
            end: new Date(boundary).toISOString(),
            target: target.trim(),
          },
        ]);
        setElapsed(0);
        setFocusDate(currentDate);
        setStartedAt(midnight.getTime());
        setCalendarMessage("New day · previous focus block queued for Calendar…");
      } else {
        setElapsed(0);
        setFocusDate(currentDate);
        setCalendarMessage("");
      }
      celebratedRef.current =
        window.localStorage.getItem("workbuddy-focus-celebrated-date") === currentDate;
    }, 0);
    return () => window.clearTimeout(rollover);
  }, [currentDate, focusDate, now, ready, startedAt, target]);
  useEffect(() => {
    if (!ready || focusDate !== currentDate || seconds < 21600 || celebratedRef.current) return;
    celebratedRef.current = true;
    window.localStorage.setItem("workbuddy-focus-celebrated-date", currentDate);
    window.setTimeout(() => setCelebrating(true), 0);
    celebrationTimerRef.current = window.setTimeout(() => setCelebrating(false), 8000);
  }, [currentDate, focusDate, ready, seconds]);
  const label = `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const toggle = () => {
    const rightNow = Date.now();
    const nextDate = localDateKey(new Date(rightNow));
    if (startedAt) {
      const endedAt = rightNow;
      const block: FocusCalendarBlock = {
        id: `focus-${crypto.randomUUID()}`,
        start: new Date(startedAt).toISOString(),
        end: new Date(Math.max(endedAt, startedAt + 1000)).toISOString(),
        target: target.trim(),
      };
      setElapsed(seconds);
      setStartedAt(null);
      setPending((items) => [...items, block]);
      setCalendarMessage("Paused · saving to Calendar…");
    } else {
      if (focusDate !== nextDate) {
        setElapsed(0);
        celebratedRef.current =
          window.localStorage.getItem("workbuddy-focus-celebrated-date") === nextDate;
      }
      setFocusDate(nextDate);
      setStartedAt(rightNow);
      setCalendarMessage("");
    }
  };
  const statusText = running
    ? `Started at ${timeLabel(new Date(startedAt || now.getTime()).toISOString())}`
    : syncing
      ? "Paused · saving to Calendar…"
      : pending.length
        ? `Paused · ${pending.length} Calendar sync pending`
        : calendarMessage ||
          (seconds ? "Paused · saved to Calendar" : "Ready for a new focus session");
  return (
    <>
      <article className="focus-session card">
        <div className="focus-top">
          <span className="label">FOCUS SESSION</span>
          <span className={running ? "live" : "paused"}>
            <i />
            {running ? "Recording" : "Paused"}
          </span>
        </div>
        <label className="focus-object">
          <span>FOCUS TARGET</span>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="What are you focusing on?"
          />
        </label>
        <h2>{label}</h2>
        <p>{statusText}</p>
        <div className={`focus-wave ${running ? "active" : ""}`} aria-hidden="true">
          {[
            6, 10, 16, 23, 31, 19, 28, 39, 24, 34, 45, 27, 38, 49, 30, 41, 46, 33, 40, 29, 21, 14,
            8, 5, 3,
          ].map((height, index) => (
            <i key={index} style={{ height, "--wave-index": index } as React.CSSProperties} />
          ))}
        </div>
        <div className="focus-actions">
          <button
            aria-label={
              running
                ? "Pause focus session"
                : seconds
                  ? "Resume focus session"
                  : "Start focus session"
            }
            title={running ? "Pause session" : seconds ? "Resume session" : "Start session"}
            aria-pressed={running}
            onClick={toggle}
          >
            <span
              className={`focus-control-icon ${running ? "pause" : "play"}`}
              aria-hidden="true"
            />
          </button>
          {pending.length ? (
            <button
              aria-label="Retry Calendar sync"
              title="Retry Calendar"
              disabled={syncing}
              onClick={() => void syncPending(pending)}
            >
              <span className="focus-control-icon reset" aria-hidden="true">
                ↻
              </span>
            </button>
          ) : (
            <button
              aria-label="Reset focus timer"
              title="Reset"
              disabled={!seconds || running}
              onClick={() => {
                setElapsed(0);
                setStartedAt(null);
                setCalendarMessage("");
              }}
            >
              <span className="focus-control-icon reset" aria-hidden="true">
                ↻
              </span>
            </button>
          )}
        </div>
      </article>
      {celebrating && <FocusCelebration onClose={() => setCelebrating(false)} />}
    </>
  );
}
