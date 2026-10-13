// The routes behind the loopback-only setup page.
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { deleteKeychainSecret, saveKeychainSecret, updateLocalConfig } from "./local-settings.mjs";
import { setupPage } from "./setup-page.mjs";
import { configFile } from "./config.mjs";
import {
  localSetupOrigin,
  setupReturnOrigin,
  issueSetupSession,
  authorizeSetup,
  pairingBinding,
  issuePairingCode,
} from "./access.mjs";
import { runCalendar, chooseVault } from "./macos.mjs";
import { httpError, html, json, readJson } from "./http.mjs";
import { currentLanguage, t } from "./i18n.mjs";
import { providerDefinitions, modelConfig, testProviderModel } from "./providers.mjs";
import { setupState } from "./status.mjs";

export async function handleSetup(request, config) {
  const url = new URL(request.url);
  if (url.pathname === "/setup" && request.method === "GET") {
    if (request.headers.get("origin") || !localSetupOrigin(request.url))
      return json("", { error: t("access.localOnly") }, 403);
    return html(
      setupPage(
        issueSetupSession(),
        setupReturnOrigin(config, url.searchParams.get("return") || ""),
        currentLanguage(),
      ),
    );
  }
  if (!authorizeSetup(request))
    return json(
      "",
      {
        error: t("setupErrors.expired"),
        code: "setup_session_required",
      },
      401,
    );
  if (url.pathname === "/setup/state" && request.method === "GET")
    return json("", await setupState(config));
  if (url.pathname === "/setup/test/provider" && request.method === "POST") {
    const payload = await readJson(request);
    return json("", await testProviderModel(config, payload, request.signal));
  }
  if (url.pathname === "/setup/provider" && ["POST", "DELETE"].includes(request.method)) {
    const payload = await readJson(request);
    const provider = String(payload.provider || "");
    const definition = providerDefinitions[provider];
    if (!definition) {
      throw httpError(422, t("setupErrors.providerInvalid"));
    }
    if (request.method === "DELETE") {
      await deleteKeychainSecret(provider);
      await updateLocalConfig(configFile, { [definition.key]: "" });
      config[definition.key] = "";
      return json("", { configured: false });
    }
    const updates = {};
    const apiKey = String(payload.apiKey || "").trim();
    const model = String(payload.model || "").trim();
    if (apiKey && (apiKey.length < 8 || apiKey.length > 2_000 || /[\r\n]/.test(apiKey))) {
      throw httpError(422, t("setupErrors.apiKeyInvalid"));
    }
    if (model && (model.length > 200 || /[\r\n]/.test(model))) {
      throw httpError(422, t("setupErrors.modelInvalid"));
    }
    if (!apiKey && !model) {
      throw httpError(422, t("setupErrors.keyOrModel"));
    }
    if (apiKey) {
      if (process.platform === "darwin") {
        await saveKeychainSecret(provider, apiKey);
        updates[definition.key] = "";
      } else updates[definition.key] = apiKey;
    }
    if (model) updates[definition.model] = model;
    await updateLocalConfig(configFile, updates);
    if (apiKey) config[definition.key] = apiKey;
    if (model) config[definition.model] = model;
    return json("", {
      configured: Boolean(config[definition.key]),
      model: modelConfig(config, provider).model,
    });
  }
  if (url.pathname === "/setup/config" && request.method === "POST") {
    const payload = await readJson(request);
    const vaultPath = String(payload.vaultPath || "").trim();
    if (!path.isAbsolute(vaultPath) || vaultPath.length > 2_000 || /[\r\n]/.test(vaultPath)) {
      throw httpError(422, t("setupErrors.vaultPathInvalid"));
    }
    try {
      await access(vaultPath, constants.R_OK | constants.W_OK);
    } catch {
      throw httpError(422, t("setupErrors.vaultAccess"));
    }
    await updateLocalConfig(configFile, { OBSIDIAN_VAULT_PATH: vaultPath });
    config.OBSIDIAN_VAULT_PATH = vaultPath;
    return json("", { saved: true });
  }
  if (url.pathname === "/setup/vault-picker" && request.method === "POST")
    return json("", { path: await chooseVault() });
  if (url.pathname === "/setup/test/calendar" && request.method === "POST") {
    const start = new Date();
    const end = new Date(start.getTime() + 1000);
    await runCalendar(
      config,
      "list",
      { start: start.toISOString(), end: end.toISOString() },
      request.signal,
    );
    return json("", { connected: true });
  }
  if (url.pathname === "/setup/grants") {
    if (request.method === "GET")
      return json("", { perSite: Boolean(config._grants), grants: config._grants?.list() || [] });
    if (!config._grants) {
      throw httpError(409, t("setupErrors.fixedToken"));
    }
    const payload = await readJson(request);
    const changed =
      request.method === "DELETE"
        ? payload.all === true
          ? (await config._grants.revokeAll(), true)
          : await config._grants.revoke(String(payload.id || ""))
        : request.method === "POST" &&
          (await config._grants.setAccess(String(payload.id || ""), String(payload.access || "")));
    if (!changed) {
      throw httpError(404, t("setupErrors.grantMissing"));
    }
    return json("", { perSite: true, grants: config._grants.list() });
  }
  if (url.pathname === "/setup/pair" && request.method === "POST") {
    const payload = await readJson(request);
    const returnOrigin = setupReturnOrigin(config, String(payload.returnOrigin || ""));
    const code = issuePairingCode(pairingBinding(config), returnOrigin);
    return json("", { url: `${returnOrigin}/#bridge-pair=${encodeURIComponent(code)}` });
  }
  return json("", { error: t("setupErrors.notFound") }, 404);
}
