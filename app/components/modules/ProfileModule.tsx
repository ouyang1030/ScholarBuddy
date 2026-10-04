"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { bridgeFetch } from "../../lib/bridge-client";
import {
  focusStorageError,
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
function duration(seconds: number) {
  if (seconds > 0 && seconds < 60) return "<1m";
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}
function tokens(value: number) {
  if (value >= 1e9) return `${Number((value / 1e9).toFixed(1))}bn`;
  if (value >= 1e6) return `${Number((value / 1e6).toFixed(1))}m`;
  if (value >= 1e3) return `${Number((value / 1e3).toFixed(1))}k`;
  return value.toLocaleString();
}
const daysLabel = (value: number) => `${value} ${value === 1 ? "day" : "days"}`;
const monthLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en", { month: "short", timeZone: "UTC" });
const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

export function ProfileModule({
  openConnections,
  startFocus,
}: {
  openConnections: () => void;
  startFocus: () => void;
}) {
  const [tab, setTab] = useState<"focus" | "tokens">("focus");
  const [view, setView] = useState<"daily" | "weekly" | "cumulative">("daily");
  const [ranges, setRanges] = useState({ focus: "1y", tokens: "1y" });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [local, setLocal] = useState<FocusSegment[]>([]);
  const [storageWarning, setStorageWarning] = useState("");
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
        throw new Error(
          response.status === 404
            ? "Restart your local Bridge to enable Profile."
            : response.status === 401
              ? "Pair this browser to see your saved activity."
              : "Your activity could not be loaded.",
        );
      const body = (await response.json()) as Profile;
      setProfile(body);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Local Bridge is unavailable.");
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
          if (!cancelled) setStorageWarning("Local Focus history is unavailable.");
        });
      setStorageWarning(focusStorageError());
    };
    const refresh = () => {
      void load();
      read();
    };
    refresh();
    window.addEventListener("workbuddy-focus-ledger", read);
    window.addEventListener("workbuddy-profile-refresh", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("workbuddy-focus-ledger", read);
      window.removeEventListener("workbuddy-profile-refresh", refresh);
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
    new Date(value).toLocaleString("en", {
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
            label: "Total focus",
            value: profile ? duration(profile.focus.total) : "—",
            note: "Saved on this Mac",
          },
          {
            label: "Daily average",
            value: known ? duration(series.average) : "—",
            note: "Selected range · includes today",
          },
          {
            label: "Best focus day",
            value: profile?.focus.peak.date ? duration(profile.focus.peak.value) : "—",
            note: profile?.focus.peak.date
              ? dateLabel(profile.focus.peak.date)
              : "Your personal best awaits",
          },
          {
            label: "Current focus streak",
            value: profile ? daysLabel(profile.focus.current) : "—",
            note: "At least 1 minute each day",
          },
          {
            label: "Longest focus streak",
            value: profile ? daysLabel(profile.focus.longest) : "—",
            note: "Your longest run",
          },
        ]
      : [
          {
            label: "Peak tokens",
            value: tokenValue(profile?.ai.peak.value || 0),
            note: profile?.ai.peak.date
              ? `In one day · ${dateLabel(profile.ai.peak.date)}`
              : "In one day",
          },
          {
            label: "Longest chat",
            value: profile?.ai.longestChat ? duration(profile.ai.longestChat) : "—",
            note: "First request to last reply",
          },
          {
            label: "Current streak",
            value: profile ? daysLabel(profile.ai.current) : "—",
            note: "Days with a successful reply",
          },
          {
            label: "Longest streak",
            value: profile ? daysLabel(profile.ai.longest) : "—",
            note: "Your longest AI activity run",
          },
        ];
  const displayName = profile?.displayName || "Researcher";
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
      if (!response.ok) throw new Error(body.error || "Name could not be saved.");
      setProfile(body);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Name could not be saved.");
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
  const bucketLabel = (bucket: Day) =>
    `${bucket.start || bucket.date}${bucket.end ? ` to ${bucket.end}` : ""}: ${format(bucket.value)}${bucket.unknown ? (tab === "focus" ? ", time unconfirmed" : ", usage incomplete") : ""}`;
  const bucketTitle = (bucket: Day) =>
    `${bucket.start || bucket.date}: ${tab === "focus" ? Math.floor(bucket.value) + " seconds" : bucket.value.toLocaleString() + " tokens"}`;
  return (
    <section className="profile-page" aria-label="Personal activity profile">
      <section className="page-intro compact">
        <div>
          <p className="eyebrow">YOUR RESEARCH, OVER TIME</p>
          <h1>
            Small steps. <em>Lasting progress.</em>
          </h1>
          <p>A little perspective on the work you put in.</p>
        </div>
        <span className="status-pill mint">
          <i />
          This Mac
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
          {!profile && loading && <p>Connecting to your local history…</p>}
        </div>
        {editing ? (
          <form className="profile-name-form" onSubmit={saveName}>
            <input
              aria-label="Display name"
              value={name}
              maxLength={60}
              required
              onChange={(e) => setName(e.target.value)}
            />
            <button className="primary-button small" disabled={saving} type="submit">
              Save
            </button>
            <button className="quiet-button" type="button" onClick={() => setEditing(false)}>
              Cancel
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
            Edit name
          </button>
        )}
      </div>
      <div className="profile-tabs" role="tablist" aria-label="Activity type">
        <button
          role="tab"
          aria-selected={tab === "focus"}
          onClick={() => {
            setTab("focus");
            setSelected(null);
          }}
        >
          Focus
        </button>
        <button
          role="tab"
          aria-selected={tab === "tokens"}
          onClick={() => {
            setTab("tokens");
            setSelected(null);
          }}
        >
          AI activity
        </button>
      </div>
      {error && (
        <div className="data-banner compact-banner" role="status">
          <span>!</span>
          <p>
            {error}
            {profile
              ? " Showing the last loaded history."
              : " Focus can still be recorded locally."}
          </p>
          <div>
            <button onClick={() => void load()}>Retry</button>
            <button onClick={openConnections}>Connections</button>
          </div>
        </div>
      )}
      {(profile?.warning || storageWarning) && (
        <div className="data-banner compact-banner" role="status">
          <span>!</span>
          <p>{profile?.warning || storageWarning}</p>
        </div>
      )}
      {tab === "focus" && (pending.length > 0 || focus?.recoveryMessage) && (
        <div className="data-banner compact-banner profile-note">
          <span>◷</span>
          <p>
            {focus?.recoveryMessage ||
              `${pending.length} focus segment${pending.length === 1 ? "" : "s"} pending sync. Local time is included below.`}
          </p>
          {pending.length > 0 && (
            <button onClick={() => void syncFocus(true).then(load)}>Sync local focus</button>
          )}
        </div>
      )}
      {tab === "focus" && recoveries.length > 0 && (
        <section className="profile-recovery-list card" aria-label="Interrupted focus time">
          <div className="section-heading">
            <div>
              <span className="label">INTERRUPTED TIME</span>
              <p>Only add a gap if you were focusing during that time.</p>
            </div>
          </div>
          {recoveries.map((segment) => (
            <div className="profile-recovery" key={segment.segmentId}>
              <span>
                {segmentTime(segment.startedAt)} – {segmentTime(segment.endedAt)}{" "}
                <small>
                  {duration((Date.parse(segment.endedAt) - Date.parse(segment.startedAt)) / 1000)} ·{" "}
                  {segment.status === "confirmed" ? "Added by you" : "Not counted"}
                </small>
              </span>
              {segment.status === "gap" ? (
                <>
                  <button
                    className="quiet-button"
                    onClick={() => void updateRecovery(segment, "confirmed")}
                  >
                    Count this time
                  </button>
                  <button
                    className="quiet-button"
                    onClick={() => void updateRecovery(segment, "dismissed")}
                  >
                    Treat as break
                  </button>
                </>
              ) : (
                <button
                  className="quiet-button"
                  onClick={() => void updateRecovery(segment, "gap")}
                >
                  Undo addition
                </button>
              )}
            </div>
          ))}
        </section>
      )}
      <div className="profile-overview card">
        <article className="profile-hero">
          <span className="label">{tab === "focus" ? "TODAY’S FOCUS" : "LIFETIME TOKENS"}</span>
          <strong
            title={
              tab === "focus"
                ? `${Math.floor(todaySeconds)} seconds`
                : `${profile?.ai.total ?? 0} tokens`
            }
          >
            {tab === "focus"
              ? known
                ? duration(todaySeconds)
                : "—"
              : tokenValue(profile?.ai.total || 0)}
          </strong>
          <p>
            {tab === "focus"
              ? focus?.running
                ? "Recording · one step at a time"
                : "Time made for what matters."
              : unknownAI
                ? "Known usage · some requests did not report tokens"
                : "Across your Workbench AI workflows."}
          </p>
          {tab === "focus" && (
            <button
              className="primary-button"
              onClick={() => (focus?.running ? focus.toggle() : startFocus())}
            >
              {focus?.running ? "Pause focus" : "Start a focus session"}
            </button>
          )}
        </article>
        <div className={`profile-metrics ${tab === "tokens" ? "ai-metrics" : ""}`}>
          {cards.map((card) => (
            <article key={card.label}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.note}</small>
            </article>
          ))}
        </div>
      </div>
      <section className="profile-chart-card card">
        <div className="section-heading">
          <div>
            <span className="label">THE BIGGER PICTURE</span>
            <p>{tab === "focus" ? "Focus activity" : "Token activity"}</p>
          </div>
          <div className="profile-chart-controls">
            <div className="profile-segmented" aria-label="Chart grouping">
              {(["daily", "weekly", "cumulative"] as const).map((item) => (
                <button
                  key={item}
                  aria-pressed={view === item}
                  onClick={() => {
                    setView(item);
                    setSelected(null);
                  }}
                >
                  {item[0].toUpperCase() + item.slice(1)}
                </button>
              ))}
            </div>
            <select
              aria-label="Activity date range"
              value={ranges[tab]}
              onChange={(e) => {
                setRanges({ ...ranges, [tab]: e.target.value });
                setSelected(null);
              }}
            >
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="1y">Last year</option>
              <option value="all">All time</option>
            </select>
          </div>
        </div>
        <div className="profile-chart-summary">
          <strong>{known ? format(series.total) : "—"}</strong>
          <span>{tab === "focus" ? "of focus" : "tokens"} in this range</span>
          <span className="profile-chart-readout" aria-live="polite">
            {selected
              ? `${dateLabel(selected.start || selected.date)}${selected.end ? ` – ${dateLabel(selected.end)}${selected.start !== selected.date || selected.end !== nextDay(selected.date, 6) ? " (partial week)" : ""}` : ""} · ${format(selected.value)} · ${selected.count} ${tab === "focus" ? "segments" : "requests"}${selected.unknown ? (tab === "focus" ? " · time unconfirmed" : " · incomplete usage") : ""}`
              : allZero
                ? tab === "focus"
                  ? "Start a focus session and watch your days take shape."
                  : "Your next AI workflow will start your activity."
                : tab === "focus"
                  ? "Every focused minute adds up."
                  : "Usage reported by your models."}
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
                  aria-label="Cumulative activity"
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
                ["", "Mon", "", "Wed", "", "Fri", "", ""].map((day, index) => (
                  <span key={index} aria-hidden="true">
                    {day}
                  </span>
                ))}
              {columns.map((column, index) => (
                <Fragment key={index}>
                  {column.cells.map((bucket, row) =>
                    typeof bucket === "string" ? (
                      <i key={row} className="untracked" title={`${bucket}: not tracked yet`} />
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
              ? `Usage coverage: ${profile.ai.reported}/${profile.ai.requests} requests`
              : `${series.calendarDays} tracked ${series.calendarDays === 1 ? "day" : "days"}`}
            {pending.length > 0 && tab === "focus" ? " · includes local records" : ""}
          </span>
          {view !== "cumulative" && (
            <span className="profile-heat-legend" aria-hidden="true">
              Less
              {[0, 1, 2, 3, 4].map((step) => (
                <i key={step} className={`level-${step}`} />
              ))}
              More
            </span>
          )}
        </footer>
      </section>
      <section className="profile-details">
        <div className="section-heading">
          <div>
            <p>{tab === "focus" ? "Your days, in detail" : "Activity details"}</p>
            <small>
              {tab === "focus"
                ? "Time recorded, one day at a time. Today is still in progress."
                : "Missing usage stays unknown. Historical usage before tracking is not estimated."}
            </small>
          </div>
          <button
            className="quiet-button"
            aria-expanded={details}
            onClick={() => setDetails(!details)}
          >
            {details ? "Hide details" : "View details"}
          </button>
        </div>
        {details && (
          <div className="profile-table-wrap card">
            <table>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">{tab === "focus" ? "Focus time" : "Tokens"}</th>
                  <th scope="col">{tab === "focus" ? "Segments" : "Requests"}</th>
                  <th scope="col">Status</th>
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
                        {row.date === today ? " · Today" : ""}
                      </th>
                      <td>
                        {format(row.value)}
                        {tab === "focus" && row.count > 0 && (
                          <details className="profile-intervals">
                            <summary>View intervals</summary>
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
                                  {s.status === "confirmed" ? " · added by you" : ""}
                                </p>
                              ))}
                          </details>
                        )}
                      </td>
                      <td>{row.count}</td>
                      <td>
                        {row.unknown
                          ? tab === "focus"
                            ? "Time unconfirmed"
                            : "Usage incomplete"
                          : tab === "focus" &&
                              pending.some(
                                (s) =>
                                  dayKey(s.startedAt, zone) <= row.date &&
                                  dayKey(s.endedAt, zone) >= row.date,
                              )
                            ? "Pending sync"
                            : row.date === today
                              ? "In progress"
                              : "Recorded"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="profile-footnote">
        Private by design. Activity stays on this Mac.{" "}
        {tab === "focus"
          ? "Focus measures timer time; one minute makes an active day."
          : "AI streaks count days with a successful reply."}
      </p>
    </section>
  );
}
