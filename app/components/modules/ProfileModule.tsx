"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  BridgeFailure,
  bridgeFailure,
  failureText,
  useLocale,
  useT,
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
import { useFocus } from "../panels/FocusPanel";
import { activitySeries, dayKey, focusDays, nextDay } from "../../../shared/activity.mjs";

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
}: {
  openConnections: () => void;
  startFocus: () => void;
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
  const [tab, setTab] = useState<"focus" | "tokens">("focus");
  const [view, setView] = useState<"daily" | "weekly" | "cumulative">("daily");
  const [ranges, setRanges] = useState({ focus: "1y", tokens: "1y" });
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
  const pending = visibleLocal.filter((s) => s.syncedRevision !== s.revision);
  const merged = new Map((profile?.focus.segments || []).map((s) => [s.segmentId, s]));
  for (const segment of visibleLocal) {
    const old = merged.get(segment.segmentId);
    if (!old || segment.revision >= old.revision) merged.set(segment.segmentId, segment);
  }
  const live = focus?.ledgerRef.current;
  if (live && focus?.running) {
    const cap = focus.plannedMinutes
      ? Date.parse(live.startedAt) + Math.max(0, focus.plannedMinutes * 60 - focus.elapsed) * 1000
      : Infinity;
    merged.set(live.segmentId, {
      ...live,
      endedAt: new Date(Math.min(focus.now.getTime(), cap)).toISOString(),
    });
  }
  const allSegments = [...merged.values()];
  const recoveries = allSegments.filter((s) => ["gap", "confirmed"].includes(s.status));
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
  const rows = tab === "focus" ? dailyFocus : profile?.ai.days || [];
  const since = [
    profile ? dayKey(profile.trackingSince, zone) : today,
    ...rows.map((d) => d.date),
  ].sort()[0];
  const series = activitySeries(rows, since, today, view, ranges[tab]) as {
    buckets: Day[];
    total: number;
    average: number;
    calendarDays: number;
    start: string;
    end: string;
  };
  const format = tab === "focus" ? duration : tokens;
  const known = !!profile || (tab === "focus" && dailyFocus.length > 0);
  const todaySeconds = dailyFocus.find((d) => d.date === today)?.value || 0;
  const unknownAI = !!profile && profile.ai.reported < profile.ai.requests;
  const tokenValue = (value: number) =>
    profile && (profile.ai.reported > 0 || !profile.ai.requests) ? tokens(value) : "—";
  const cards =
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
  const unknownLabel = tab === "focus" ? t.profile.timeUnconfirmed : t.profile.usageIncomplete;
  const bucketLabel = (bucket: Day) =>
    `${bucket.end ? t.profile.between(bucket.start || bucket.date, bucket.end) : bucket.start || bucket.date}: ${format(bucket.value)}${bucket.unknown ? ` · ${unknownLabel}` : ""}`;
  const bucketTitle = (bucket: Day) =>
    `${bucket.start || bucket.date}: ${tab === "focus" ? t.profile.seconds(Math.floor(bucket.value)) : t.profile.tokens(bucket.value.toLocaleString(DATE_TAGS[locale]))}`;
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
        <button
          role="tab"
          aria-selected={tab === "focus"}
          onClick={() => {
            setTab("focus");
            setSelected(null);
          }}
        >
          {t.profile.focus}
        </button>
        <button
          role="tab"
          aria-selected={tab === "tokens"}
          onClick={() => {
            setTab("tokens");
            setSelected(null);
          }}
        >
          {t.profile.ai}
        </button>
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
      {tab === "focus" && (pending.length > 0 || focus?.recoveryText) && (
        <div className="data-banner compact-banner profile-note">
          <span>◷</span>
          <p>{focus?.recoveryText || t.profile.pending(pending.length)}</p>
          {pending.length > 0 && (
            <button onClick={() => void syncFocus(true).then(load)}>{t.profile.syncNow}</button>
          )}
        </div>
      )}
      {tab === "focus" && recoveries.length > 0 && (
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
          <span className="label">
            {tab === "focus" ? t.profile.todayFocus : t.profile.lifetimeTokens}
          </span>
          <strong
            title={
              tab === "focus"
                ? t.profile.seconds(Math.floor(todaySeconds))
                : t.profile.tokens(String(profile?.ai.total ?? 0))
            }
          >
            {tab === "focus"
              ? known
                ? duration(todaySeconds)
                : "—"
              : tokenValue(profile?.ai.total || 0)}
          </strong>
          {tab === "focus"
            ? focus?.running && <p>{t.profile.recording}</p>
            : unknownAI && <p>{t.profile.knownUsage}</p>}
          {tab === "focus" && (
            <button
              className="primary-button"
              onClick={() => (focus?.running ? focus.toggle() : startFocus())}
            >
              {focus?.running ? t.profile.pause : t.profile.start}
            </button>
          )}
        </article>
        <div className={`profile-metrics ${tab === "tokens" ? "ai-metrics" : ""}`}>
          {cards.map((card) => (
            <article key={card.label}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              {card.note && <small>{card.note}</small>}
            </article>
          ))}
        </div>
      </div>
      <section className="profile-chart-card card">
        <div className="section-heading">
          <div>
            <span className="label">
              {tab === "focus" ? t.profile.focusActivity : t.profile.tokenActivity}
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
          <span>{tab === "focus" ? t.profile.inRangeFocus : t.profile.inRangeTokens}</span>
          <span className="profile-chart-readout" aria-live="polite">
            {selected
              ? `${dateLabel(selected.start || selected.date)}${selected.end ? ` – ${dateLabel(selected.end)}${selected.start !== selected.date || selected.end !== nextDay(selected.date, 6) ? t.profile.partialWeek : ""}` : ""} · ${format(selected.value)} · ${tab === "focus" ? t.profile.segments(selected.count) : t.profile.requests(selected.count)}${selected.unknown ? ` · ${unknownLabel}` : ""}`
              : allZero
                ? tab === "focus"
                  ? t.profile.noFocus
                  : t.profile.noAi
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
            {pending.length > 0 && tab === "focus" ? t.profile.includesLocal : ""}
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
      <section className="profile-details">
        <div className="section-heading">
          <div>
            <p>{tab === "focus" ? t.profile.focusDetails : t.profile.aiDetails}</p>
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
                    {tab === "focus" ? t.profile.focusTime : t.profile.tokenColumn}
                  </th>
                  <th scope="col">
                    {tab === "focus" ? t.profile.segmentColumn : t.profile.requestColumn}
                  </th>
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
                      <td>
                        {row.unknown
                          ? unknownLabel
                          : tab === "focus" &&
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
        {tab === "focus" ? t.profile.footnoteFocus : t.profile.footnoteAi}
      </p>
    </section>
  );
}
