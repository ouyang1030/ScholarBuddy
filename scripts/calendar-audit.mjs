// Reports whether Today's schedule can see repeating events on this Mac.
// Calendar's scripting interface, which the schedule and "committed time" read
// through, returns a repeating event once — on the day its series began. EventKit,
// which the reminder helper reads through, returns every occurrence. This lists,
// for the next seven days, how many events each of them sees.
//
// Run with: node scripts/calendar-audit.mjs [--titles]
// Only counts are printed unless --titles is given. Nothing is written or sent.
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { nativeReminders } from "../bridge/reminder-native.mjs";

if (process.platform !== "darwin") {
  process.stderr.write("Calendar integration is only available on macOS.\n");
  process.exit(1);
}
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const start = new Date();
start.setHours(0, 0, 0, 0);
const end = new Date(start);
end.setDate(end.getDate() + 7);
const day = (value) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
// An event is the same event to both when it has the same title at the same moment.
const key = (event) => `${new Date(event.start).getTime()}|${event.title}`;

let scripted;
try {
  const { stdout } = await promisify(execFile)(
    "/usr/bin/osascript",
    [
      "-l",
      "JavaScript",
      path.join(repository, "bridge", "calendar.jxa"),
      "list",
      JSON.stringify({ start: start.toISOString(), end: end.toISOString() }),
    ],
    { timeout: 120_000, maxBuffer: 16_000_000 },
  );
  scripted = JSON.parse(stdout.trim() || "{}").events || [];
} catch (error) {
  process.stderr.write(
    `Calendar could not be read through scripting. Allow this terminal to control Calendar when macOS asks, then run again.\n${error.message}\n`,
  );
  process.exit(1);
}

let expanded;
try {
  const native = nativeReminders(path.join(repository, "bridge", ".notifications", "state"));
  expanded = (await native("calendar", { start: +start, end: +end })).events || [];
} catch (error) {
  process.stderr.write(
    `Calendar could not be read through the reminder helper: ${error.message}\nTurn reminders on once under Connections (that builds the helper and asks for Calendar access), then run again.\n`,
  );
  process.exit(1);
}

const seen = new Set(scripted.map(key));
const missing = expanded.filter((event) => !seen.has(key(event)));
const count = (events, date) => events.filter((event) => day(event.start) === date).length;
process.stdout.write("date        schedule sees   EventKit sees   missing from schedule\n");
for (let offset = 0; offset < 7; offset += 1) {
  const date = new Date(start);
  date.setDate(date.getDate() + offset);
  const label = day(date);
  process.stdout.write(
    `${label}  ${String(count(scripted, label)).padStart(13)}   ${String(count(expanded, label)).padStart(13)}   ${String(count(missing, label)).padStart(21)}\n`,
  );
}
process.stdout.write(
  missing.length
    ? `\n${missing.length} of ${expanded.length} events in the next seven days do not reach Today's schedule or AI planning.\n`
    : `\nEvery event EventKit returns for the next seven days (${expanded.length}) also reaches Today's schedule.\n`,
);
if (process.argv.includes("--titles"))
  for (const event of missing) process.stdout.write(`  ${day(event.start)}  ${event.title}\n`);
