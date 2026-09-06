import { mkdir, readFile, writeFile, access, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const helperApp = path.join(root, "bridge/.notifications/ScholarBuddy Reminders.app");
export async function buildReminderHelper() {
  if (process.platform !== "darwin") throw new Error("System reminders currently require macOS.");
  const source = path.join(root, "bridge/notifications/ReminderHelper.swift");
  const fingerprint = createHash("sha256")
    .update(await readFile(source))
    .update("v3")
    .digest("hex");
  const marker = path.join(helperApp, "Contents/Resources/source-hash");
  const binary = path.join(helperApp, "Contents/MacOS/ScholarBuddyReminders");
  try {
    if ((await readFile(marker, "utf8")) === fingerprint) {
      await access(binary);
      await exec("/usr/bin/codesign", ["--verify", helperApp], { timeout: 15_000 });
      return helperApp;
    }
  } catch {
    /* build below */
  }
  await mkdir(path.dirname(binary), { recursive: true });
  await mkdir(path.dirname(marker), { recursive: true });
  await rm(path.join(helperApp, "Contents/source-hash"), { force: true });
  await writeFile(
    path.join(helperApp, "Contents/Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>tech.scholarbuddy.reminders</string>
<key>CFBundleName</key><string>ScholarBuddy Reminders</string>
<key>CFBundleExecutable</key><string>ScholarBuddyReminders</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSUIElement</key><true/>
<key>NSCalendarsUsageDescription</key><string>Remind you 24 hours before calendar events, even when ScholarBuddy is closed.</string>
<key>NSCalendarsFullAccessUsageDescription</key><string>Read upcoming calendar events for reminders. ScholarBuddy Reminders does not change your calendar.</string>
</dict></plist>`,
  );
  await exec(
    "/usr/bin/xcrun",
    [
      "swiftc",
      source,
      "-o",
      binary,
      "-framework",
      "AppKit",
      "-framework",
      "UserNotifications",
      "-framework",
      "EventKit",
      "-module-cache-path",
      path.join(root, "bridge/.notifications/module-cache"),
    ],
    { timeout: 120_000 },
  );
  await writeFile(marker, fingerprint);
  await exec("/usr/bin/codesign", ["--force", "--sign", "-", helperApp], { timeout: 15_000 });
  return helperApp;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await buildReminderHelper();
  process.stdout.write("ScholarBuddy notification helper is ready.\n");
}
