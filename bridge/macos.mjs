// The parts of macOS the Bridge drives through osascript: Calendar, Mail, and
// the folder picker.
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { repoRoot } from "./config.mjs";
import { httpError, requireText, requireIsoDate } from "./http.mjs";
import { t } from "./i18n.mjs";

const calendarScript = path.join(repoRoot, "bridge", "calendar.jxa");

const mailScript = path.join(repoRoot, "bridge", "mail.jxa");

const execFileAsync = promisify(execFile);

async function osascriptCalendar(action, payload, signal) {
  const { stdout } = await execFileAsync(
    "/usr/bin/osascript",
    ["-l", "JavaScript", calendarScript, action, JSON.stringify(payload)],
    { timeout: 20_000, maxBuffer: 2_000_000, ...(signal ? { signal } : {}) },
  );
  return JSON.parse(stdout.trim() || "{}");
}

// The adapter is swappable in process so the tests can exercise the calendar
// paths without reaching the researcher's real Calendar. It has to *be* a
// function, which a value read out of the settings file never is.
export async function runCalendar(config, action, payload, signal) {
  const adapter =
    typeof config?._calendarRunner === "function" ? config._calendarRunner : osascriptCalendar;
  try {
    return await adapter(action, payload, signal);
  } catch (cause) {
    // A caller that went away has not broken Calendar, and reporting it as such
    // would fail a whole AI run over a cancelled request.
    if (cause?.name === "AbortError" || cause?.code === "ABORT_ERR") throw cause;
    const error = new Error("Calendar is unavailable or permission was denied.", { cause });
    error.status = 503;
    error.code = "calendar_unavailable";
    throw error;
  }
}

async function osascriptMail(action, payload) {
  const { stdout } = await execFileAsync(
    "/usr/bin/osascript",
    ["-l", "JavaScript", mailScript, action, JSON.stringify(payload)],
    { timeout: 30_000, maxBuffer: 4_000_000 },
  );
  return JSON.parse(stdout.trim() || "{}");
}

// Swappable in process for the same reason the Calendar adapter is: the tests
// must never read the researcher's real inbox.
export function runMail(config, action, payload) {
  const adapter = typeof config?._mailRunner === "function" ? config._mailRunner : osascriptMail;
  return adapter(action, payload);
}

export function validateCalendar(payload, updating = false) {
  if (updating) requireText(payload.id, "Calendar event id", 300);
  requireText(payload.title, "Event title", 1000);
  if (payload.externalId !== undefined) {
    const externalId = requireText(payload.externalId, "External event id", 200);
    if (!/^[A-Za-z0-9._:-]+$/.test(externalId)) {
      throw httpError(422, "External event id contains unsupported characters.");
    }
  }
  const start = requireIsoDate(payload.start, "Event start");
  const end = requireIsoDate(payload.end, "Event end");
  if (end <= start) {
    throw httpError(422, "Event end must be after its start.");
  }
  return payload;
}

export async function chooseVault() {
  if (process.platform !== "darwin") {
    throw httpError(501, t("setupErrors.folderMacOnly"));
  }
  try {
    const { stdout } = await execFileAsync(
      "/usr/bin/osascript",
      ["-e", 'POSIX path of (choose folder with prompt "Choose your Obsidian vault")'],
      { timeout: 120_000, maxBuffer: 20_000 },
    );
    return stdout.trim().replace(/\/$/, "");
  } catch (cause) {
    const error = new Error(t("setupErrors.noFolder"), { cause });
    error.status = 400;
    throw error;
  }
}
