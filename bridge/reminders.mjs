import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { writeFileAtomic } from "./atomic-file.mjs";
import { LANGUAGES, inLanguage, t } from "./i18n.mjs";
import {
  reminderDefaults,
  reminderCandidates,
  dueReminders,
  reminderNotification,
} from "./reminder-rules.mjs";

export function createReminderService({
  directory,
  native,
  readOperations,
  clock = () => new Date(),
}) {
  const file = path.join(directory, "state.json");
  let state;
  let tail = Promise.resolve();
  let timer;
  let lastError = "";
  // Kept as message keys so each viewer reads them in their own language.
  let sourceErrors = {};
  // Notifications go out with no browser asking, in the language the workbench
  // last used here. It is remembered across restarts with the settings.
  let language = "en";
  let languageChosen = false;
  // Reading permissions launches the helper app, and the settings panel polls.
  // Once everything is granted the answer is reused for a minute; while something
  // is still missing every poll asks again, so a fix in System Settings shows at once.
  let permissions = null;
  const PERMISSIONS_TTL_MS = 60_000;
  const serialize = (fn) => {
    const result = tail.then(fn);
    tail = result.catch(() => {});
    return result;
  };
  async function load() {
    if (state) return;
    try {
      const loaded = JSON.parse(await readFile(file, "utf8"));
      if (
        !loaded ||
        !loaded.settings ||
        !loaded.delivered ||
        ["enabled", "calendar", "operations", "initialized"].some(
          (key) => typeof loaded.settings[key] !== "boolean",
        ) ||
        typeof loaded.siteUrl !== "string" ||
        Array.isArray(loaded.delivered) ||
        Object.values(loaded.delivered).some(
          (expiry) => typeof expiry !== "number" || !Number.isFinite(expiry),
        )
      ) {
        throw new Error("Invalid reminder state");
      }
      state = loaded;
      if (!languageChosen && LANGUAGES.includes(state.language)) language = state.language;
    } catch (error) {
      if (error.code !== "ENOENT") throw new Error(t("reminders.stateUnreadable"));
      state = { settings: { ...reminderDefaults }, delivered: {}, siteUrl: "" };
    }
    if (!state.settings || !state.delivered) throw new Error(t("reminders.stateInvalid"));
  }
  async function save() {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFileAtomic(file, JSON.stringify(state));
  }
  async function tick() {
    await load();
    if (!state.settings.enabled) return;
    const now = clock();
    sourceErrors = {};
    let operations = [],
      events = [];
    // A failed calendar read must not suppress valid Operation reminders.
    if (state.settings.operations) {
      try {
        // The notes that loaded still get their reminders. The ones that did not
        // are reported here, because nobody is warned about a deadline in a note
        // the Bridge could not read.
        const read = await readOperations();
        operations = Array.isArray(read) ? read : read.records;
        const unread = Array.isArray(read) ? 0 : read.invalid.length;
        if (unread) sourceErrors.operations = ["operationsUnread", unread];
      } catch {
        sourceErrors.operations = ["operationsFailed"];
      }
    }
    if (state.settings.calendar) {
      try {
        events = (await native("calendar", { start: +now, end: +now + 3 * 86_400_000 })).events;
      } catch (error) {
        process.stderr.write(`Reminders could not read Calendar: ${error.message}\n`);
        sourceErrors.calendar = ["calendarFailed"];
      }
    }
    const candidates = reminderCandidates({
      settings: state.settings,
      operations,
      events,
      now,
      language,
    });
    const due = dueReminders(candidates, state.delivered, now);
    // Persist the intended delivery before talking to macOS. On an uncertain
    // result retry the same identifier; the helper checks already delivered IDs.
    // Intersect an outbox retry with live sources so a later completion cancels it.
    const eligible = new Set(due.map((item) => item.key));
    if (state.outbox && !state.outbox.keys.every((key) => eligible.has(key))) {
      state.outbox = null;
      await save();
    }
    if (!state.outbox && due.length) {
      state.outbox = {
        keys: due.map((item) => item.key),
        notification: reminderNotification(due, state.siteUrl, language),
      };
      await save();
    }
    if (state.outbox) {
      await native("send", state.outbox.notification);
      for (const key of state.outbox.keys) {
        const item = due.find((entry) => entry.key === key);
        if (item) state.delivered[key] = item.expires;
      }
      state.outbox = null;
      await save();
    }
    let pruned = false;
    for (const [key, expiry] of Object.entries(state.delivered)) {
      if (expiry < +now - 7 * 86_400_000) {
        delete state.delivered[key];
        pruned = true;
      }
    }
    if (pruned) await save();
    lastError = "";
  }
  const runTick = () =>
    serialize(() => inLanguage(language, tick)).catch((error) => {
      lastError = error.message;
    });
  return {
    tick: runTick,
    events: (date) =>
      serialize(async () => {
        const start = new Date(`${date}T00:00:00`);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        return native("calendar", { start: +start, end: +end });
      }),
    start() {
      if (!timer) {
        void runTick();
        timer = setInterval(runTick, 60_000);
        timer.unref?.();
      }
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
    // Called on every paired request; it writes only when the language changes.
    useLanguage(next) {
      if (!LANGUAGES.includes(next)) return Promise.resolve();
      if (state?.language === next && language === next) return Promise.resolve();
      language = next;
      languageChosen = true;
      return serialize(async () => {
        await load();
        if (state.language === next) return;
        state.language = next;
        // Someone who never turned reminders on gets no settings file for it;
        // the language is written with the settings when they are first saved.
        if (state.settings.initialized) await save();
      }).catch(() => {
        /* the language is kept in memory; the next change tries the file again */
      });
    },
    status: () =>
      serialize(async () => {
        await load();
        if (!permissions || +clock() - permissions.at >= PERMISSIONS_TTL_MS) {
          let value;
          try {
            value = await native("status");
          } catch {
            value = { permission: "unavailable", calendarPermission: "unavailable" };
          }
          const settled =
            value.permission === "granted" &&
            (!state.settings.calendar || value.calendarPermission === "granted");
          permissions = { at: settled ? +clock() : -Infinity, value };
        }
        return {
          settings: state.settings,
          ...permissions.value,
          error: lastError,
          sourceErrors: Object.fromEntries(
            Object.entries(sourceErrors).map(([source, [key, ...values]]) => [
              source,
              t(`reminders.${key}`, ...values),
            ]),
          ),
        };
      }),
    update: (patch, siteUrl) =>
      serialize(async () => {
        await load();
        if (
          !patch ||
          typeof patch !== "object" ||
          Array.isArray(patch) ||
          Object.entries(patch).some(
            ([key, value]) =>
              !["enabled", "calendar", "operations"].includes(key) || typeof value !== "boolean",
          )
        ) {
          const error = new Error(t("reminders.switchesOnly"));
          error.status = 422;
          throw error;
        }
        const settings = { ...state.settings, ...patch };
        if (patch.enabled === true && !settings.initialized)
          Object.assign(settings, { calendar: true, operations: true, initialized: true });
        if (
          settings.enabled &&
          (!state.settings.enabled || (settings.calendar && !state.settings.calendar))
        ) {
          // Authorization is requested only from an explicit user action.
          await native("authorize", { calendar: settings.calendar });
        }
        permissions = null;
        state.settings = settings;
        state.siteUrl = siteUrl;
        state.outbox = null;
        await save();
        // No future source notifications are queued with the OS. Clear any request
        // still crossing the delivery boundary when a switch is disabled.
        if (!settings.enabled || !settings.calendar || !settings.operations) await native("clear");
        lastError = "";
        sourceErrors = {};
        // Do not make saving settings wait on source scans.
        setImmediate(runTick);
        return { settings };
      }),
    test: (siteUrl) =>
      serialize(async () => {
        await load();
        if (!state.settings.enabled) {
          const error = new Error(t("reminders.turnOnFirst"));
          error.status = 422;
          throw error;
        }
        await native("send", {
          id: `test-${randomUUID()}`,
          title: t("reminders.testTitle"),
          body: t("reminders.testBody"),
          url: siteUrl,
        });
        return { ok: true };
      }),
  };
}
