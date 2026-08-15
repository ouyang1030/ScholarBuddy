import { execFile } from "node:child_process";
import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { AI_PROVIDER_DEFINITIONS } from "../shared/constants.mjs";

const execFileAsync = promisify(execFile);
const keychainService = "tech.scholarbuddy.bridge";

export const providerSecrets = Object.fromEntries(
  AI_PROVIDER_DEFINITIONS.map((provider) => [provider.id, provider.key]),
);

export function parseEnv(text) {
  return Object.fromEntries(
    text.split(/\r?\n/).flatMap((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return [];
      const split = trimmed.indexOf("=");
      const key = trimmed.slice(0, split).trim();
      const raw = trimmed.slice(split + 1).trim();
      let value = raw;
      if (raw.startsWith('"') && raw.endsWith('"')) {
        try {
          value = JSON.parse(raw);
        } catch {
          value = raw.slice(1, -1);
        }
      } else if (raw.startsWith("'") && raw.endsWith("'")) value = raw.slice(1, -1);
      return [[key, value]];
    }),
  );
}

function envValue(value) {
  const clean = String(value ?? "");
  if (/[\r\n]/.test(clean)) throw new Error("Configuration values cannot contain line breaks.");
  return clean && /^[A-Za-z0-9_./:@,+-]+$/.test(clean) ? clean : JSON.stringify(clean);
}

export async function updateLocalConfig(configFile, updates) {
  let source = "";
  try {
    source = await readFile(configFile, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const remaining = new Map(Object.entries(updates));
  const lines = source.split(/\r?\n/).map((line) => {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/);
    if (!match || !remaining.has(match[1])) return line;
    const value = remaining.get(match[1]);
    remaining.delete(match[1]);
    return `${match[1]}=${envValue(value)}`;
  });
  if (lines.length && lines.at(-1) !== "") lines.push("");
  for (const [key, value] of remaining) lines.push(`${key}=${envValue(value)}`);
  lines.push("");
  const temporary = `${configFile}.tmp`;
  await writeFile(temporary, lines.join("\n").replace(/\n{3,}$/g, "\n\n"), {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, configFile);
  await chmod(configFile, 0o600);
}

function keychainAccount(provider) {
  return `provider.${provider}`;
}

export async function readKeychainSecret(provider) {
  if (process.platform !== "darwin" || !providerSecrets[provider]) return "";
  try {
    const { stdout } = await execFileAsync(
      "/usr/bin/security",
      ["find-generic-password", "-a", keychainAccount(provider), "-s", keychainService, "-w"],
      { timeout: 5_000, maxBuffer: 20_000 },
    );
    return stdout.trim();
  } catch {
    return "";
  }
}

export async function saveKeychainSecret(provider, secret) {
  if (process.platform !== "darwin")
    throw new Error("Secure key storage currently requires macOS. Use .env.local on this system.");
  if (!providerSecrets[provider]) throw new Error("Unknown AI provider.");
  const clean = String(secret || "").trim();
  if (clean.length < 8 || clean.length > 2_000) throw new Error("Enter a valid API key.");
  await execFileAsync(
    "/usr/bin/security",
    [
      "add-generic-password",
      "-U",
      "-a",
      keychainAccount(provider),
      "-s",
      keychainService,
      "-w",
      clean,
    ],
    { timeout: 10_000, maxBuffer: 20_000 },
  );
}

export async function deleteKeychainSecret(provider) {
  if (process.platform !== "darwin" || !providerSecrets[provider]) return;
  try {
    await execFileAsync(
      "/usr/bin/security",
      ["delete-generic-password", "-a", keychainAccount(provider), "-s", keychainService],
      { timeout: 5_000, maxBuffer: 20_000 },
    );
  } catch {
    /* already absent */
  }
}

export async function hydrateProviderSecrets(config) {
  const entries = await Promise.all(
    Object.keys(providerSecrets).map(async (provider) => [
      providerSecrets[provider],
      await readKeychainSecret(provider),
    ]),
  );
  return { ...config, ...Object.fromEntries(entries.filter(([, value]) => value)) };
}
