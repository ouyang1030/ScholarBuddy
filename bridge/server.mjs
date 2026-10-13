// The Bridge's entry point: it loads the configuration, routes each request to
// the module that owns it, speaks HTTP on the loopback interface, and carries
// the command-line switches.
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import { constants, fstatSync, ftruncateSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { hydrateProviderSecrets } from "./local-settings.mjs";
import { createReminderService } from "./reminders.mjs";
import { repoRoot, readConfigValues } from "./config.mjs";
import {
  requireBridgeToken,
  openGrantStore,
  rotateBridgeToken,
  allowedOrigins,
  authorize,
  bearerToken,
  pairingBinding,
  redeemPairingCode,
  pairingPage,
} from "./access.mjs";
import { runCalendar, validateCalendar } from "./macos.mjs";
import { MAX_BODY_BYTES, httpError, corsHeaders, json, readJson, requireText } from "./http.mjs";
import { activityStore } from "./activity-store.mjs";
import { handleAiRun } from "./ai-run.mjs";
import {
  readCollection,
  workbenchState,
  saveRecord,
  deleteRecord,
  saveAiNote,
} from "./records.mjs";
import { listZoteroPassages, searchZotero } from "./zotero.mjs";
import {
  verifySubmissionAttempt,
  addSubmissionEvent,
  syncSubmissionEmails,
} from "./submissions.mjs";
import { vaultCoverageNote, searchObsidian } from "./vault-search.mjs";
import { bridgeStatus } from "./status.mjs";
import { handleSetup } from "./setup.mjs";
import { currentLanguage, inLanguage, languageOf, requestLanguage, t } from "./i18n.mjs";

const REQUEST_TIMEOUT_MS = 15_000;

let setupMutationTail = Promise.resolve();

const SERVICE_LABEL = "tech.scholarbuddy.research-bridge";

// A running Bridge holds the paired-browser list in memory, so clearing the file
// alone does not revoke anything until the service restarts.
async function restartInstalledBridgeService() {
  if (process.platform !== "darwin") return false;
  const plist = path.join(os.homedir(), "Library", "LaunchAgents", `${SERVICE_LABEL}.plist`);
  try {
    await access(plist, constants.F_OK);
  } catch {
    return false;
  }
  const userId = typeof process.getuid === "function" ? process.getuid() : 0;
  return (
    spawnSync("launchctl", ["kickstart", "-k", `gui/${userId}/${SERVICE_LABEL}`], {
      encoding: "utf8",
    }).status === 0
  );
}

// A fixed token is the explicit opt-out for automation: one credential, shared by
// every allowed origin, that never lapses. Left unset, each site pairs for its own.
async function getConfig() {
  const config = await hydrateProviderSecrets(await readConfigValues());
  if (config.SCHOLARBUDDY_BRIDGE_TOKEN !== undefined)
    return { ...config, _bridgeToken: requireBridgeToken(config.SCHOLARBUDDY_BRIDGE_TOKEN) };
  return { ...config, _grants: await openGrantStore() };
}

// Generous by design: normal use is a poll a minute plus saves. This only stops
// a runaway client from pinning the vault walk or Zotero.
const READ_WINDOW_MS = 60_000;

const READ_LIMIT = 240;

const EXPENSIVE_READS = new Set([
  "/workbench/state",
  "/obsidian/search",
  "/zotero/passages",
  "/zotero/search",
]);

let readWindow = { at: 0, count: 0 };

function readQuota(pathname) {
  if (!EXPENSIVE_READS.has(pathname)) return true;
  const now = Date.now();
  if (now - readWindow.at >= READ_WINDOW_MS) readWindow = { at: now, count: 0 };
  readWindow.count += 1;
  return readWindow.count <= READ_LIMIT;
}

// Everything a request makes the Bridge say is said in that request's language.
export function handle(request, providedConfig) {
  return inLanguage(requestLanguage(request), () => route(request, providedConfig));
}

async function route(request, providedConfig) {
  const config = providedConfig || (await getConfig());
  const url = new URL(request.url);
  if (url.pathname === "/setup" || url.pathname.startsWith("/setup/")) {
    if (
      ["/setup/provider", "/setup/config"].includes(url.pathname) &&
      ["POST", "DELETE"].includes(request.method)
    ) {
      const result = setupMutationTail.then(() => handleSetup(request, config));
      setupMutationTail = result.catch(() => {});
      return result;
    }
    return handleSetup(request, config);
  }
  if (url.pathname === "/pair" && request.method === "GET") {
    if (request.headers.get("origin")) return json("", { error: t("access.localOnly") }, 403);
    return pairingPage(pairingBinding(config), currentLanguage());
  }
  if (url.pathname === "/pair/exchange") {
    const origin = request.headers.get("origin") || "";
    if (!allowedOrigins(config).includes(origin))
      return json("", { error: t("access.originDenied"), code: "origin_denied" }, 403);
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method !== "POST") return json(origin, { error: "Method not allowed." }, 405);
    const payload = await readJson(request);
    if (!redeemPairingCode(payload.code, pairingBinding(config), origin))
      return json(
        origin,
        { error: t("access.pairingCodeInvalid"), code: "pairing_code_invalid" },
        401,
      );
    if (!config._grants) return json(origin, { token: config._bridgeToken });
    const held = config._grants.verify(origin, bearerToken(request));
    return json(origin, { token: await config._grants.issue(origin, { replaces: held?.id }) });
  }
  const auth = authorize(request, config);
  // Giving a credential back is never a write the Bridge should refuse, so a
  // browser paired read-only can still disconnect itself.
  if (url.pathname === "/pair/revoke" && request.method === "POST" && auth.grant)
    return json(auth.origin, { revoked: await config._grants.revoke(auth.grant.id) });
  // /health alone answers a denied origin readably, so the browser can report
  // "site not allowed" instead of mistaking the missing CORS header for an
  // unreachable Bridge. It still reveals nothing beyond the denial itself.
  const deniedHealthOrigin =
    auth.code === "origin_denied" && url.pathname === "/health"
      ? request.headers.get("origin") || ""
      : "";
  if (deniedHealthOrigin && request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: corsHeaders(deniedHealthOrigin) });
  if (!auth.ok)
    return json(
      auth.origin || deniedHealthOrigin,
      {
        error:
          auth.code === "pairing_required"
            ? t("access.pairingRequired")
            : auth.code === "read_only"
              ? t("access.readOnly")
              : t("access.originDenied"),
        code: auth.code,
      },
      auth.status,
    );
  if (auth.preflight) return new Response(null, { status: 204, headers: corsHeaders(auth.origin) });
  const origin = auth.origin;
  // Reminders are sent when no browser is asking, so they are written in the
  // language the workbench last spoke to this Bridge in.
  void config._reminders?.useLanguage?.(currentLanguage());
  if (url.pathname === "/profile" || url.pathname.startsWith("/profile/")) {
    const store = activityStore(config);
    await store.initialize();
    if (url.pathname === "/profile" && request.method === "GET")
      return json(origin, await store.profile());
    if (url.pathname === "/profile/identity" && request.method === "GET")
      return json(origin, await store.identity());
    if (url.pathname === "/profile" && request.method === "PATCH") {
      await store.updateProfile(await readJson(request));
      return json(origin, await store.profile());
    }
    if (url.pathname === "/profile/focus/events" && request.method === "POST")
      return json(origin, await store.saveFocus(await readJson(request)));
    if (url.pathname === "/profile/focus/days" && request.method === "GET") {
      const profile = await store.profile();
      const from = url.searchParams.get("from") || "2020-01-01";
      const to = url.searchParams.get("to") || profile.today;
      const cursor = Number(url.searchParams.get("cursor") || 0);
      const validDate = (value) =>
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        Number.isFinite(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value;
      if (
        !validDate(from) ||
        !validDate(to) ||
        from > to ||
        !Number.isSafeInteger(cursor) ||
        cursor < 0
      )
        return json(origin, { error: "Invalid focus date range." }, 400);
      const days = profile.focus.days.filter((day) => day.date >= from && day.date <= to).reverse();
      return json(origin, {
        days: days.slice(cursor, cursor + 100),
        nextCursor: cursor + 100 < days.length ? cursor + 100 : null,
        timeZone: profile.timeZone,
      });
    }
    if (url.pathname === "/profile/activity" && request.method === "GET")
      return json(
        origin,
        await store.series(
          url.searchParams.get("metric") || "focus",
          url.searchParams.get("view") || "daily",
          url.searchParams.get("range") || "30d",
        ),
      );
    return json(origin, { error: "Profile endpoint not found." }, 404);
  }
  if (
    url.pathname === "/reminders" ||
    url.pathname === "/reminders/test" ||
    url.pathname === "/reminders/events"
  ) {
    if (!config._reminders) return json(origin, { error: t("reminders.restart") }, 503);
    try {
      if (url.pathname === "/reminders/events" && request.method === "GET") {
        const date = url.searchParams.get("date") || "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(+new Date(`${date}T00:00:00`)))
          return json(origin, { error: t("reminders.invalidDate") }, 422);
        return json(origin, await config._reminders.events(date));
      }
      if (url.pathname === "/reminders" && request.method === "GET")
        return json(origin, await config._reminders.status());
      if (url.pathname === "/reminders" && request.method === "PUT")
        return json(origin, await config._reminders.update(await readJson(request), origin));
      if (url.pathname === "/reminders/test" && request.method === "POST")
        return json(origin, await config._reminders.test(origin));
      return json(origin, { error: "Method not allowed." }, 405);
    } catch (error) {
      return json(
        origin,
        {
          error:
            error.status === 422 || error.code === "reminder_setup"
              ? error.message
              : t("reminders.failed"),
        },
        error.status || 503,
      );
    }
  }
  if (!readQuota(url.pathname))
    return json(origin, { error: t("access.readLimit"), code: "read_limit" }, 429);
  if (url.pathname === "/health" && request.method === "GET")
    return json(origin, { bridge: true, paired: true });
  if (url.pathname === "/status" && request.method === "GET")
    return json(origin, await bridgeStatus(config, url.searchParams.get("fresh") === "1"));
  if (url.pathname === "/zotero/search" && request.method === "GET")
    return json(origin, {
      items: await searchZotero(config, url.searchParams.get("q") || "", 12, request.signal),
    });
  if (url.pathname === "/zotero/passages" && request.method === "GET")
    return json(origin, await listZoteroPassages(config, request.signal));
  if (url.pathname === "/workbench/state" && request.method === "GET")
    return json(origin, await workbenchState(config));
  if (url.pathname === "/workbench/record" && request.method === "POST") {
    const payload = await readJson(request);
    return json(
      origin,
      { record: await saveRecord(config, payload.collection, payload.record || {}) },
      payload.record?.id ? 200 : 201,
    );
  }
  if (url.pathname === "/workbench/record" && request.method === "DELETE") {
    const payload = await readJson(request);
    return json(
      origin,
      await deleteRecord(
        config,
        payload.collection,
        payload.id,
        payload.version,
        payload.contentHash,
      ),
    );
  }
  if (url.pathname === "/submissions/event" && request.method === "POST")
    return json(origin, { event: await addSubmissionEvent(config, await readJson(request)) }, 201);
  if (url.pathname === "/submissions/verify" && request.method === "POST")
    return json(
      origin,
      { attempt: await verifySubmissionAttempt(config, await readJson(request)) },
      200,
    );
  if (url.pathname === "/submissions/email-sync" && request.method === "POST") {
    await readJson(request);
    return json(origin, await syncSubmissionEmails(config));
  }
  if (url.pathname === "/obsidian/search" && request.method === "GET")
    return json(origin, {
      notes: await searchObsidian(config, url.searchParams.get("q") || "", 12, request.signal),
      partial: vaultCoverageNote(config.OBSIDIAN_VAULT_PATH),
    });
  if (url.pathname === "/calendar/today" && request.method === "GET") {
    const requestedDate = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      throw httpError(422, "Calendar date must use YYYY-MM-DD.");
    }
    const start = new Date(`${requestedDate}T00:00:00`);
    if (Number.isNaN(start.getTime())) {
      throw httpError(422, "Calendar date is invalid.");
    }
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return json(
      origin,
      await runCalendar(
        config,
        "list",
        { start: start.toISOString(), end: end.toISOString() },
        request.signal,
      ),
    );
  }
  if (url.pathname === "/calendar/event" && request.method === "POST") {
    const payload = await readJson(request);
    validateCalendar(payload, Boolean(payload.id));
    return json(
      origin,
      await runCalendar(config, payload.id ? "update" : "create", payload, request.signal),
      payload.id ? 200 : 201,
    );
  }
  if (url.pathname === "/calendar/event" && request.method === "DELETE") {
    const payload = await readJson(request);
    requireText(payload.id, "Calendar event id", 300);
    return json(origin, await runCalendar(config, "delete", payload, request.signal));
  }
  if (url.pathname === "/obsidian/note" && request.method === "POST")
    return json(origin, await saveAiNote(config, await readJson(request)), 201);
  if (["/ai/run", "/ai/stream"].includes(url.pathname) && request.method === "POST")
    return handleAiRun(request, config, origin, url.pathname === "/ai/stream");
  return json(origin, { error: "Not found." }, 404);
}

