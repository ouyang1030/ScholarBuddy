// Pure aggregation shared by the Bridge, local Focus overlay, and tests.
export function dayKey(time, timeZone = "UTC") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(time));
}
export function nextDay(day, offset = 1) {
  return new Date(Date.parse(`${day}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
}
export function unionIntervals(intervals) {
  const result = [];
  for (const [start, end] of intervals
    .filter(([a, b]) => Number.isFinite(a) && b > a)
    .sort((a, b) => a[0] - b[0])) {
    const last = result.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else result.push([start, end]);
  }
  return result;
}
export function focusDays(segments, timeZone) {
  const days = new Map();
  const ids = new Map();
  const unknown = new Map();
  for (const segment of segments) {
    if (segment.status === "dismissed") continue;
    let start = Date.parse(segment.startedAt);
    const end = Date.parse(segment.endedAt || segment.checkpointAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    while (start < end) {
      const day = dayKey(start, timeZone);
      // Find the first millisecond of the next local date, including DST days.
      let lo = start + 1,
        hi = Math.min(end, start + 27 * 3600000);
      if (dayKey(hi - 1, timeZone) !== day) {
        while (lo < hi) {
          const mid = Math.floor((lo + hi) / 2);
          if (dayKey(mid, timeZone) === day) lo = mid + 1;
          else hi = mid;
        }
        hi = lo;
      }
      const parts = days.get(day) || [];
      if (segment.status === "gap") unknown.set(day, (unknown.get(day) || 0) + 1);
      else parts.push([start, hi]);
      days.set(day, parts);
      const set = ids.get(day) || new Set();
      if (segment.status !== "gap") set.add(segment.segmentId);
      ids.set(day, set);
      start = hi;
    }
  }
  return [...days]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, intervals]) => ({
      date,
      value: unionIntervals(intervals).reduce((n, [a, b]) => n + (b - a) / 1000, 0),
      count: ids.get(date).size,
      unknown: unknown.get(date) || 0,
    }));
}
export function streaks(dates, today) {
  const sorted = [...new Set(dates)].sort();
  let longest = 0,
    run = 0,
    previous = "";
  for (const date of sorted) {
    run = previous && nextDay(previous) === date ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }
  const set = new Set(sorted);
  let cursor = set.has(today) ? today : nextDay(today, -1),
    current = 0;
  while (set.has(cursor)) {
    current++;
    cursor = nextDay(cursor, -1);
  }
  return { current, longest };
}
export function activitySeries(days, since, today, view = "daily", range = "30d") {
  const count = { "30d": 30, "90d": 90, "1y": 365 }[range];
  const start = count ? [since, nextDay(today, 1 - count)].sort().at(-1) : since;
  const byDate = new Map(days.map((d) => [d.date, d]));
  const result = [];
  let cumulative = days.filter((d) => d.date < start).reduce((n, d) => n + d.value, 0);
  let cumulativeUnknown = days.filter((d) => d.date < start).reduce((n, d) => n + d.unknown, 0);
  let total = 0,
    calendarDays = 0;
  for (let date = start; date <= today; date = nextDay(date)) {
    const item = byDate.get(date) || { date, value: 0, count: 0, unknown: 0 };
    total += item.value;
    cumulative += item.value;
    cumulativeUnknown += item.unknown;
    calendarDays++;
    if (view === "weekly") {
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      // Weeks run Sunday to Saturday, matching the activity grid.
      const week = nextDay(date, -weekday);
      const last = result.at(-1);
      if (last?.date === week) {
        last.value += item.value;
        last.count += item.count;
        last.unknown += item.unknown;
        last.end = date;
      } else result.push({ ...item, date: week, start: date, end: date });
    } else
      result.push({
        ...item,
        value: view === "cumulative" ? cumulative : item.value,
        unknown: view === "cumulative" ? cumulativeUnknown : item.unknown,
      });
  }
  return {
    buckets: result,
    total,
    average: calendarDays ? total / calendarDays : 0,
    calendarDays,
    start,
    end: today,
  };
}
