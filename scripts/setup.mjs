import { copyFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

process.stdout.write([
  "Next steps:",
  "1. Set OBSIDIAN_VAULT_PATH and any AI provider keys in .env.local.",
  "2. Add the exact deployed site origin to WORKBUDDY_ORIGINS.",
  "3. Run npm run bridge, or npm run bridge:install on macOS.",
  "4. Open ScholarBuddy → Connections and pair with the temporary local code.",
  "",
].join("\n"));