async function readIncomingBody(incoming) {
  const declared = Number(incoming.headers["content-length"] || 0);
  if (declared > MAX_BODY_BYTES) {
    throw httpError(413, "Request is too large.");
  }
  const chunks = [];
  let size = 0;
  let timer;
  try {
    timer = setTimeout(
      () => incoming.destroy(new Error("Request body timed out.")),
      REQUEST_TIMEOUT_MS,
    );
    for await (const chunk of incoming) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        throw httpError(413, "Request is too large.");
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timer);
  }
}

export function createBridgeServer(configPromise = getConfig()) {
  return createServer((incoming, outgoing) =>
    inLanguage(languageOf(incoming.url || "/", incoming.headers["accept-language"]), () =>
      serve(configPromise, incoming, outgoing),
    ),
  );
}

async function serve(configPromise, incoming, outgoing) {
  let request;
  let origin = "";
  try {
    const clientAbort = new AbortController();
    incoming.once("aborted", () => clientAbort.abort(new Error("Client disconnected.")));
    outgoing.once("close", () => {
      if (!outgoing.writableEnded) clientAbort.abort(new Error("Client disconnected."));
    });
    const config = await configPromise;
    origin = String(incoming.headers.origin || "");
    const requestedHost = String(incoming.headers.host || "");
    const host = /^(127\.0\.0\.1|localhost)(?::(\d{1,5}))?$/i.exec(requestedHost);
    if (!host || (host[2] && (Number(host[2]) < 1 || Number(host[2]) > 65535))) {
      throw httpError(400, "Host must be localhost or 127.0.0.1 with a valid port.", "host_denied");
    }
    const url = `http://${requestedHost}${incoming.url}`;
    const pathname = new URL(url).pathname;
    const preliminary = new Request(url, {
      method: incoming.method,
      headers: incoming.headers,
      signal: clientAbort.signal,
    });
    const isLocalEntry =
      (pathname === "/pair" && incoming.method === "GET") ||
      pathname === "/pair/exchange" ||
      pathname === "/setup" ||
      pathname.startsWith("/setup/");
    const auth = isLocalEntry ? { ok: true } : authorize(preliminary, config);
    if (!auth.ok || auth.preflight || ["GET", "HEAD", "OPTIONS"].includes(incoming.method))
      request = preliminary;
    else {
      const body = await readIncomingBody(incoming);
      request = new Request(url, {
        method: incoming.method,
        headers: incoming.headers,
        body,
        signal: clientAbort.signal,
      });
    }
    const response = await handle(request, config);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    // Buffering an event stream would defeat it, so those are piped through and
    // the socket closing is what cancels the upstream provider request.
    if (response.body && response.headers.get("content-type")?.startsWith("text/event-stream"))
      await pipeline(Readable.fromWeb(response.body), outgoing);
    else outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    if (outgoing.headersSent || outgoing.writableEnded) {
      outgoing.destroy();
      return;
    }
    const status = Number(error?.status) || 500;
    const publicCodes = new Set([
      "provider_not_configured",
      "provider_timeout",
      "provider_auth",
      "provider_error",
      "calendar_unavailable",
      "config_invalid",
    ]);
    const code =
      typeof error?.code === "string" && (status < 500 || publicCodes.has(error.code))
        ? error.code
        : status >= 500
          ? "bridge_error"
          : "invalid_request";
    const safeMessage =
      status < 500 || publicCodes.has(code)
        ? error instanceof Error
          ? error.message
          : t("access.invalid")
        : t("access.failed");
    const response = json(
      allowedOrigins(await configPromise).includes(origin) ? origin : "",
      { error: safeMessage, code },
      status,
    );
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--rotate-token")) {
    await rotateBridgeToken();
    const restarted = await restartInstalledBridgeService();
    process.stdout.write(
      restarted
        ? "Bridge token rotated: every paired browser was revoked and the background Bridge restarted. Pair each browser again.\n"
        : "Bridge token rotated: every paired browser was revoked. This takes effect only after the Bridge restarts — restart it, then pair each browser again.\n",
    );
  } else if (process.argv.includes("--print-token")) {
    const config = await readConfigValues();
    process.stdout.write(
      config.SCHOLARBUDDY_BRIDGE_TOKEN !== undefined
        ? `${requireBridgeToken(config.SCHOLARBUDDY_BRIDGE_TOKEN)}\n`
        : "Each site receives its own credential when a browser pairs, and only a hash of it is kept, so there is none to print. Open the Bridge's /setup page to pair a browser, limit one to reading, or revoke it.\n",
    );
  } else {
    // Installed as a service, this process's output is appended to two log files
    // for as long as it stays installed. Starting over past a few megabytes is
    // what keeps them from growing for years.
    for (const descriptor of [1, 2])
      try {
        const log = fstatSync(descriptor);
        if (log.isFile() && log.size > 5_000_000) ftruncateSync(descriptor, 0);
      } catch {
        /* not a file, or not ours to truncate */
      }
    process.on("unhandledRejection", (reason) => {
      process.stderr.write(
        `Unhandled rejection: ${reason instanceof Error ? reason.stack || reason.message : String(reason)}\n`,
      );
    });
    const initialConfig = await getConfig();
    // A dropped entry otherwise only shows up later, as "origin blocked" in a
    // browser that used to connect.
    const trusted = new Set(allowedOrigins(initialConfig));
    for (const entry of (initialConfig.SCHOLARBUDDY_ORIGINS || "").split(","))
      if (entry.trim() && !trusted.has(entry.trim()))
        process.stderr.write(
          `Ignoring SCHOLARBUDDY_ORIGINS entry "${entry.trim()}": use an exact https origin, or http://localhost for this computer.\n`,
        );
    const port = Number(
      initialConfig.SCHOLARBUDDY_BRIDGE_PORT ||
        initialConfig.NEXT_PUBLIC_SCHOLARBUDDY_BRIDGE_PORT ||
        32145,
    );
    const { nativeReminders } = await import("./reminder-native.mjs");
    const reminderDirectory = path.join(repoRoot, "bridge", ".notifications", "state");
    initialConfig._reminders = createReminderService({
      directory: reminderDirectory,
      native: nativeReminders(reminderDirectory),
      readOperations: async () => readCollection(await readConfigValues(), "operations"),
    });
    const server = createBridgeServer(Promise.resolve(initialConfig));
    server.on("listening", () => initialConfig._reminders.start());
    server.on("close", () => initialConfig._reminders.stop());
    server.listen(port, "127.0.0.1", () =>
      process.stdout.write(`ScholarBuddy bridge ready at http://127.0.0.1:${port}\n`),
    );
  }
}
