import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  reminderCandidates,
  dueReminders,
  reminderNotification,
  monthBefore,
  dateKey,
} from "../bridge/reminder-rules.mjs";
import { createReminderService } from "../bridge/reminders.mjs";
import { handle } from "../bridge/server.mjs";
process.env.TZ = "Europe/Vienna";
const settings = { enabled: true, calendar: true, operations: true };
const operation = {
  id: "OPS-1",
  title: "Submit abstract",
  status: "Planned",
  dueDate: "2026-10-15",
};

test("month reminder clamps month ends and preserves leap years", () => {
  assert.equal(dateKey(monthBefore(new Date(2026, 2, 31))), "2026-02-28");
  assert.equal(dateKey(monthBefore(new Date(2024, 2, 31))), "2024-02-29");
  assert.equal(dateKey(monthBefore(new Date(2026, 0, 31))), "2025-12-31");
});
test("calendar is exactly 24 elapsed hours before across DST; all-day uses previous local 09:00", () => {
  const events = [
    { id: "repeat", title: "Meeting", start: "2026-03-29T10:00:00+02:00", calendar: "Work" },
    {
      id: "all-day",
      title: "Away",
      start: "2026-03-29T00:00:00+01:00",
      allDay: true,
      calendar: "Work",
    },
  ];
  const candidates = reminderCandidates({
    settings,
    events,
    now: new Date("2026-03-27T10:00:00+01:00"),
  });
  assert.equal(candidates[0].when, +new Date(events[0].start) - 86_400_000);
  assert.equal(new Date(candidates[1].when).getHours(), 9);
  assert.equal(dateKey(new Date(candidates[1].when)), "2026-03-28");
});
test("only operations with valid upcoming dates and open status are eligible", () => {
  const operations = [
    operation,
    ...["Done", "Archived", "Completed", "Dropped"].map((status) => ({ ...operation, status })),
    { ...operation, dueDate: "2026-02-30" },
    { ...operation, dueDate: "" },
  ];
  const result = reminderCandidates({
    settings,
    operations,
    now: new Date("2026-10-14T10:00:00+02:00"),
  });
  assert.equal(result.length, 3);
  assert.equal(
    reminderCandidates({ settings, operations, now: new Date("2026-10-16T00:00:00+02:00") }).length,
    0,
  );
  assert.equal(
    reminderCandidates({ settings: { ...settings, enabled: false }, operations }).length,
    0,
  );
  assert.equal(
    reminderCandidates({ settings: { ...settings, operations: false }, operations }).length,
    0,
  );
});
test("missed nodes collapse to one item and future nodes still fire", () => {
  const now = new Date("2026-10-10T10:00:00+02:00");
  const all = reminderCandidates({ settings, operations: [operation], now });
  const due = dueReminders(all, {}, now);
  assert.equal(due.length, 2);
  const notification = reminderNotification(due, "https://scholarbuddy.tech");
  assert.equal(notification.title, "PhD Operation deadline");
  assert.equal(notification.body.split("\n").length, 1);
  assert.equal(new URLSearchParams(new URL(notification.url).hash.slice(1)).get("id"), "OPS-1");
  const delivered = Object.fromEntries(due.map((item) => [item.key, item.expires]));
  assert.equal(dueReminders(all, delivered, new Date("2026-10-14T10:00:00+02:00")).length, 1);
});
test("recurring occurrences have separate identities and summaries preserve destinations", () => {
  const events = [1, 2].map((day) => ({
    id: "series",
    calendar: "Work",
    title: "Standup",
    start: `2026-10-0${day}T09:00:00+02:00`,
  }));
  const candidates = reminderCandidates({ settings, events, now: new Date("2026-09-30") });
  assert.notEqual(candidates[0].key, candidates[1].key);
  const summary = reminderNotification(candidates, "https://scholarbuddy.tech");
  assert.equal(summary.title, "2 upcoming reminders");
  assert.equal(
    JSON.parse(new URLSearchParams(new URL(summary.url).hash.slice(1)).get("items")).length,
    2,
  );
});

