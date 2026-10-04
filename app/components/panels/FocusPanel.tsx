"use client";

import { createContext, memo, useContext, useCallback, useEffect, useRef, useState } from "react";
import { bridgeFetch } from "../../lib/bridge-client";
import { localDateKey, timeLabel } from "../../lib/format";
import type { FocusCalendarBlock } from "../../types";
import { FocusCelebration } from "../Celebrations";
import {
  focusBridgeId,
  initializeFocusSync,
  readFocusSegments,
  saveFocusSegment,
  saveFocusGap,
  type FocusSegment,
} from "../../lib/focus-store";

type FocusController = ReturnType<typeof useFocusController>;
const FocusContext = createContext<FocusController | null>(null);
const FocusElsewhereContext = createContext(false);
export const useFocus = () => useContext(FocusContext);
// Throttled background tabs wake about once a minute, so a missed checkpoint only
// counts as an interruption well beyond that.
const FOCUS_INTERRUPTION_MS = 150_000;
// The controller lives beside the app rather than around it, so gaining or losing
// timer ownership never remounts the workbench.
const FocusHost = memo(function FocusHost({
  publish,
}: {
  publish: (value: FocusController | null) => void;
}) {
  const value = useFocusController();
  useEffect(() => {
    publish(value);
  });
  useEffect(() => () => publish(null), [publish]);
  return null;
});
export function FocusProvider({ children }: { children: React.ReactNode }) {
  // null while the lock is still being requested, false once another tab holds it.
  const [owner, setOwner] = useState<boolean | null>(null);
  const [value, setValue] = useState<FocusController | null>(null);
  useEffect(() => {
    let cancelled = false;
    let release = () => {};
    const stopSync = initializeFocusSync();
    const hold = async () => {
      if (cancelled) return;
      setOwner(true);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    };
    if (navigator.locks)
      void navigator.locks.request("workbuddy-focus-timer", { ifAvailable: true }, async (lock) => {
        if (lock) return hold();
        if (cancelled) return;
        setOwner(false);
        void navigator.locks.request("workbuddy-focus-timer", hold);
      });
    else
      Promise.resolve().then(() => {
        if (!cancelled) setOwner(true);
      });
    return () => {
      cancelled = true;
      release();
      stopSync();
    };
  }, []);
  return (
    <FocusContext.Provider value={owner ? value : null}>
      <FocusElsewhereContext.Provider value={owner === false}>
        {owner && <FocusHost publish={setValue} />}
        {children}
      </FocusElsewhereContext.Provider>
    </FocusContext.Provider>
  );
}

const FOCUS_STATE_KEY = "workbuddy-focus-en-v2";
const LEGACY_FOCUS_STATE_KEY = "workbuddy-focus-en-v1";
const FOCUS_CELEBRATION_KEY = "workbuddy-focus-celebration-v2";
const LEGACY_FOCUS_CELEBRATION_KEY = "workbuddy-focus-celebrated-date";

type FocusCelebrationState = {
  date: string;
  status: "pending" | "seen";
};

function readFocusCelebration(): FocusCelebrationState | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(FOCUS_CELEBRATION_KEY) || "null");
    return saved &&
      typeof saved.date === "string" &&
      (saved.status === "pending" || saved.status === "seen")
      ? saved
      : null;
  } catch {
    return null;
  }
}

function writeFocusCelebration(state: FocusCelebrationState) {
  window.localStorage.setItem(FOCUS_CELEBRATION_KEY, JSON.stringify(state));
}

