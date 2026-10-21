"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  BridgeFailure,
  bridgeFailure,
  failureText,
  useLocale,
  useT,
  valueLabel,
  type Messages,
} from "../../i18n";
import { bridgeFetch } from "../../lib/bridge-client";
import { compactNumber } from "../../lib/format";
import {
  focusStorageFailed,
  focusBridgeId,
  readFocusSegments,
  syncFocus,
  saveFocusSegment,
  type FocusSegment,
} from "../../lib/focus-store";
import type { RecordItem } from "../../types";
import { useFocus } from "../panels/FocusPanel";
import {
  activitySeries,
  dayKey,
  effortInRange,
  focusDays,
  nextDay,
  operationEffort,
} from "../../../shared/activity.mjs";

type Day = {
  date: string;
  value: number;
  count: number;
  unknown: number;
  start?: string;
  end?: string;
};
type Profile = {
  displayName: string;
  bridgeId: string;
  trackingSince: string;
  timeZone: string;
  today: string;
  warning: string;
  focus: {
    total: number;
    today: number;
    peak: { value: number; date: string | null };
    current: number;
    longest: number;
    days: Day[];
    segments: FocusSegment[];
  };
  ai: {
    total: number;
    peak: { value: number; date: string | null };
    longestChat: number;
    current: number;
    longest: number;
    requests: number;
    reported: number;
    days: Day[];
  };
};
type Effort = {
  operationId: string;
  operationType: string;
  days: Day[];
  sessions: [string, string][];
};
type EffortTotal = {
  operationId: string;
  operationType: string;
  value: number;
  count: number;
  lastDate: string;
};
function durationLabel(t: Messages, seconds: number) {
  if (seconds > 0 && seconds < 60) return t.profile.underMinute;
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60
    ? t.profile.hours(Math.floor(minutes / 60), minutes % 60)
    : t.profile.minutes(minutes);
}
const DATE_TAGS = { en: "en", zh: "zh-CN" } as const;

