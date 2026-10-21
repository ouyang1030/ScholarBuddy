import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  dayKey,
  effortInRange,
  focusDays,
  activitySeries,
  operationEffort,
  streaks,
} from "../shared/activity.mjs";
import { createActivityStore } from "../bridge/activity-store.mjs";
import { normalizeUsage } from "../bridge/usage-normalizer.mjs";
import { modelResponse, streamDelta } from "../bridge/providers.mjs";
import { handle } from "../bridge/server.mjs";
const segment = (id, start, end, revision = 1) => ({
  segmentId: id,
  startedAt: start,
  endedAt: end,
  revision,
  status: "saved",
});
const now = Date.parse("2026-10-04T12:00:00Z");
async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "workbench-activity-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const options = { clock: () => now, timeZone: "Europe/Vienna" };
  const store = createActivityStore(directory, options);
  await store.initialize();
  return { store, directory, options, bridgeId: (await store.profile()).bridgeId };
}
test("focus splits midnight and unions overlapping browser intervals", () => {
  const rows = focusDays(
    [
      segment("a", "2026-10-03T21:40:00Z", "2026-10-03T22:20:00Z"),
      segment("b", "2026-10-03T22:00:00Z", "2026-10-03T22:30:00Z"),
    ],
    "Europe/Vienna",
  );
  assert.deepEqual(
    rows.map((d) => [d.date, d.value, d.count]),
    [
      ["2026-10-03", 1200, 1],
      ["2026-10-04", 1800, 2],
    ],
  );
});
test("focus counts actual seconds on 23 and 25 hour DST days", () => {
  assert.equal(
    focusDays(
      [segment("spring", "2026-03-28T23:00:00Z", "2026-03-29T22:00:00Z")],
      "Europe/Vienna",
    )[0].value,
    23 * 3600,
  );
  assert.equal(
    focusDays([segment("fall", "2026-10-24T22:00:00Z", "2026-10-25T23:00:00Z")], "Europe/Vienna")[0]
      .value,
    25 * 3600,
  );
});
test("operation effort splits by operation and day, and counts confirmed gaps", () => {
  const filed = (id, start, end, operationId, operationType, status = "saved") => ({
    ...segment(id, start, end),
    status,
    operationId,
    operationType,
  });
  const effort = operationEffort(
    [
      filed("a", "2026-10-03T21:40:00Z", "2026-10-03T22:20:00Z", "OPS-1", "Teaching"),
      filed("b", "2026-10-04T08:00:00Z", "2026-10-04T08:30:00Z", "OPS-1", "Admin"),
      filed("c", "2026-10-04T09:00:00Z", "2026-10-04T09:10:00Z", "OPS-2", undefined, "confirmed"),
      filed("d", "2026-10-04T10:00:00Z", "2026-10-04T11:00:00Z", "OPS-2", undefined, "gap"),
      segment("unfiled", "2026-10-04T12:00:00Z", "2026-10-04T13:00:00Z"),
    ],
    "Europe/Vienna",
  );
  assert.deepEqual(
    effort.map((item) => item.operationId),
    ["OPS-1", "OPS-2"],
  );
  // 21:40Z is 23:40 in Vienna, so the first session crosses local midnight.
  assert.deepEqual(
    effort[0].days.map((d) => [d.date, d.value]),
    [
      ["2026-10-03", 1200],
      ["2026-10-04", 3000],
    ],
  );
  assert.equal(effort[0].operationType, "Admin");
  assert.equal(effort[1].operationType, "");
  assert.equal(effort[1].days[0].unknown, 1);
  assert.deepEqual(
    effortInRange(effort, "2026-10-04", "2026-10-04").map((item) => [
      item.operationId,
      item.value,
      item.count,
    ]),
    [
      ["OPS-1", 3000, 2],
      ["OPS-2", 600, 1],
    ],
  );
  assert.deepEqual(
    effortInRange(effort, "2026-10-03", "2026-10-03").map((item) => [
      item.operationId,
      item.value,
      item.count,
    ]),
    [["OPS-1", 1200, 1]],
  );
});
test("streaks preserve yesterday until today finishes and break on a missing day", () => {
  assert.deepEqual(streaks(["2025-12-30", "2025-12-31", "2026-01-01"], "2026-01-02"), {
    current: 3,
    longest: 3,
  });
  assert.deepEqual(streaks(["2025-12-30", "2025-12-31", "2026-01-01"], "2026-01-03"), {
    current: 0,
    longest: 3,
  });
});
test("series includes zero days, consistent week totals and cumulative baseline", () => {
  const rows = [
    { date: "2026-08-01", value: 100, count: 1, unknown: 1 },
    { date: "2026-10-03", value: 200, count: 1, unknown: 0 },
  ];
  const daily = activitySeries(rows, "2026-08-01", "2026-10-04", "daily", "30d");
  const weekly = activitySeries(rows, "2026-08-01", "2026-10-04", "weekly", "30d");
  const cumulative = activitySeries(rows, "2026-08-01", "2026-10-04", "cumulative", "30d");
  assert.equal(daily.calendarDays, 30);
  assert.equal(daily.average, 200 / 30);
  assert.equal(
    weekly.buckets.reduce((n, d) => n + d.value, 0),
    daily.total,
  );
  // Weeks start on Sunday: 2026-10-04 opens its own week, 10-03 closes the one before.
  assert.equal(weekly.buckets.at(-1).date, "2026-10-04");
  assert.equal(weekly.buckets.at(-2).date, "2026-09-27");
  assert.equal(weekly.buckets.at(-2).value, 200);
  assert.equal(cumulative.buckets.at(-1).value, 300);
  assert.equal(cumulative.buckets[0].value, 100);
  assert.equal(cumulative.buckets.at(-1).unknown, 1);
});
test("provider normalization merges Claude frames without summing cumulative output", () => {
  const target = { adapter: "anthropic-messages" };
  const first = streamDelta(target, {
    type: "message_start",
    message: {
      usage: {
        input_tokens: 10,
        output_tokens: 1,
        cache_read_input_tokens: 20,
        cache_creation_input_tokens: 5,
      },
    },
  });
  const last = streamDelta(target, { type: "message_delta", usage: { output_tokens: 7 } });
  const result = normalizeUsage(target.adapter, { ...first.usage, ...last.usage });
  assert.equal(result.totalTokens, 42);
  assert.equal(result.inputTokens, 35);
  assert.equal(result.outputTokens, 7);
  assert.equal(
    normalizeUsage("responses", {
      input_tokens: 10,
      output_tokens: 20,
      total_tokens: 30,
      output_tokens_details: { reasoning_tokens: 15 },
    }).totalTokens,
    30,
  );
  assert.equal(
    normalizeUsage("gemini-generate-content", {
      promptTokenCount: 10,
      candidatesTokenCount: 20,
      thoughtsTokenCount: 5,
      totalTokenCount: 35,
    }).totalTokens,
    35,
  );
  assert.equal(normalizeUsage("responses", null).totalTokens, null);
});
test("ledger persists, rejects stale updates and deduplicates retries", async (t) => {
  const { store, directory, options, bridgeId } = await fixture(t);
  const event = segment("focus-one", "2026-10-04T08:00:00Z", "2026-10-04T08:25:00Z", 2);
  await Promise.all([
    store.saveFocus({ bridgeId, events: [event] }),
    store.saveFocus({ bridgeId, events: [event] }),
  ]);
  await store.saveFocus({
    bridgeId,
    events: [{ ...event, revision: 1, endedAt: "2026-10-04T08:10:00Z" }],
  });
  const restored = createActivityStore(directory, options);
  assert.equal((await restored.profile()).focus.total, 1500);
  assert.equal((await restored.profile()).focus.current, 1);
  assert.equal((await restored.profile()).bridgeId, bridgeId);
  await assert.rejects(store.saveFocus({ bridgeId: "wrong", events: [event] }), /different Bridge/);
  // One invalid record is reported on its own and does not block the rest of the batch.
  const good = segment("focus-two", "2026-10-04T09:00:00Z", "2026-10-04T09:05:00Z");
  const mixed = await store.saveFocus({
    bridgeId,
    events: [{ ...event, revision: 3, endedAt: "2030-01-01T00:00:00Z" }, good],
  });
  assert.deepEqual(mixed.accepted, [{ segmentId: "focus-two", revision: good.revision }]);
  assert.deepEqual(mixed.rejected, [
    { segmentId: "focus-one", revision: 3, reason: "Invalid focus interval." },
  ]);
  assert.equal((await store.profile()).focus.total, 1800);
  assert.deepEqual(await store.identity(), { bridgeId });
  await assert.rejects(store.saveFocus(null), /at most 200/);
  await assert.rejects(store.updateProfile(null), /display name/);
});
test("successful AI activity and cancelled usage have separate streak semantics", async (t) => {
  const { store } = await fixture(t);
  const base = {
    conversationId: "chat-one",
    startedAt: "2026-10-03T08:00:00Z",
    finishedAt: "2026-10-03T08:30:00Z",
    totalTokens: 100,
  };
  await store.recordAI({ ...base, requestId: "one", status: "success" });
  await store.recordAI({ ...base, requestId: "one", status: "success" });
  await store.recordAI({
    ...base,
    requestId: "two",
    status: "cancelled",
    finishedAt: "2026-10-04T08:30:00Z",
    totalTokens: 50,
  });
  await store.recordAI({ ...base, requestId: "three", status: "failed", totalTokens: null });
  const profile = await store.profile();
  assert.equal(profile.ai.total, 150);
  assert.equal(profile.ai.reported, 2);
  assert.equal(profile.ai.requests, 3);
  assert.equal(profile.ai.current, 1);
  assert.equal(profile.ai.longestChat, 1800);
});
test("restart marks unfinished AI calls unknown and corrupt files are not overwritten", async (t) => {
  const { store, directory, options } = await fixture(t);
  await store.recordAI({
    requestId: "unfinished",
    conversationId: "c",
    startedAt: "2026-10-04T08:00:00Z",
    status: "started",
  });
  const restored = createActivityStore(directory, options);
  await restored.initialize();
  assert.equal((await restored.profile()).ai.reported, 0);
  assert.equal((await restored.profile()).ai.requests, 1);
  const file = path.join(directory, "activity-v1.json");
  await writeFile(file, '{"broken":true}');
  const broken = createActivityStore(directory, options);
  await assert.rejects(broken.initialize());
  await assert.rejects(broken.initialize());
  assert.equal(await readFile(file, "utf8"), '{"broken":true}');
});
test("profile routes require pairing and persist focus without a vault or Calendar", async (t) => {
  const { directory } = await fixture(t);
  const origin = "http://localhost:3000",
    token = "test-activity-token-with-at-least-32-characters";
  const config = {
    SCHOLARBUDDY_ORIGINS: origin,
    _bridgeToken: token,
    _activityDirectory: directory,
  };
  const request = (route, init = {}) =>
    new Request(`http://127.0.0.1:32145${route}`, {
      ...init,
      headers: {
        Origin: origin,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  assert.equal(
    (
      await handle(
        new Request("http://127.0.0.1:32145/profile", { headers: { Origin: origin } }),
        config,
      )
    ).status,
    401,
  );
  const profile = await (await handle(request("/profile"), config)).json();
  const post = await handle(
    request("/profile/focus/events", {
      method: "POST",
      body: JSON.stringify({
        bridgeId: profile.bridgeId,
        events: [segment("http-focus", "2026-10-03T08:00:00Z", "2026-10-03T09:00:00Z")],
      }),
    }),
    config,
  );
  assert.equal(post.status, 200);
  const result = await (await handle(request("/profile"), config)).json();
  assert.equal(result.focus.total, 3600);
  assert.equal(dayKey("2026-10-03T23:00:00Z", "Europe/Vienna"), "2026-10-04");
});

test("ledger keeps a session's operation link and drops a malformed one, not its time", async (t) => {
  const { store, bridgeId } = await fixture(t);
  await store.saveFocus({
    bridgeId,
    events: [
      {
        ...segment("filed", "2026-10-04T08:00:00Z", "2026-10-04T08:25:00Z"),
        operationId: "OPS-001",
        operationType: "Teaching",
      },
      {
        ...segment("malformed", "2026-10-04T09:00:00Z", "2026-10-04T09:25:00Z"),
        operationId: "../OPS-001",
        operationType: "Line\nbreak",
      },
      {
        ...segment("custom", "2026-10-04T10:00:00Z", "2026-10-04T10:10:00Z"),
        operationId: "OPS-002",
        operationType: "Mentoring",
      },
    ],
  });
  const { focus } = await store.profile();
  const byId = Object.fromEntries(focus.segments.map((s) => [s.segmentId, s]));
  assert.equal(byId.filed.operationId, "OPS-001");
  assert.equal(byId.filed.operationType, "Teaching");
  assert.equal("operationId" in byId.malformed, false);
  assert.equal("operationType" in byId.malformed, false);
  // A type typed by hand, outside the built-in list, survives for deleted records.
  assert.equal(byId.custom.operationType, "Mentoring");
  assert.equal(focus.total, 3600);
});

test("interruption gaps stay unknown until confirmed and can be undone", async (t) => {
  const { store, bridgeId } = await fixture(t);
  const gap = {
    ...segment("gap-one", "2026-10-04T08:00:00Z", "2026-10-04T09:00:00Z"),
    status: "gap",
  };
  await store.saveFocus({ bridgeId, events: [gap] });
  let profile = await store.profile();
  assert.equal(profile.focus.total, 0);
  assert.equal(profile.focus.days[0].unknown, 1);
  assert.equal(profile.focus.current, 0);
  await store.saveFocus({ bridgeId, events: [{ ...gap, revision: 2, status: "confirmed" }] });
  profile = await store.profile();
  assert.equal(profile.focus.total, 3600);
  assert.equal(profile.focus.current, 1);
  await store.saveFocus({ bridgeId, events: [{ ...gap, revision: 3, status: "gap" }] });
  assert.equal((await store.profile()).focus.total, 0);
  await store.saveFocus({ bridgeId, events: [{ ...gap, revision: 4, status: "dismissed" }] });
  assert.equal((await store.profile()).focus.days.length, 0);
});

test("profile preflight allows display-name updates", async (t) => {
  const { directory } = await fixture(t);
  const origin = "http://localhost:3000";
  const response = await handle(
    new Request("http://127.0.0.1:32145/profile", {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "PATCH" },
    }),
    {
      SCHOLARBUDDY_ORIGINS: origin,
      _bridgeToken: "test-activity-token-with-at-least-32-characters",
      _activityDirectory: directory,
    },
  );
  assert.equal(response.status, 204);
  assert.match(response.headers.get("Access-Control-Allow-Methods"), /PATCH/);
});

test("Gemini missing totals remain unknown rather than fabricated zero", () => {
  const target = { adapter: "gemini-generate-content" };
  const response = modelResponse(target, {
    candidates: [{ content: { parts: [{ text: "Hello" }] } }],
    usageMetadata: { promptTokenCount: 10 },
  });
  assert.equal(normalizeUsage(target.adapter, response.usage).totalTokens, null);
  const delta = streamDelta(target, {
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 2 },
  });
  assert.equal(normalizeUsage(target.adapter, delta.usage).totalTokens, 17);
});
