import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { helperApp, buildReminderHelper } from "../scripts/build-reminder-helper.mjs";
const exec = promisify(execFile);
export function nativeReminders(directory) {
  return async (action, payload = {}) => {
    if (process.platform !== "darwin") {
      if (action === "status")
        return { permission: "unsupported", calendarPermission: "unsupported" };
      const error = new Error("System reminders currently require macOS.");
      error.code = "reminder_setup";
      throw error;
    }
    if (action === "authorize") {
      try {
        await buildReminderHelper();
      } catch {
        const error = new Error(
          "The notification helper could not be installed. Install Apple's Command Line Tools with xcode-select --install, then turn reminders on again.",
        );
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
      throw new Error("The notification helper is unavailable. Turn reminders on to set it up.");
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
      if (result.error) throw new Error(result.error);
      return result;
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  };
}