test("a single calendar reminder keeps the date the client requires to open it", () => {
  const events = [
    {
      id: "evt1",
      calendar: "Work",
      title: "Supervisor meeting",
      start: "2026-10-02T09:30:00+02:00",
    },
  ];
  const candidates = reminderCandidates({ settings, events, now: new Date("2026-09-30") });
  const notification = reminderNotification(candidates, "https://scholarbuddy.tech");
  const params = new URLSearchParams(new URL(notification.url).hash.slice(1));
  assert.equal(params.get("reminder"), "calendar");
  assert.equal(params.get("id"), "evt1");
  // page.tsx drops a calendar link whose date is not an ISO day, so a missing
  // date here means clicking the notification opens an empty workbench.
  assert.match(params.get("date") || "", /^\d{4}-\d{2}-\d{2}$/);
});

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "scholarbuddy-reminders-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const calls = [];
  let operations = [operation],
    now = new Date("2026-10-10T10:00:00+02:00"),
    fail = false;
  const native = async (action, payload) => {
    calls.push({ action, payload });
    if (action === "send" && fail) throw new Error("Notification transport failed");
    return action === "calendar"
      ? { events: [] }
      : { permission: "granted", calendarPermission: "granted", ok: true };
  };
  const options = { directory, native, readOperations: async () => operations, clock: () => now };
  return {
    directory,
    calls,
    options,
    service: createReminderService(options),
    setOperations(value) {
      operations = value;
    },
    setTime(value) {
      now = new Date(value);
    },
    fail(value) {
      fail = value;
    },
  };
}
const sends = (f) => f.calls.filter((item) => item.action === "send");
test("defaults off; first enable selects both; restart and concurrent ticks do not repeat", async (t) => {
  const f = await fixture(t);
  assert.deepEqual((await f.service.status()).settings, {
    enabled: false,
    calendar: false,
    operations: false,
    initialized: false,
  });
  await f.service.tick();
  assert.equal(sends(f).length, 0);
  await f.service.update({ enabled: true }, "https://scholarbuddy.tech");
  await Promise.all([f.service.tick(), f.service.tick(), f.service.tick()]);
  assert.equal(sends(f).length, 1);
  await createReminderService(f.options).tick();
  assert.equal(sends(f).length, 1);
  const saved = JSON.parse(await readFile(path.join(f.directory, "state.json"), "utf8"));
  assert.equal(Object.keys(saved.delivered).length, 2);
  assert.equal(JSON.stringify(saved).includes(operation.title), false);
});
test("categories are independent and survive master off/on; completed/deleted sources stop", async (t) => {
  const f = await fixture(t);
  await f.service.update({ enabled: true }, "https://scholarbuddy.tech");
  await f.service.update({ operations: false }, "https://scholarbuddy.tech");
  await f.service.update({ enabled: false }, "https://scholarbuddy.tech");
  await f.service.update({ enabled: true }, "https://scholarbuddy.tech");
  assert.equal((await f.service.status()).settings.operations, false);
  const count = sends(f).length;
  f.setTime("2026-10-14T10:00:00+02:00");
  await f.service.tick();
  assert.equal(sends(f).length, count);
  f.setOperations([{ ...operation, status: "Done" }]);
  await f.service.update({ operations: true }, "https://scholarbuddy.tech");
  await f.service.tick();
  assert.equal(sends(f).length, count);
  f.setOperations([]);
  await f.service.tick();
  assert.equal(sends(f).length, count);
});
test("failed notification retries stable identifier; cancellation invalidates outbox", async (t) => {
  const f = await fixture(t);
  f.fail(true);
  await f.service.update({ enabled: true }, "https://scholarbuddy.tech");
  await f.service.tick();
  await f.service.tick();
  assert.equal(sends(f)[0].payload.id, sends(f)[1].payload.id);
  f.setOperations([{ ...operation, status: "Archived" }]);
  f.fail(false);
  const count = sends(f).length;
  await f.service.tick();
  assert.equal(sends(f).length, count);
  assert.equal(
    JSON.parse(await readFile(path.join(f.directory, "state.json"), "utf8")).outbox,
    null,
  );
});
test("rescheduled deadline drops old future nodes", async (t) => {
  const f = await fixture(t);
  await f.service.update({ enabled: true }, "https://scholarbuddy.tech");
  await f.service.tick();
  const count = sends(f).length;
  f.setOperations([{ ...operation, dueDate: "2026-12-15" }]);
  f.setTime("2026-10-14T10:00:00+02:00");
  await f.service.tick();
  assert.equal(sends(f).length, count);
});
test("reminder routes require pairing and validate settings; GET never authorizes", async (t) => {
  const f = await fixture(t);
  const token = "a".repeat(40);
  const config = {
    WORKBUDDY_ORIGINS: "https://scholarbuddy.tech",
    _bridgeToken: token,
    _reminders: f.service,
  };
  const request = (method = "GET", body, authorized = true) =>
    new Request("http://127.0.0.1:32145/reminders", {
      method,
      headers: {
        origin: "https://scholarbuddy.tech",
        ...(authorized ? { authorization: `Bearer ${token}` } : {}),
        "content-type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  assert.equal((await handle(request("GET", null, false), config)).status, 401);
  assert.equal((await handle(request(), config)).status, 200);
  assert.equal(
    f.calls.some((item) => item.action === "authorize"),
    false,
  );
  assert.equal((await handle(request("PUT", { enabled: "yes" }), config)).status, 422);
  assert.equal(
    (await handle(request("PUT", { siteUrl: "https://evil.example" }), config)).status,
    422,
  );
});

test("calendar permission failure does not suppress Operations reminders", async (t) => {
  const f = await fixture(t);
  const native = async (action, payload) => {
    if (action === "calendar") throw new Error("Calendar permission missing");
    f.calls.push({ action, payload });
    return { permission: "granted", calendarPermission: "denied" };
  };
  const service = createReminderService({ ...f.options, native });
  await service.update({ enabled: true }, "https://scholarbuddy.tech");
  await service.tick();
  assert.equal(sends(f).length, 1);
  assert.match((await service.status()).sourceErrors.calendar, /permission/);
});
test("settings preflight permits PUT from paired site origins", async () => {
  const response = await handle(
    new Request("http://127.0.0.1:32145/reminders", {
      method: "OPTIONS",
      headers: { origin: "https://scholarbuddy.tech", "access-control-request-method": "PUT" },
    }),
    { WORKBUDDY_ORIGINS: "https://scholarbuddy.tech" },
  );
  assert.equal(response.status, 204);
  assert.match(response.headers.get("access-control-allow-methods"), /PUT/);
});
