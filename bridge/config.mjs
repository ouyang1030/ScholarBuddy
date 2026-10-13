// Where the Bridge's settings live and how they are read. Nothing here knows
// about a request.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "./local-settings.mjs";
import { httpError } from "./http.mjs";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const configFile = path.join(repoRoot, ".env.local");

export async function readConfigValues() {
  let local = {};
  try {
    local = parseEnv(await readFile(configFile, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return {
    ...local,
    ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined)),
  };
}

export function configInteger(config, key, fallback, minimum = 1) {
  const raw = config[key];
  if (raw === undefined || raw === null || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum) {
    throw httpError(500, `${key} must be an integer of at least ${minimum}.`, "config_invalid");
  }
  return value;
}
