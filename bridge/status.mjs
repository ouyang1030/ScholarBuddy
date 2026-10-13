// What is connected right now, for the Connections drawer and the setup page.
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { AI_PROVIDERS } from "../shared/constants.mjs";
import { runCalendar } from "./macos.mjs";

import { zoteroRequest } from "./zotero.mjs";
import { modelConfig, providerConfigured } from "./providers.mjs";

// Every /status call checks Zotero and the vault and spawns osascript for
// Calendar. The browser polls it, so serve a recent answer unless asked not to.
const STATUS_CACHE_MS = 60_000;

let statusCache = { at: 0, value: null };

export async function bridgeStatus(config, fresh = false) {
  if (!fresh && statusCache.value && Date.now() - statusCache.at < STATUS_CACHE_MS)
    return statusCache.value;
  const status = await computeBridgeStatus(config, fresh);
  statusCache = { at: Date.now(), value: status };
  return status;
}

async function computeBridgeStatus(config, fresh) {
  const verified = await Promise.all(
    AI_PROVIDERS.map(async (provider) => [
      provider,
      await providerConfigured(config, provider, fresh),
    ]),
  );
  const providers = Object.fromEntries(
    verified.map(([provider, configured]) => [
      provider,
      { configured, model: modelConfig(config, provider).model },
    ]),
  );
  const status = {
    bridge: true,
    paired: true,
    ...providers,
    zotero: { connected: false, version: null },
    obsidian: {
      connected: false,
      vault: config.OBSIDIAN_VAULT_PATH ? path.basename(config.OBSIDIAN_VAULT_PATH) : null,
    },
    calendar: { connected: false },
  };
  try {
    const response = await zoteroRequest(config, "/api/users/0/items?limit=1&format=json");
    status.zotero = { connected: true, version: response.headers.get("X-Zotero-Version") };
  } catch {
    /* offline */
  }
  try {
    await access(config.OBSIDIAN_VAULT_PATH, constants.R_OK | constants.W_OK);
    status.obsidian.connected = true;
  } catch {
    /* unavailable */
  }
  try {
    await runCalendar(config, "list", {
      start: new Date().toISOString(),
      end: new Date(Date.now() + 1000).toISOString(),
    });
    status.calendar.connected = true;
  } catch {
    /* unavailable */
  }
  return status;
}

export async function setupState(config) {
  const state = {
    providers: Object.fromEntries(
      AI_PROVIDERS.map((provider) => [
        provider,
        {
          configured: Boolean(modelConfig(config, provider).apiKey),
          model: modelConfig(config, provider).model,
        },
      ]),
    ),
    zotero: { connected: false, version: null },
    obsidian: { connected: false, path: config.OBSIDIAN_VAULT_PATH || "" },
  };
  try {
    const response = await zoteroRequest(config, "/api/users/0/items?limit=1&format=json");
    state.zotero = { connected: true, version: response.headers.get("X-Zotero-Version") };
  } catch {
    /* unavailable */
  }
  try {
    if (config.OBSIDIAN_VAULT_PATH)
      await access(config.OBSIDIAN_VAULT_PATH, constants.R_OK | constants.W_OK);
    state.obsidian.connected = Boolean(config.OBSIDIAN_VAULT_PATH);
  } catch {
    /* unavailable */
  }
  return state;
}
