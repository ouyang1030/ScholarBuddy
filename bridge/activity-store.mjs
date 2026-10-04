import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { activitySeries, dayKey, focusDays, streaks } from "../shared/activity.mjs";

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}
export function createActivityStore(directory, options = {}) {
  const clock = options.clock || (() => Date.now());
  let state,
    loading,
    initialized,
    tail = Promise.resolve(),
    warning = "";
  const file = path.join(directory, "activity-v1.json");
  async function load() {
    if (state) return state;
    if (!loading)
      loading = (async () => {
        try {
          const parsed = JSON.parse(await readFile(file, "utf8"));
          if (
            parsed.schemaVersion !== 1 ||
            !parsed.profile?.timeZone ||
            !parsed.ai ||
            !parsed.focus
          )
            throw new Error("Invalid activity ledger");
          state = parsed;
          for (const item of Object.values(state.ai))
            if (item.status === "started") {
              item.status = "interrupted";
              item.finishedAt = item.startedAt;
            }
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
          state = {
            schemaVersion: 1,
            profile: {
              bridgeId: randomUUID(),
              displayName: "Researcher",
              trackingSince: new Date(clock()).toISOString(),
              timeZone: options.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
            ai: {},
            focus: {},
          };
        }
        return state;
      })().catch((error) => {
        loading = null;
        warning = "Activity storage is unavailable. Totals may be incomplete.";
        throw error;
      });
    return loading;
  }
  function mutate(operation) {
    const result = tail.then(async () => {
      const current = await load();
      const draft = structuredClone(current);
      if (warning) draft.warning = warning;
      const value = operation(draft);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const temp = `${file}.${randomUUID()}.tmp`;
      await writeFile(temp, JSON.stringify(draft), { mode: 0o600 });
      await rename(temp, file);
      state = draft;
      return value;
    });
    tail = result.catch(() => {});
    return result;
  }
  async function snapshot() {
    await tail;
    return structuredClone(await load());
  }
  return {
    snapshot,
    async initialize() {
      if (!initialized)
        initialized = mutate(() => {}).catch((error) => {
          initialized = null;
          throw error;
        });
      await initialized;
    },
    async recordAI(item) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await mutate((draft) => {
            const old = draft.ai[item.requestId];
            if (!old || old.status === "started") draft.ai[item.requestId] = { ...old, ...item };
          });
          return;
        } catch {
          /* A transient disk failure gets one bounded retry. */
        }
      }
      warning = "Some AI activity could not be saved. Totals may be incomplete.";
    },
    async updateProfile(payload) {
      if (
        typeof payload?.displayName !== "string" ||
        !payload.displayName.trim() ||
        payload.displayName.length > 60 ||
        /[\x00-\x1f]/.test(payload.displayName)
      )
        throw invalid("Use a display name between 1 and 60 characters.");
      await mutate((draft) => {
        draft.profile.displayName = payload.displayName.trim();
      });
    },
    async saveFocus(payload) {
      if (!Array.isArray(payload?.events) || payload.events.length > 200)
        throw invalid("Send at most 200 focus events.");
      // One bad record is reported back on its own; it must not hold up the batch.
      const events = [],
        rejected = [];
      for (const event of payload.events) {
        const reject = (reason) =>
          rejected.push({
            segmentId: String(event?.segmentId ?? "").slice(0, 100),
            revision: Number.isSafeInteger(event?.revision) ? event.revision : null,
            reason,
          });
        if (
          !event ||
          typeof event.segmentId !== "string" ||
          !/^[\w-]{1,100}$/.test(event.segmentId) ||
          !Number.isSafeInteger(event.revision) ||
          event.revision < 1
        ) {
          reject("Invalid focus event.");
          continue;
        }
        const start = Date.parse(event.startedAt),
          end = Date.parse(event.endedAt || event.checkpointAt);
        if (
          !Number.isFinite(start) ||
          !Number.isFinite(end) ||
          start < Date.UTC(2020, 0, 1) ||
          end < start ||
          end > clock() + 60000 ||
          end - start > 7 * 86400000
        ) {
          reject("Invalid focus interval.");
          continue;
        }
        events.push({
          segmentId: event.segmentId,
          revision: event.revision,
          startedAt: new Date(start).toISOString(),
          endedAt: new Date(end).toISOString(),
          status: ["running", "saved", "gap", "confirmed", "dismissed"].includes(event.status)
            ? event.status
            : "saved",
        });
      }
      await mutate((draft) => {
        if (payload.bridgeId !== draft.profile.bridgeId)
          throw invalid("Focus records belong to a different Bridge.");
        for (const event of events)
          if (
            !draft.focus[event.segmentId] ||
            draft.focus[event.segmentId].revision < event.revision
          )
            draft.focus[event.segmentId] = event;
      });
      return {
        accepted: events.map(({ segmentId, revision }) => ({ segmentId, revision })),
        rejected,
      };
    },
    async identity() {
      return { bridgeId: (await snapshot()).profile.bridgeId };
    },
    async profile() {
      const data = await snapshot();
      const { timeZone } = data.profile;
      const today = dayKey(clock(), timeZone);
      const focus = focusDays(Object.values(data.focus), timeZone);
      const requests = Object.values(data.ai).filter((item) => item.status !== "started");
      const tokenDays = new Map(),
        conversations = new Map();
      for (const item of requests) {
        const date = dayKey(item.finishedAt, timeZone);
        const day = tokenDays.get(date) || { date, value: 0, count: 0, unknown: 0 };
        day.value += item.totalTokens ?? 0;
        day.count++;
        if (item.totalTokens == null) day.unknown++;
        tokenDays.set(date, day);
        const previous = conversations.get(item.conversationId) || [Date.parse(item.startedAt), 0];
        conversations.set(item.conversationId, [
          Math.min(previous[0], Date.parse(item.startedAt)),
          item.status === "success"
            ? Math.max(previous[1], Date.parse(item.finishedAt))
            : previous[1],
        ]);
      }
      const days = [...tokenDays.values()].sort((a, b) => a.date.localeCompare(b.date));
      const peak = (list) =>
        list.reduce((best, d) => (d.value > best.value ? d : best), { value: 0, date: null });
      return {
        ...data.profile,
        today,
        warning: warning || data.warning || "",
        focus: {
          total: focus.reduce((n, d) => n + d.value, 0),
          today: focus.find((d) => d.date === today)?.value || 0,
          peak: peak(focus),
          ...streaks(
            focus.filter((d) => d.value >= 60).map((d) => d.date),
            today,
          ),
          days: focus,
          segments: Object.values(data.focus),
        },
        ai: {
          total: days.reduce((n, d) => n + d.value, 0),
          peak: peak(days),
          longestChat: Math.max(0, ...[...conversations.values()].map(([a, b]) => (b - a) / 1000)),
          requests: requests.length,
          reported: requests.filter((d) => d.totalTokens != null).length,
          ...streaks(
            requests
              .filter((d) => d.status === "success")
              .map((d) => dayKey(d.finishedAt, timeZone)),
            today,
          ),
          days,
        },
      };
    },
    async series(metric, view, range) {
      if (
        !["tokens", "focus"].includes(metric) ||
        !["daily", "weekly", "cumulative"].includes(view) ||
        !["30d", "90d", "1y", "all"].includes(range)
      )
        throw invalid("Invalid activity filters.");
      const summary = await this.profile();
      const days = metric === "focus" ? summary.focus.days : summary.ai.days;
      const since = [
        dayKey(summary.trackingSince, summary.timeZone),
        ...days.map((d) => d.date),
      ].sort()[0];
      return activitySeries(days, since, summary.today, view, range);
    },
  };
}
