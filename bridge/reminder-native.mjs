import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { helperApp, buildReminderHelper } from "../scripts/build-reminder-helper.mjs";
import { t } from "./i18n.mjs";
const exec = promisify(execFile);
// The helper answers in English. The two refusals a person can act on are put
// into the Bridge's language here; anything else is passed on as it came.
const HELPER_REFUSALS = {
  "Allow notifications for ScholarBuddy Reminders in System Settings.":
    "reminders.allowNotifications",
  "Allow Calendar access for ScholarBuddy Reminders in System Settings.": "reminders.allowCalendar",
};
export function nativeReminders(directory) {
  return async (action, payload = {}) => {
    if (process.platform !== "darwin") {
      if (action === "status")
        return { permission: "unsupported", calendarPermission: "unsupported" };
      const error = new Error(t("reminders.macOnly"));
      error.code = "reminder_setup";
      throw error;
    }
    if (action === "authorize") {
      try {
        await buildReminderHelper();
      } catch {
        const error = new Error(t("reminders.helperInstall"));
        error.code = "reminder_setup";
        throw error;
      }
    }
    try {
      await access(path.join(helperApp, "Contents/MacOS/ScholarBuddyReminders"));
    } catch {
      if (action === "status")
        return { permission: "notInstalled", calendarPermission: "notDetermined" };
      if (action === "clear") return { ok: true };
      throw new Error(t("reminders.helperMissing"));
    }
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const folder = await mkdtemp(path.join(directory, "request-"));
    const input = path.join(folder, "input.json"),
      output = path.join(folder, "output.json");
    try {
      await writeFile(input, JSON.stringify({ ...payload, action }), { mode: 0o600 });
      await exec(
        "/usr/bin/open",
        ["-g", "-n", "-W", helperApp, "--args", "--request", input, output],
        { timeout: action === "authorize" ? 180_000 : 20_000 },
      );
      const result = JSON.parse(await readFile(output, "utf8"));
      if (result.error)
        throw new Error(
          HELPER_REFUSALS[result.error] ? t(HELPER_REFUSALS[result.error]) : result.error,
        );
      return result;
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  };
}
