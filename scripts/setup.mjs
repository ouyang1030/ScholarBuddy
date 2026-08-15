import { copyFile, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "../bridge/local-settings.mjs";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(repository, ".env.local.example");
const target = path.join(repository, ".env.local");

try {
  await readFile(target, "utf8");
  process.stdout.write(".env.local already exists; it was left unchanged.\n");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  await copyFile(source, target);
  process.stdout.write("Created .env.local from the safe example.\n");
}

if (process.platform === "darwin") {
  const installer = spawnSync(
    process.execPath,
    [path.join(repository, "scripts", "bridge-service.mjs"), "install"],
    { encoding: "utf8" },
  );
  if (installer.status !== 0) {
    process.stderr.write(
      installer.stderr ||
        "The background Bridge could not be installed. Run `npm run bridge` manually.\n",
    );
    process.exitCode = 1;
  } else {
    process.stdout.write(installer.stdout);
    const localConfig = parseEnv(await readFile(target, "utf8"));
    const port = Number(
      process.env.NEXT_PUBLIC_WORKBUDDY_BRIDGE_PORT ||
        localConfig.NEXT_PUBLIC_WORKBUDDY_BRIDGE_PORT ||
        32145,
    );
    const setupUrl = `http://127.0.0.1:${Number.isInteger(port) ? port : 32145}/setup?return=${encodeURIComponent("https://scholarbuddy.tech")}`;
    spawnSync("/usr/bin/open", [setupUrl], { stdio: "ignore" });
    process.stdout.write("Opened the private ScholarBuddy setup page in your browser.\n");
  }
} else {
  process.stdout.write(
    [
      "Next steps:",
      "1. Run `npm run bridge`.",
      "2. Open http://127.0.0.1:32145/setup in a browser on this computer.",
      "3. Configure local services and connect ScholarBuddy.",
      "",
    ].join("\n"),
  );
}