function useFocusController() {
  const [now, setNow] = useState(() => new Date());
  const [elapsed, setElapsed] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [target, setTarget] = useState("");
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);
  const [plannedMinutes, setPlannedMinutes] = useState<number | null>(null);
  const [focusDate, setFocusDate] = useState(() => localDateKey(new Date()));
  const [pending, setPending] = useState<FocusCalendarBlock[]>([]);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [calendarMessage, setCalendarMessage] = useState("");
  const [celebrating, setCelebrating] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const ledgerRef = useRef<FocusSegment | null>(null);
  const ledgerLimit = useRef<number | null>(null);
  const checkpointRef = useRef(0);
  const [checkpointTick, setCheckpointTick] = useState(0);
  const targetRef = useRef("");
  const syncingRef = useRef(false);
  const celebratedRef = useRef(false);
  const celebrationPendingRef = useRef(false);
  const celebrationDateRef = useRef("");
  const celebrationShowTimerRef = useRef<number | null>(null);
  const celebrationTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const today = localDateKey(new Date());
    const hydrate = window.setTimeout(() => {
      try {
        const saved = JSON.parse(
          window.localStorage.getItem(FOCUS_STATE_KEY) ||
            window.localStorage.getItem(LEGACY_FOCUS_STATE_KEY) ||
            "{}",
        );
        const savedDate = saved.date || today;
        const savedPending = Array.isArray(saved.pending)
          ? saved.pending.filter((item: FocusCalendarBlock) => item?.id && item?.start && item?.end)
          : [];

        // A timer that was running when the page went away still owes Calendar
        // the part up to its last checkpoint.
        const start = Number(saved.startedAt) || 0;
        const checkpoint = Math.min(
          Number(saved.checkpointAt) || 0,
          saved.plannedMinutes
            ? start +
                Math.max(0, Number(saved.plannedMinutes) * 60 - (Number(saved.elapsed) || 0)) * 1000
            : Infinity,
        );
        if (start && checkpoint - start >= 1000)
          savedPending.push({
            id: `focus-${crypto.randomUUID()}`,
            start: new Date(start).toISOString(),
            end: new Date(checkpoint).toISOString(),
            target: String(saved.target || "").trim(),
          });

        if (savedDate === today) {
          const recovered =
            saved.startedAt && saved.checkpointAt
              ? Math.max(0, (Number(saved.checkpointAt) - Number(saved.startedAt)) / 1000)
              : 0;
          const restored = (Number(saved.elapsed) || 0) + recovered;
          setElapsed(
            saved.plannedMinutes ? Math.min(restored, Number(saved.plannedMinutes) * 60) : restored,
          );
          setStartedAt(null);
          if (saved.startedAt)
            setRecoveryMessage(
              "Timer restored paused. Only time through the last checkpoint was kept.",
            );
          setTarget(String(saved.target || ""));
          setActiveTaskId(Number(saved.activeTaskId) || null);
          setPlannedMinutes(Number(saved.plannedMinutes) || null);
          setFocusDate(today);
          setPending(savedPending);
          if (!saved.ledgerVersion)
            for (const block of savedPending)
              void saveFocusSegment({
                segmentId: block.id,
                revision: 1,
                startedAt: block.start,
                endedAt: block.end,
                status: "saved",
                bridgeId: focusBridgeId(),
              });
        } else {
          const pendingItems = [...savedPending];
          if (saved.startedAt)
            setRecoveryMessage("Previous timer restored paused; unobserved time was not added.");
          setElapsed(0);
          setStartedAt(null);
          setTarget(String(saved.target || ""));
          setActiveTaskId(null);
          setPlannedMinutes(null);
          setFocusDate(today);
          setPending(pendingItems);
        }
        const celebration = readFocusCelebration();
        celebratedRef.current = celebration?.date === today && celebration.status === "seen";
        celebrationPendingRef.current =
          celebration?.date === today && celebration.status === "pending";
        celebrationDateRef.current = celebration?.date === today ? today : "";
        // v1 wrote "seen" before the overlay was visible, so it cannot prove the
        // user actually saw anything. The v2 threshold check below safely requeues
        // today's missed celebration once and then owns the lifecycle.
        window.localStorage.removeItem(LEGACY_FOCUS_CELEBRATION_KEY);
      } catch {
        /* new timer */
      }
      void readFocusSegments()
        .then((items) => {
          for (const item of items)
            if (item.status === "running") {
              void saveFocusSegment({ ...item, status: "saved", revision: item.revision + 1 });
              void saveFocusGap(item);
            }
        })
        .catch(() => {});
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
      if (celebrationShowTimerRef.current) window.clearTimeout(celebrationShowTimerRef.current);
      if (celebrationTimerRef.current) window.clearTimeout(celebrationTimerRef.current);
    },
    [],
  );
  useEffect(() => {
    if (ready)
      window.localStorage.setItem(
        FOCUS_STATE_KEY,
        JSON.stringify({
          date: focusDate,
          ledgerVersion: 1,
          elapsed,
          startedAt,
          checkpointAt: startedAt ? checkpointRef.current : null,
          target,
          activeTaskId,
          plannedMinutes,
          pending,
        }),
      );
  }, [
    activeTaskId,
    elapsed,
    focusDate,
    pending,
    plannedMinutes,
    ready,
    startedAt,
    target,
    checkpointTick,
  ]);
  useEffect(() => {
    targetRef.current = target;
  }, [target]);
  useEffect(() => {
    const start = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          target?: string;
          taskId?: number | null;
          plannedMinutes?: number | null;
        }>
      ).detail;
      if (!detail?.target) return;
      const currentTime = Date.now();
      const currentDay = localDateKey(new Date(currentTime));
      const nextTaskId = Number(detail.taskId) || null;
      const nextMinutes = Number(detail.plannedMinutes) || null;
      const changingTarget =
        (activeTaskId && nextTaskId && activeTaskId !== nextTaskId) ||
        (!activeTaskId && target.trim() && target.trim() !== detail.target.trim());

      if (
        (startedAt || elapsed) &&
        changingTarget &&
        !window.confirm("Switch focus target? The current session will be paused and saved first.")
      ) {
        event.preventDefault();
        return;
      }

      if (startedAt && changingTarget) {
        const trustedEnd =
          currentTime - checkpointRef.current > FOCUS_INTERRUPTION_MS
            ? checkpointRef.current
            : currentTime;
        setPending((items) => [
          ...items,
          {
            id: `focus-${crypto.randomUUID()}`,
            start: new Date(startedAt).toISOString(),
            end: new Date(Math.max(trustedEnd, startedAt + 1000)).toISOString(),
            target: target.trim(),
          },
        ]);
        setCalendarMessage("Switched target · saving previous focus block…");
      }

      if (changingTarget) setElapsed(0);
      setTarget(detail.target);
      setActiveTaskId(nextTaskId);
      setPlannedMinutes(nextMinutes ? Math.max(1, Math.min(480, Math.round(nextMinutes))) : null);
      setFocusDate((prevDate) => {
        if (prevDate !== currentDay) {
          setElapsed(0);
          return currentDay;
        }
        return prevDate;
      });
      setStartedAt((current) => (changingTarget ? currentTime : current || currentTime));
    };
    window.addEventListener("workbuddy-start-focus", start);
    return () => window.removeEventListener("workbuddy-start-focus", start);
  }, [activeTaskId, elapsed, startedAt, target]);
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
  const running = startedAt !== null;
  const seconds =
    elapsed + (startedAt ? Math.max(0, Math.floor((now.getTime() - startedAt) / 1000)) : 0);
  useEffect(() => {
    if (!ready || focusDate === currentDate) return;
    // A running session carries over midnight; the ledger splits it by day. A
    // paused one starts the new day clean, exactly as a reload would.
    const rollover = window.setTimeout(() => {
      setFocusDate(currentDate);
      if (startedAt === null) {
        setElapsed(0);
        setActiveTaskId(null);
        setPlannedMinutes(null);
        setCalendarMessage("");
      }
      const celebration = readFocusCelebration();
      celebratedRef.current = celebration?.date === currentDate && celebration.status === "seen";
      celebrationPendingRef.current =
        celebration?.date === currentDate && celebration.status === "pending";
      celebrationDateRef.current = celebration?.date === currentDate ? currentDate : "";
    }, 0);
    return () => window.clearTimeout(rollover);
  }, [currentDate, focusDate, ready, startedAt]);
  useEffect(() => {
    if (!ready) return;
    const previous = ledgerRef.current;
    if (previous && (!startedAt || Date.parse(previous.startedAt) !== startedAt)) {
      const interrupted = Date.now() - checkpointRef.current > FOCUS_INTERRUPTION_MS;
      const end = Math.min(
        interrupted ? checkpointRef.current : Date.now(),
        ledgerLimit.current ?? Infinity,
      );
      if (interrupted) void saveFocusGap(previous);
      void saveFocusSegment({
        ...previous,
        endedAt: new Date(Math.max(Date.parse(previous.startedAt), end)).toISOString(),
        revision: previous.revision + 1,
        status: "saved",
      });
      ledgerRef.current = null;
    }
    if (startedAt)
      ledgerLimit.current = plannedMinutes
        ? startedAt + Math.max(0, plannedMinutes * 60 - elapsed) * 1000
        : null;
    if (startedAt && !ledgerRef.current) {
      checkpointRef.current = Date.now();
      const segment: FocusSegment = {
        segmentId: `focus-${crypto.randomUUID()}`,
        revision: 1,
        startedAt: new Date(startedAt).toISOString(),
        endedAt: new Date(startedAt).toISOString(),
        status: "running",
        bridgeId: focusBridgeId(),
        limitAt: ledgerLimit.current ?? undefined,
      };
      ledgerRef.current = segment;
      void saveFocusSegment(segment);
    }
  }, [startedAt, ready, plannedMinutes, elapsed]);
  useEffect(() => {
    if (!startedAt) return;
    const checkpoint = () => {
      const segment = ledgerRef.current;
      if (!segment) return;
      const current = Date.now();
      if (current - checkpointRef.current > FOCUS_INTERRUPTION_MS) {
        const end = Math.min(checkpointRef.current, ledgerLimit.current ?? Infinity);
        void saveFocusSegment({
          ...segment,
          endedAt: new Date(end).toISOString(),
          revision: segment.revision + 1,
          status: "saved",
        });
        void saveFocusGap(segment, current);
        ledgerRef.current = null;
        if (end - startedAt >= 1000)
          setPending((items) => [
            ...items,
            {
              id: `focus-${crypto.randomUUID()}`,
              start: new Date(startedAt).toISOString(),
              end: new Date(end).toISOString(),
              target: targetRef.current.trim(),
            },
          ]);
        setElapsed((value) => value + Math.max(0, (end - startedAt) / 1000));
        setStartedAt(null);
        setRecoveryMessage(
          "Timer paused after an interruption. Time after the last checkpoint was not added.",
        );
        return;
      }
      checkpointRef.current = Math.min(current, ledgerLimit.current ?? Infinity);
      const updated = {
        ...segment,
        revision: segment.revision + 1,
        endedAt: new Date(checkpointRef.current).toISOString(),
        limitAt: ledgerLimit.current ?? undefined,
      };
      ledgerRef.current = updated;
      void saveFocusSegment(updated);
      setCheckpointTick((tick) => tick + 1);
    };
    const timer = window.setInterval(checkpoint, 15000);
    // Timers are throttled or suspended once the page is hidden, so checkpoint on
    // the way out and re-check on the way back.
    document.addEventListener("visibilitychange", checkpoint);
    window.addEventListener("pagehide", checkpoint);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", checkpoint);
      window.removeEventListener("pagehide", checkpoint);
    };
  }, [startedAt]);
  const finishCelebration = useCallback(() => {
    if (celebrationShowTimerRef.current) window.clearTimeout(celebrationShowTimerRef.current);
    if (celebrationTimerRef.current) window.clearTimeout(celebrationTimerRef.current);
    celebrationShowTimerRef.current = null;
    celebrationTimerRef.current = null;
    celebrationPendingRef.current = false;
    celebratedRef.current = true;
    writeFocusCelebration({
      date: celebrationDateRef.current || localDateKey(new Date()),
      status: "seen",
    });
    setCelebrating(false);
  }, []);
  const scheduleCelebration = useCallback(() => {
    if (
      celebratedRef.current ||
      !celebrationPendingRef.current ||
      document.visibilityState !== "visible" ||
      celebrationShowTimerRef.current ||
      celebrationTimerRef.current
    )
      return;
    celebrationShowTimerRef.current = window.setTimeout(() => {
      celebrationShowTimerRef.current = null;
      if (
        celebratedRef.current ||
        !celebrationPendingRef.current ||
        document.visibilityState !== "visible"
      )
        return;
      setCelebrating(true);
      celebrationTimerRef.current = window.setTimeout(finishCelebration, 8000);
    }, 0);
  }, [finishCelebration]);
  useEffect(() => {
    if (!ready || focusDate !== currentDate || seconds < 21600 || celebratedRef.current) return;
    celebrationPendingRef.current = true;
    celebrationDateRef.current = currentDate;
    writeFocusCelebration({ date: currentDate, status: "pending" });
    scheduleCelebration();
  }, [currentDate, focusDate, ready, scheduleCelebration, seconds]);
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        scheduleCelebration();
        return;
      }
      if (celebrationShowTimerRef.current) window.clearTimeout(celebrationShowTimerRef.current);
      if (celebrationTimerRef.current) window.clearTimeout(celebrationTimerRef.current);
      celebrationShowTimerRef.current = null;
      celebrationTimerRef.current = null;
      setCelebrating(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && celebrationPendingRef.current) finishCelebration();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [finishCelebration, scheduleCelebration]);
  const plannedSeconds = plannedMinutes ? plannedMinutes * 60 : null;
  const goalReached = plannedSeconds !== null && seconds >= plannedSeconds;
  const displaySeconds = Math.floor(
    plannedSeconds ? Math.max(0, plannedSeconds - seconds) : seconds,
  );
  const label = `${String(Math.floor(displaySeconds / 3600)).padStart(2, "0")}:${String(Math.floor((displaySeconds % 3600) / 60)).padStart(2, "0")}:${String(displaySeconds % 60).padStart(2, "0")}`;

  useEffect(() => {
    const detail = {
      running,
      seconds,
      target,
      taskId: activeTaskId,
      plannedMinutes,
    };
    const emit = () => window.dispatchEvent(new CustomEvent("workbuddy-focus-state", { detail }));
    emit();
    window.addEventListener("workbuddy-request-focus-state", emit);
    return () => window.removeEventListener("workbuddy-request-focus-state", emit);
  }, [activeTaskId, plannedMinutes, running, seconds, target]);

  useEffect(() => {
    if (!running || !plannedSeconds || seconds < plannedSeconds || !startedAt) return;
    if (Date.now() - checkpointRef.current > FOCUS_INTERRUPTION_MS) return;
    const completionTimer = window.setTimeout(() => {
      const endedAt = Math.min(
        Date.now(),
        startedAt + Math.max(0, plannedSeconds - elapsed) * 1000,
      );
      setPending((items) => [
        ...items,
        {
          id: `focus-${crypto.randomUUID()}`,
          start: new Date(startedAt).toISOString(),
          end: new Date(Math.max(endedAt, startedAt + 1000)).toISOString(),
          target: target.trim(),
        },
      ]);
      setElapsed(plannedSeconds);
      setStartedAt(null);
      setCalendarMessage("Goal reached · saving to Calendar…");
      window.dispatchEvent(
        new CustomEvent("workbuddy-focus-completed", {
          detail: { taskId: activeTaskId, target, plannedMinutes },
        }),
      );
    }, 0);
    return () => window.clearTimeout(completionTimer);
  }, [activeTaskId, elapsed, plannedMinutes, plannedSeconds, running, seconds, startedAt, target]);

  const toggle = () => {
    const rightNow = Date.now();
    const nextDate = localDateKey(new Date(rightNow));
    if (startedAt) {
      // After a missed checkpoint only the observed part counts, matching the ledger.
      const interrupted = rightNow - checkpointRef.current > FOCUS_INTERRUPTION_MS;
      const endedAt = interrupted ? checkpointRef.current : rightNow;
      const block: FocusCalendarBlock = {
        id: `focus-${crypto.randomUUID()}`,
        start: new Date(startedAt).toISOString(),
        end: new Date(Math.max(endedAt, startedAt + 1000)).toISOString(),
        target: target.trim(),
      };
      setElapsed(interrupted ? elapsed + Math.max(0, (endedAt - startedAt) / 1000) : seconds);
      if (interrupted)
        setRecoveryMessage(
          "Timer paused after an interruption. Time after the last checkpoint was not added.",
        );
      setStartedAt(null);
      setPending((items) => [...items, block]);
      setCalendarMessage("Paused · saving to Calendar…");
    } else {
      if (goalReached) {
        setElapsed(0);
        setPlannedMinutes(null);
      }
      if (focusDate !== nextDate) {
        const celebration = readFocusCelebration();
        celebratedRef.current = celebration?.date === nextDate && celebration.status === "seen";
        celebrationPendingRef.current =
          celebration?.date === nextDate && celebration.status === "pending";
        celebrationDateRef.current = celebration?.date === nextDate ? nextDate : "";
      }
      setFocusDate(nextDate);
      setStartedAt(rightNow);
      setCalendarMessage("");
    }
  };
  const statusText = running
    ? plannedMinutes
      ? `Started at ${timeLabel(new Date(startedAt || now.getTime()).toISOString())} · ${plannedMinutes} min goal`
      : `Started at ${timeLabel(new Date(startedAt || now.getTime()).toISOString())}`
    : goalReached
      ? syncing || pending.length
        ? "Goal reached · saving to Calendar…"
        : "Goal reached · choose what to do next"
      : syncing
        ? "Paused · saving to Calendar…"
        : pending.length
          ? `Paused · ${pending.length} Calendar sync pending`
          : calendarMessage ||
            (seconds ? "Paused · saved to Calendar" : "Ready for a new focus session");
  return {
    now,
    elapsed,
    startedAt,
    target,
    setTarget,
    plannedMinutes,
    pending,
    syncing,
    running,
    seconds,
    label,
    statusText,
    toggle,
    goalReached,
    syncPending,
    setElapsed,
    setStartedAt,
    setActiveTaskId,
    setPlannedMinutes,
    setCalendarMessage,
    celebrating,
    finishCelebration,
    ledgerRef,
    recoveryMessage,
  };
}

