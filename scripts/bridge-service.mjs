import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const action = process.argv[2] || "status";
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = path.join(
  repository,
  "bridge",
  "com.workbuddy.research-bridge.plist.template",
);
const agentsDirectory = path.join(os.homedir(), "Library", "LaunchAgents");
const logsDirectory = path.join(os.homedir(), "Library", "Logs", "WorkBuddy");
const plistPath = path.join(agentsDirectory, "com.workbuddy.research-bridge.plist");
const userId = typeof process.getuid === "function" ? process.getuid() : 0;
const serviceTarget = `gui/${userId}/com.workbuddy.research-bridge`;

if (process.platform !== "darwin") {
  process.stderr.write(
    "The background Bridge service currently supports macOS only. Run `npm run bridge` manually on other systems.\n",
  );
  process.exitCode = 1;
} else if (action === "install") {
  await mkdir(agentsDirectory, { recursive: true });
  await mkdir(logsDirectory, { recursive: true });
  const escapeXml = (value) =>
    value.replace(
      /[&<>"']/g,
      (character) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character],
    );
  const replacements = {
    "{{NODE_PATH}}": process.execPath,
    "{{BRIDGE_PATH}}": path.join(repository, "bridge", "server.mjs"),
    "{{REPOSITORY_PATH}}": repository,
    "{{LOG_PATH}}": path.join(logsDirectory, "bridge.log"),
    "{{ERROR_LOG_PATH}}": path.join(logsDirectory, "bridge-error.log"),
  };
  let plist = await readFile(templatePath, "utf8");
  for (const [placeholder, value] of Object.entries(replacements))
    plist = plist.replaceAll(placeholder, escapeXml(value));
  await writeFile(plistPath, plist, { encoding: "utf8", mode: 0o600 });
  spawnSync("launchctl", ["bootout", `gui/${userId}`, plistPath], { stdio: "ignore" });
  const result = spawnSync("launchctl", ["bootstrap", `gui/${userId}`, plistPath], {
    encoding: "utf8",
  });
  if (result.status !== 0)
    throw new Error(result.stderr || "launchctl could not install the Bridge service.");
  spawnSync("launchctl", ["kickstart", "-k", serviceTarget], { stdio: "ignore" });
  process.stdout.write(`Installed and started ${serviceTarget}.\n`);
} else if (action === "uninstall") {
  spawnSync("launchctl", ["bootout", `gui/${userId}`, plistPath], { stdio: "ignore" });
  try {
    await unlink(plistPath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  process.stdout.write(`Uninstalled ${serviceTarget}. Logs remain in ${logsDirectory}.\n`);
} else if (action === "status") {
  try {
    await access(plistPath);
  } catch {
    process.stdout.write("Bridge service is not installed.\n");
    process.exit(0);
  }
  const result = spawnSync("launchctl", ["print", serviceTarget], { encoding: "utf8" });
  process.stdout.write(
    result.status === 0 ? result.stdout : "Bridge service is installed but not running.\n",
  );
} else {
  process.stderr.write("Usage: node scripts/bridge-service.mjs install|uninstall|status\n");
  process.exitCode = 1;
}