export function ProfileModule({
  openConnections,
  startFocus,
  operations,
  openOperation,
}: {
  openConnections: () => void;
  startFocus: () => void;
  // Null until the vault's records have loaded, so an operation that is merely
  // not loaded yet is never reported as deleted.
  operations: RecordItem[] | null;
  openOperation: (record?: RecordItem) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const duration = (seconds: number) => durationLabel(t, seconds);
  const tokens = (value: number) => compactNumber(value, locale);
  const monthLabel = (date: string) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString(DATE_TAGS[locale], {
      month: "short",
      timeZone: "UTC",
    });
  const dateLabel = (date: string) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString(DATE_TAGS[locale], {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  const [tab, setTab] = useState<"focus" | "operations" | "tokens">("focus");
  const [view, setView] = useState<"daily" | "weekly" | "cumulative">("daily");
  const [ranges, setRanges] = useState({ focus: "1y", operations: "1y", tokens: "1y" });
  const operationsTab = tab === "operations";
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [local, setLocal] = useState<FocusSegment[]>([]);
  const [storageWarning, setStorageWarning] = useState<"" | "read" | "save">("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Day | null>(null);
  const [details, setDetails] = useState(false);
  const focus = useFocus();
  const [fallbackNow] = useState(() => new Date());
  const load = useCallback(async () => {
    try {
      const response = await bridgeFetch("/profile");
      if (!response.ok)
        throw new BridgeFailure(
          "",
          response.status === 404
            ? "profile_restart"
            : response.status === 401
              ? "pairing_required"
              : "profile_failed",
        );
      const body = (await response.json()) as Profile;
      setProfile(body);
      setError(null);
    } catch (e) {
      setError(e instanceof TypeError ? new BridgeFailure("", "unreachable") : e);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    const read = () => {
      void readFocusSegments()
        .then((items) => {
          if (!cancelled) setLocal(items);
        })
        .catch(() => {
          if (!cancelled) setStorageWarning("read");
        });
      setStorageWarning(focusStorageFailed() ? "save" : "");
    };
    const refresh = () => {
      void load();
      read();
    };
    refresh();
    window.addEventListener("scholarbuddy-focus-ledger", read);
    window.addEventListener("scholarbuddy-profile-refresh", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("scholarbuddy-focus-ledger", read);
      window.removeEventListener("scholarbuddy-profile-refresh", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);
  const zone = profile?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = dayKey(focus?.now || fallbackNow, zone);
  const visibleLocal = useMemo(
    () => local.filter((s) => !s.bridgeId || s.bridgeId === (profile?.bridgeId || focusBridgeId())),
    [local, profile?.bridgeId],
  );
  // The Operations tab speaks only for operation time, so what it says is waiting
  // or interrupted is limited to that.
  const pending = visibleLocal.filter(
    (s) => s.syncedRevision !== s.revision && (!operationsTab || s.operationId),
  );
  const stored = useMemo(() => {
    const merged = new Map((profile?.focus.segments || []).map((s) => [s.segmentId, s]));
    for (const segment of visibleLocal) {
      const old = merged.get(segment.segmentId);
      if (!old || segment.revision >= old.revision) merged.set(segment.segmentId, segment);
    }
    return merged;
  }, [profile?.focus.segments, visibleLocal]);
  const merged = new Map(stored);
  const live = focus?.running ? focus.ledgerRef.current : null;
  let liveEnd = 0;
  if (live && focus) {
    const cap = focus.plannedMinutes
      ? Date.parse(live.startedAt) + Math.max(0, focus.plannedMinutes * 60 - focus.elapsed) * 1000
      : Infinity;
    liveEnd = Math.min(focus.now.getTime(), cap);
    merged.set(live.segmentId, { ...live, endedAt: new Date(liveEnd).toISOString() });
  }
  const allSegments = [...merged.values()];
  const recoveries = allSegments.filter(
    (s) => ["gap", "confirmed"].includes(s.status) && (!operationsTab || s.operationId),
  );
  // Operation effort is read in minutes, so a running session moves it once a
  // minute rather than on every tick of the timer.
  const liveFiled = live?.operationId ? live : null;
  const liveId = liveFiled?.segmentId || "";
  const liveStart = liveFiled?.startedAt || "";
  const liveOperationId = liveFiled?.operationId || "";
  const liveOperationType = liveFiled?.operationType || "";
  const liveMinutes = liveFiled ? Math.floor((liveEnd - Date.parse(liveStart)) / 60000) : 0;
  const operationSegments = useMemo(() => {
    if (!operationsTab) return [];
    const list = [...stored.values()].filter((s) => s.operationId && s.segmentId !== liveId);
    if (liveId)
      list.push({
        segmentId: liveId,
        revision: 0,
        startedAt: liveStart,
        endedAt: new Date(Date.parse(liveStart) + liveMinutes * 60000).toISOString(),
        status: "running",
        bridgeId: "",
        operationId: liveOperationId,
        operationType: liveOperationType || undefined,
      });
    return list;
  }, [operationsTab, stored, liveId, liveStart, liveMinutes, liveOperationId, liveOperationType]);
  const operationDays = useMemo(
    () => focusDays(operationSegments, zone) as Day[],
    [operationSegments, zone],
  );
  const effort = useMemo(
    () => operationEffort(operationSegments, zone) as Effort[],
    [operationSegments, zone],
  );
  // Each day's operations, for the details table.
  const operationsByDay = useMemo(() => {
    const days = new Map<string, { id: string; value: number }[]>();
    for (const item of effort)
      for (const day of item.days) {
        if (day.value <= 0) continue;
        if (!days.has(day.date)) days.set(day.date, []);
        days.get(day.date)!.push({ id: item.operationId, value: day.value });
      }
    for (const list of days.values()) list.sort((a, b) => b.value - a.value);
    return days;
  }, [effort]);
  const dailyFocus = focusDays(allSegments, zone) as Day[];
  const segmentTime = (value: string) =>
    new Date(value).toLocaleString(DATE_TAGS[locale], {
      timeZone: zone,
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  const updateRecovery = async (segment: FocusSegment, status: FocusSegment["status"]) => {
    await saveFocusSegment({
      ...segment,
      status,
      revision: segment.revision + 1,
      bridgeId: segment.bridgeId || profile?.bridgeId || "",
    });
    await syncFocus();
    await load();
  };
  // Operations effort is the part of focus filed under an operation, so it shares
  // focus's tracking start and its shares are of the same range of focus.
  const rows = operationsTab
    ? operationDays
    : tab === "focus"
      ? dailyFocus
      : profile?.ai.days || [];
  const since = [
    profile ? dayKey(profile.trackingSince, zone) : today,
    ...(tab === "tokens" ? rows : dailyFocus).map((d) => d.date),
  ].sort()[0];
  const series = activitySeries(rows, since, today, view, ranges[tab]) as {
    buckets: Day[];
    total: number;
    average: number;
    calendarDays: number;
    start: string;
    end: string;
  };
  const format = tab === "tokens" ? tokens : duration;
  const known = !!profile || (tab !== "tokens" && dailyFocus.length > 0);
  const records = new Map((operations || []).map((item) => [item.id, item]));
  const ranked = effortInRange(effort, series.start, series.end) as EffortTotal[];
  const rankedTotal = ranked.reduce((n, item) => n + item.value, 0);
  const focusInRange = operationsTab
    ? activitySeries(dailyFocus, since, today, "daily", ranges.operations).total
    : 0;
  // A record that still exists says what it is filed as now; a deleted one keeps
  // the type it had when the time was spent.
  const typeOf = (item: EffortTotal) => {
    const record = records.get(item.operationId);
    return record ? record.type || "" : item.operationType;
  };
  const typeLabel = (type: string) =>
    type ? valueLabel(t.values.operationType, type) : t.editor.unclassified;
  const operationTitle = (id: string) => {
    const record = records.get(id);
    return record ? record.title || id : operations ? t.profile.deletedOperation(id) : id;
  };
  const byType = [
    ...ranked.reduce(
      (totals, item) => totals.set(typeOf(item), (totals.get(typeOf(item)) || 0) + item.value),
      new Map<string, number>(),
    ),
  ].sort(([a, x], [b, y]) => Number(!a) - Number(!b) || y - x);
  const topType = [...byType].sort(([, x], [, y]) => y - x)[0];
  const todaySeconds = dailyFocus.find((d) => d.date === today)?.value || 0;
  const unknownAI = !!profile && profile.ai.reported < profile.ai.requests;
  const tokenValue = (value: number) =>
    profile && (profile.ai.reported > 0 || !profile.ai.requests) ? tokens(value) : "—";
  const cards: { label: string; value: string; note?: string; text?: boolean }[] =
    tab === "focus"
      ? [
          {
            label: t.profile.totalFocus,
            value: profile ? duration(profile.focus.total) : "—",
          },
          {
            label: t.profile.dailyAverage,
            value: known ? duration(series.average) : "—",
            note: t.profile.selectedRange,
          },
          {
            label: t.profile.bestDay,
            value: profile?.focus.peak.date ? duration(profile.focus.peak.value) : "—",
            note: profile?.focus.peak.date ? dateLabel(profile.focus.peak.date) : "",
          },
          {
            label: t.profile.currentFocusStreak,
            value: profile ? t.profile.days(profile.focus.current) : "—",
          },
          {
            label: t.profile.longestFocusStreak,
            value: profile ? t.profile.days(profile.focus.longest) : "—",
          },
        ]
      : operationsTab
        ? [
            {
              label: t.profile.shareOfFocus,
              value: focusInRange ? `${Math.round((series.total / focusInRange) * 100)}%` : "—",
              note: t.profile.selectedRange,
            },
            {
              label: t.profile.operationsWorked,
              value: known ? t.profile.operationCount(ranked.length) : "—",
              note: t.profile.selectedRange,
            },
            {
              label: t.profile.topType,
              value: topType ? typeLabel(topType[0]) : "—",
              note: topType ? duration(topType[1]) : "",
              text: true,
            },
            {
              label: t.profile.topOperation,
              value: ranked[0] ? operationTitle(ranked[0].operationId) : "—",
              note: ranked[0] ? duration(ranked[0].value) : "",
              text: true,
            },
          ]
        : [
            {
              label: t.profile.peakDay,
              value: tokenValue(profile?.ai.peak.value || 0),
              note: profile?.ai.peak.date ? dateLabel(profile.ai.peak.date) : "",
            },
            {
              label: t.profile.longestChat,
              value: profile?.ai.longestChat ? duration(profile.ai.longestChat) : "—",
            },
            {
              label: t.profile.currentStreak,
              value: profile ? t.profile.days(profile.ai.current) : "—",
            },
            {
              label: t.profile.longestStreak,
              value: profile ? t.profile.days(profile.ai.longest) : "—",
            },
          ];
  // The Bridge seeds every profile with the English placeholder; until it is
  // renamed it is shown in the interface language like any other default.
  const displayName =
    !profile?.displayName || profile.displayName === "Researcher"
      ? t.profile.researcher
      : profile.displayName;
  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const response = await bridgeFetch("/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name }),
      });
      const body = await response.json();
      if (!response.ok) throw bridgeFailure(body, "");
      setProfile(body);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error && e.message ? e : new BridgeFailure("", "saveFailed"));
    } finally {
      setSaving(false);
    }
  }
  const max = Math.max(1, ...series.buckets.map((d) => d.value));
  const chartWidth = 960,
    chartHeight = 180;
  const point = (d: Day, i: number) =>
    `${series.buckets.length === 1 ? chartWidth / 2 : (i / (series.buckets.length - 1)) * chartWidth},${chartHeight - (d.value / max) * (chartHeight - 16)}`;
  const allZero = series.buckets.every((d) => d.value === 0);
  const linePoints =
    series.buckets.length === 1
      ? `0,${chartHeight - (series.buckets[0].value / max) * (chartHeight - 16)} ${chartWidth},${chartHeight - (series.buckets[0].value / max) * (chartHeight - 16)}`
      : series.buckets.map(point).join(" ");
  // Contribution-style grid: one column per week (Sunday first), one cell per day.
  // The weekly view keeps a single cell per week.
  // Days before tracking began fill the selected range as untracked cells.
  const span = { "30d": 30, "90d": 90, "1y": 365 }[ranges[tab]] ?? 30;
  const untracked: string[] = [];
  for (let date = nextDay(today, 1 - span); date < series.start; date = nextDay(date))
    untracked.push(date);
  const weekStart = (date: string) => nextDay(date, -new Date(`${date}T12:00:00Z`).getUTCDay());
  const before =
    view === "daily"
      ? untracked
      : [...new Set(untracked.map(weekStart))].filter((week) => week !== series.buckets[0]?.date);
  const first = before[0] || series.start;
  // The grid runs Sunday to Saturday, so Monday is the second row.
  const lead = view === "daily" ? new Date(`${first}T12:00:00Z`).getUTCDay() : 0;
  const cells: (Day | string | null)[] = [
    ...Array<null>(lead).fill(null),
    ...before,
    ...series.buckets,
  ];
  const perColumn = view === "daily" ? 7 : 1;
  const columns: { label: string; cells: (Day | string | null)[] }[] = [];
  let lastMonth = "";
  for (let i = 0; i < cells.length; i += perColumn) {
    const group = cells.slice(i, i + perColumn);
    while (group.length < perColumn) group.push(null);
    const head = group.find((d) => d);
    const month = head
      ? monthLabel(typeof head === "string" ? head : head.start || head.date)
      : lastMonth;
    columns.push({ label: month !== lastMonth ? month : "", cells: group });
    lastMonth = month;
  }
  const level = (value: number) => (value > 0 ? Math.max(1, Math.ceil((value / max) * 4)) : 0);
  const unknownLabel = tab === "tokens" ? t.profile.usageIncomplete : t.profile.timeUnconfirmed;
  const bucketLabel = (bucket: Day) =>
    `${bucket.end ? t.profile.between(bucket.start || bucket.date, bucket.end) : bucket.start || bucket.date}: ${format(bucket.value)}${bucket.unknown ? ` · ${unknownLabel}` : ""}`;
  const bucketTitle = (bucket: Day) =>
    `${bucket.start || bucket.date}: ${tab === "tokens" ? t.profile.tokens(bucket.value.toLocaleString(DATE_TAGS[locale])) : t.profile.seconds(Math.floor(bucket.value))}`;
  const hero =
    tab === "focus"
      ? {
          label: t.profile.todayFocus,
          title: t.profile.seconds(Math.floor(todaySeconds)),
          value: known ? duration(todaySeconds) : "—",
          note: focus?.running ? t.profile.recording : "",
        }
      : operationsTab
        ? {
            label: t.profile.operationTime,
            title: t.profile.seconds(Math.floor(series.total)),
            value: known ? duration(series.total) : "—",
            note: t.profile.ranges[ranges.operations as keyof Messages["profile"]["ranges"]],
          }
        : {
            label: t.profile.lifetimeTokens,
            title: t.profile.tokens(String(profile?.ai.total ?? 0)),
            value: tokenValue(profile?.ai.total || 0),
            note: unknownAI ? t.profile.knownUsage : "",
          };
  return (
    <section className="profile-page" aria-label={t.profile.aria}>
      <section className="page-intro compact">
        <div>
          <p className="eyebrow">{t.profile.eyebrow}</p>
          <h1>
            {t.profile.titleLead}
            <em>{t.profile.titleEm}</em>
          </h1>
        </div>
        <span className="status-pill mint">
          <i />
          {t.profile.thisMac}
        </span>
      </section>
      <div className="profile-identity">
        <span className="profile-avatar">
          {displayName
            .split(/\s+/)
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </span>
        <div>
          <h2>{displayName}</h2>
          {!profile && loading && <p>{t.profile.connecting}</p>}
        </div>
        {editing ? (
          <form className="profile-name-form" onSubmit={saveName}>
            <input
              aria-label={t.profile.displayName}
              value={name}
              maxLength={60}
              required
              onChange={(e) => setName(e.target.value)}
            />
            <button className="primary-button small" disabled={saving} type="submit">
              {t.common.save}
            </button>
            <button className="quiet-button" type="button" onClick={() => setEditing(false)}>
              {t.common.cancel}
            </button>
          </form>
        ) : (
          <button
            className="quiet-button"
            disabled={!profile}
            onClick={() => {
              setName(displayName);
              setEditing(true);
            }}
          >
            {t.profile.editName}
          </button>
        )}
      </div>
      <div className="profile-tabs" role="tablist" aria-label={t.profile.activityType}>
        {(
          [
            ["focus", t.profile.focus],
            ["operations", t.profile.operations],
            ["tokens", t.profile.ai],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => {
              setTab(key);
              setSelected(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {Boolean(error) && (
        <div className="data-banner compact-banner" role="status">
          <span>!</span>
          <p>
            {failureText(t, error, t.errors.profile_failed)}{" "}
            {profile ? t.profile.showingLast : t.profile.recordsLocally}
          </p>
          <div>
            <button onClick={() => void load()}>{t.common.retry}</button>
            <button onClick={openConnections}>{t.connections.label}</button>
          </div>
        </div>
      )}
      {(profile?.warning || storageWarning) && (
        <div className="data-banner compact-banner" role="status">
          <span>!</span>
          <p>
            {profile?.warning ||
              (storageWarning === "read" ? t.profile.storageRead : t.profile.storageSave)}
          </p>
        </div>
      )}
      {tab !== "tokens" && (pending.length > 0 || focus?.recoveryText) && (
        <div className="data-banner compact-banner profile-note">
          <span>◷</span>
          <p>{focus?.recoveryText || t.profile.pending(pending.length)}</p>
          {pending.length > 0 && (
            <button onClick={() => void syncFocus(true).then(load)}>{t.profile.syncNow}</button>
          )}
        </div>
      )}
      {tab !== "tokens" && recoveries.length > 0 && (
        <section className="profile-recovery-list card" aria-label={t.profile.interruptedAria}>
          <div className="section-heading">
            <div>
              <span className="label">{t.profile.interrupted}</span>
              <p>{t.profile.interruptedHint}</p>
            </div>
          </div>
          {recoveries.map((segment) => (
            <div className="profile-recovery" key={segment.segmentId}>
              <span>
                {segmentTime(segment.startedAt)} – {segmentTime(segment.endedAt)}{" "}
                <small>
                  {operationsTab && segment.operationId
                    ? `${operationTitle(segment.operationId)} · `
                    : ""}
                  {duration((Date.parse(segment.endedAt) - Date.parse(segment.startedAt)) / 1000)} ·{" "}
                  {segment.status === "confirmed" ? t.profile.addedByYou : t.profile.notCounted}
                </small>
              </span>
              {segment.status === "gap" ? (
                <>
                  <button
                    className="quiet-button"
                    onClick={() => void updateRecovery(segment, "confirmed")}
                  >
                    {t.profile.count}
                  </button>
                  <button
                    className="quiet-button"
                    onClick={() => void updateRecovery(segment, "dismissed")}
                  >
                    {t.profile.asBreak}
                  </button>
                </>
              ) : (
                <button
                  className="quiet-button"
                  onClick={() => void updateRecovery(segment, "gap")}
                >
                  {t.profile.undo}
                </button>
              )}
            </div>
          ))}
        </section>
      )}
      <div className="profile-overview card">
        <article className="profile-hero">
          <span className="label">{hero.label}</span>
          <strong title={hero.title}>{hero.value}</strong>
          {hero.note && <p>{hero.note}</p>}
          {operationsTab && (
            <button className="primary-button" onClick={() => openOperation()}>
              {t.profile.openOperations}
            </button>
          )}
          {tab === "focus" && (
            <button
              className="primary-button"
              onClick={() => (focus?.running ? focus.toggle() : startFocus())}
            >
              {focus?.running ? t.profile.pause : t.profile.start}
            </button>
          )}
        </article>
        <div className={`profile-metrics ${tab === "focus" ? "" : "two-up"}`}>
          {cards.map((card) => (
            <article key={card.label}>
              <span>{card.label}</span>
              <strong
                className={card.text ? "is-text" : undefined}
                title={card.text ? card.value : undefined}
              >
                {card.value}
              </strong>
              {card.note && <small>{card.note}</small>}
            </article>
          ))}
        </div>
      </div>
      <section className="profile-chart-card card">
        <div className="section-heading">
          <div>
            <span className="label">
              {
                {
                  focus: t.profile.focusActivity,
                  operations: t.profile.operationActivity,
                  tokens: t.profile.tokenActivity,
                }[tab]
              }
            </span>
          </div>
          <div className="profile-chart-controls">
            <div className="profile-segmented" aria-label={t.profile.grouping}>
              {(["daily", "weekly", "cumulative"] as const).map((item) => (
                <button
                  key={item}
                  aria-pressed={view === item}
                  onClick={() => {
                    setView(item);
                    setSelected(null);
                  }}
                >
                  {t.profile.views[item]}
                </button>
              ))}
            </div>
            <select
              aria-label={t.profile.range}
              value={ranges[tab]}
              onChange={(e) => {
                setRanges({ ...ranges, [tab]: e.target.value });
                setSelected(null);
              }}
            >
              {(["30d", "90d", "1y", "all"] as const).map((range) => (
                <option key={range} value={range}>
                  {t.profile.ranges[range]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="profile-chart-summary">
          <strong>{known ? format(series.total) : "—"}</strong>
          <span>
            {
              {
                focus: t.profile.inRangeFocus,
                operations: t.profile.inRangeOperations,
                tokens: t.profile.inRangeTokens,
              }[tab]
            }
          </span>
          <span className="profile-chart-readout" aria-live="polite">
            {selected
              ? `${dateLabel(selected.start || selected.date)}${selected.end ? ` – ${dateLabel(selected.end)}${selected.start !== selected.date || selected.end !== nextDay(selected.date, 6) ? t.profile.partialWeek : ""}` : ""} · ${format(selected.value)} · ${tab === "tokens" ? t.profile.requests(selected.count) : t.profile.segments(selected.count)}${selected.unknown ? ` · ${unknownLabel}` : ""}`
              : allZero
                ? {
                    focus: t.profile.noFocus,
                    operations: t.profile.noOperations,
                    tokens: t.profile.noAi,
                  }[tab]
                : ""}
          </span>
        </div>
        {view === "cumulative" ? (
          <div className="profile-chart">
            <div className="profile-chart-axis">
              <span>{format(max === 1 ? 0 : max)}</span>
              <span>{format(max === 1 ? 0 : max / 2)}</span>
              <span>0</span>
            </div>
            <div className="profile-plot">
              <div className="profile-gridlines">
                <i />
                <i />
                <i />
              </div>
              {!allZero && (
                <svg
                  className="profile-line"
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  preserveAspectRatio="none"
                  role="img"
                  aria-label={t.profile.cumulativeAria}
                >
                  <polygon
                    className="profile-line-fill"
                    points={`0,${chartHeight} ${linePoints} ${chartWidth},${chartHeight}`}
                  />
                  <polyline
                    className="profile-line-stroke"
                    points={linePoints}
                    fill="none"
                    strokeWidth="3"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              )}
              <div className="profile-line-targets">
                {series.buckets.map((bucket) => (
                  <button
                    key={bucket.date}
                    aria-label={bucketLabel(bucket)}
                    title={bucketTitle(bucket)}
                    onMouseEnter={() => setSelected(bucket)}
                    onFocus={() => setSelected(bucket)}
                    onClick={() => setSelected(bucket)}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="profile-heat-scroll">
            <div
              className={`profile-heat ${view}`}
              style={
                {
                  "--rows": perColumn,
                  "--columns": columns.length,
                } as React.CSSProperties
              }
            >
              {view === "daily" &&
                ["", t.profile.mon, "", t.profile.wed, "", t.profile.fri, "", ""].map(
                  (day, index) => (
                    <span key={index} aria-hidden="true">
                      {day}
                    </span>
                  ),
                )}
              {columns.map((column, index) => (
                <Fragment key={index}>
                  {column.cells.map((bucket, row) =>
                    typeof bucket === "string" ? (
                      <i key={row} className="untracked" title={t.profile.untracked(bucket)} />
                    ) : bucket ? (
                      <button
                        key={row}
                        className={`level-${level(bucket.value)} ${bucket.date === today ? "is-today" : ""} ${bucket.unknown ? "is-incomplete" : ""}`}
                        aria-label={bucketLabel(bucket)}
                        title={bucketTitle(bucket)}
                        onMouseEnter={() => setSelected(bucket)}
                        onFocus={() => setSelected(bucket)}
                        onClick={() => setSelected(bucket)}
                      />
                    ) : (
                      <i key={row} />
                    ),
                  )}
                  <span aria-hidden="true">{column.label}</span>
                </Fragment>
              ))}
            </div>
          </div>
        )}
        <footer className="profile-chart-footer">
          <span>
            {dateLabel(series.start)} – {dateLabel(series.end)} ·{" "}
            {tab === "tokens" && profile
              ? t.profile.coverage(profile.ai.reported, profile.ai.requests)
              : t.profile.trackedDays(series.calendarDays)}
            {pending.length > 0 && tab !== "tokens" ? t.profile.includesLocal : ""}
          </span>
          {view !== "cumulative" && (
            <span className="profile-heat-legend" aria-hidden="true">
              {t.profile.less}
              {[0, 1, 2, 3, 4].map((step) => (
                <i key={step} className={`level-${step}`} />
              ))}
              {t.profile.more}
            </span>
          )}
        </footer>
      </section>
      {operationsTab && ranked.length > 0 && (
        <div className="profile-effort">
          <section className="card" aria-label={t.profile.byType}>
            <span className="label">{t.profile.byType}</span>
            <ul className="profile-bars">
              {byType.map(([type, value]) => (
                <li
                  key={type || "unclassified"}
                  title={`${typeLabel(type)}: ${t.profile.seconds(Math.floor(value))}`}
                >
                  <span>{typeLabel(type)}</span>
                  <i style={{ "--share": value / topType[1] } as React.CSSProperties} />
                  <strong>
                    {duration(value)}
                    <small>{Math.round((value / rankedTotal) * 100)}%</small>
                  </strong>
                </li>
              ))}
            </ul>
          </section>
          <section className="card" aria-label={t.profile.topOperations}>
            <span className="label">{t.profile.topOperations}</span>
            <ul className="profile-bars long-names">
              {ranked.slice(0, 8).map((item) => {
                const record = records.get(item.operationId);
                return (
                  <li
                    key={item.operationId}
                    title={`${operationTitle(item.operationId)}: ${t.profile.seconds(Math.floor(item.value))}`}
                  >
                    <span>
                      {record ? (
                        <button className="profile-bar-link" onClick={() => openOperation(record)}>
                          {operationTitle(item.operationId)}
                        </button>
                      ) : (
                        operationTitle(item.operationId)
                      )}
                      <small>
                        {[
                          typeLabel(typeOf(item)),
                          record?.status && valueLabel(t.values.status, record.status),
                          t.profile.segments(item.count),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                    </span>
                    <i style={{ "--share": item.value / ranked[0].value } as React.CSSProperties} />
                    <strong>{duration(item.value)}</strong>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}
      <section className="profile-details">
        <div className="section-heading">
          <div>
            <p>{tab === "tokens" ? t.profile.aiDetails : t.profile.focusDetails}</p>
          </div>
          <button
            className="quiet-button"
            aria-expanded={details}
            onClick={() => setDetails(!details)}
          >
            {details ? t.profile.hideDetails : t.profile.viewDetails}
          </button>
        </div>
        {details && (
          <div className="profile-table-wrap card">
            <table>
              <thead>
                <tr>
                  <th scope="col">{t.profile.date}</th>
                  <th scope="col">
                    {tab === "tokens" ? t.profile.tokenColumn : t.profile.focusTime}
                  </th>
                  <th scope="col">
                    {tab === "tokens" ? t.profile.requestColumn : t.profile.segmentColumn}
                  </th>
                  {operationsTab && <th scope="col">{t.profile.operationColumn}</th>}
                  <th scope="col">{t.profile.status}</th>
                </tr>
              </thead>
              <tbody>
                {(activitySeries(rows, since, today, "daily", ranges[tab]).buckets as Day[])
                  .slice()
                  .reverse()
                  .map((row) => (
                    <tr key={row.date}>
                      <th scope="row">
                        {row.date}
                        {row.date === today ? t.profile.todaySuffix : ""}
                      </th>
                      <td>
                        {format(row.value)}
                        {tab === "focus" && row.count > 0 && (
                          <details className="profile-intervals">
                            <summary>{t.profile.intervals}</summary>
                            {allSegments
                              .filter(
                                (s) =>
                                  s.status !== "gap" &&
                                  s.status !== "dismissed" &&
                                  dayKey(s.startedAt, zone) <= row.date &&
                                  dayKey(s.endedAt, zone) >= row.date,
                              )
                              .map((s) => (
                                <p key={s.segmentId}>
                                  {segmentTime(s.startedAt)} – {segmentTime(s.endedAt)}
                                  {s.status === "confirmed" ? t.profile.addedSuffix : ""}
                                </p>
                              ))}
                          </details>
                        )}
                      </td>
                      <td>{row.count}</td>
                      {operationsTab && (
                        <td className="profile-day-operations">
                          {(operationsByDay.get(row.date) || []).map((item) => (
                            <p key={item.id} className="profile-day-operation">
                              {operationTitle(item.id)} · {duration(item.value)}
                            </p>
                          ))}
                        </td>
                      )}
                      <td>
                        {row.unknown
                          ? unknownLabel
                          : tab !== "tokens" &&
                              pending.some(
                                (s) =>
                                  dayKey(s.startedAt, zone) <= row.date &&
                                  dayKey(s.endedAt, zone) >= row.date,
                              )
                            ? t.profile.pendingSync
                            : row.date === today
                              ? t.profile.inProgress
                              : t.profile.recorded}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="profile-footnote">
        {
          {
            focus: t.profile.footnoteFocus,
            operations: t.profile.footnoteOperations,
            tokens: t.profile.footnoteAi,
          }[tab]
        }
      </p>
    </section>
  );
}