export function FocusPanel() {
  const focus = useFocus();
  const elsewhere = useContext(FocusElsewhereContext);
  if (!focus)
    return (
      <article className="focus-session card">
        <p>
          {elsewhere
            ? "Focus timer is active in another tab. Your saved history is available in Profile."
            : "Preparing focus timer…"}
        </p>
      </article>
    );
  const {
    target,
    setTarget,
    plannedMinutes,
    pending,
    syncing,
    running,
    seconds,
    label,
    statusText,
    toggle,
    goalReached,
    syncPending,
    setElapsed,
    setStartedAt,
    setActiveTaskId,
    setPlannedMinutes,
    setCalendarMessage,
    celebrating,
    finishCelebration,
    recoveryMessage,
  } = focus;
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
          <small>
            {plannedMinutes ? `${plannedMinutes}-minute countdown` : "Open-ended session"}
          </small>
        </label>
        <h2 aria-label={plannedMinutes ? `${label} remaining` : `${label} elapsed`}>{label}</h2>
        <p>
          {statusText}
          {recoveryMessage && <small className="focus-recovery">{recoveryMessage}</small>}
        </p>
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
                : goalReached
                  ? "Continue focus session without a time limit"
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
                setActiveTaskId(null);
                setPlannedMinutes(null);
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
      {celebrating && <FocusCelebration onClose={finishCelebration} />}
    </>
  );
}
