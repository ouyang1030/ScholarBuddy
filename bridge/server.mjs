import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configFile = path.join(repoRoot, ".env.local");
const calendarScript = path.join(repoRoot, "bridge", "calendar.jxa");
const execFileAsync = promisify(execFile);

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return [];
    const split = trimmed.indexOf("=");
    const key = trimmed.slice(0, split).trim();
    let value = trimmed.slice(split + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return [[key, value]];
  }));
}

async function getConfig() {
  let local = {};
  try { local = parseEnv(await readFile(configFile, "utf8")); } catch { /* use process environment */ }
  return { ...local, ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined)) };
}

function corsHeaders(request, config) {
  const origin = request.headers.origin || "";
  const allowed = (config.WORKBUDDY_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean);
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0] || "http://localhost:3000",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Private-Network": "true",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}

function json(request, config, body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(request, config), "Content-Type": "application/json; charset=utf-8" } });
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > 250_000) throw new Error("Request is too large.");
  return text ? JSON.parse(text) : {};
}

async function zoteroRequest(config, pathname) {
  const base = config.ZOTERO_LOCAL_URL || "http://127.0.0.1:23119";
  const response = await fetch(`${base}${pathname}`, { headers: { "Zotero-API-Version": "3" }, signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`Zotero returned ${response.status}.`);
  return response;
}

function creatorName(creator = {}) {
  return creator.name || [creator.firstName, creator.lastName].filter(Boolean).join(" ");
}

function normalizeZoteroItem(item) {
  const data = item?.data || item || {};
  return {
    key: data.key || item?.key || "",
    title: data.title || "Untitled item",
    creators: (data.creators || []).map(creatorName).filter(Boolean),
    year: String(data.date || "").match(/\d{4}/)?.[0] || "",
    itemType: data.itemType || "",
    doi: data.DOI || "",
    url: data.url || (data.key ? `zotero://select/library/items/${data.key}` : ""),
  };
}

async function searchZotero(config, query, limit = 5) {
  const params = new URLSearchParams({ q: query, qmode: "everything", limit: String(limit), format: "json", itemType: "-attachment" });
  const response = await zoteroRequest(config, `/api/users/0/items?${params}`);
  const items = await response.json();
  return Array.isArray(items) ? items.map(normalizeZoteroItem) : [];
}

async function walkMarkdown(root, current = root, files = [], ceiling = 2500) {
  if (files.length >= ceiling) return files;
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (files.length >= ceiling) break;
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) await walkMarkdown(root, full, files, ceiling);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(full);
  }
  return files;
}

function queryTerms(query) {
  return [...new Set(query.toLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter((term) => term.length > 2))].slice(0, 12);
}

async function searchObsidian(config, query, limit = 5) {
  const root = config.OBSIDIAN_VAULT_PATH;
  if (!root) throw new Error("OBSIDIAN_VAULT_PATH is not configured.");
  await access(root, constants.R_OK);
  const terms = queryTerms(query);
  if (!terms.length) return [];
  const results = [];
  for (const file of await walkMarkdown(root)) {
    const info = await stat(file);
    if (info.size > 2_000_000) continue;
    const content = await readFile(file, "utf8");
    const haystack = `${path.basename(file)}\n${content}`.toLowerCase();
    const score = terms.reduce((total, term) => total + Math.min(8, haystack.split(term).length - 1), 0);
    if (!score) continue;
    const firstIndex = Math.max(0, Math.min(...terms.map((term) => haystack.indexOf(term)).filter((value) => value >= 0)) - 180);
    const snippet = content.slice(firstIndex, firstIndex + 700).replace(/\s+/g, " ").trim();
    results.push({ title: path.basename(file, ".md"), path: path.relative(root, file), snippet, score, modified: info.mtime.toISOString() });
  }
  return results.sort((a, b) => b.score - a.score || b.modified.localeCompare(a.modified)).slice(0, limit);
}

function modelConfig(config, provider) {
  if (provider === "kimi") return {
    apiKey: config.KIMI_API_KEY,
    baseUrl: (config.KIMI_BASE_URL || "https://api.moonshot.cn/v1").replace(/\/$/, ""),
    model: config.KIMI_MODEL || "kimi-k3",
  };
  return {
    apiKey: config.DEEPSEEK_API_KEY,
    baseUrl: (config.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, ""),
    model: config.DEEPSEEK_MODEL || "deepseek-v4-flash",
  };
}

function buildPrompt(payload, zotero, obsidian) {
  const sourceText = [
    zotero.length ? `ZOTERO RECORDS:\n${zotero.map((item, i) => `[Z${i + 1}] ${item.title}. ${item.creators.join(", ")} (${item.year || "n.d."}). DOI: ${item.doi || "not recorded"}. Zotero key: ${item.key}`).join("\n")}` : "ZOTERO RECORDS: none retrieved.",
    obsidian.length ? `OBSIDIAN NOTES:\n${obsidian.map((note, i) => `[O${i + 1}] ${note.title} (${note.path})\n${note.snippet}`).join("\n\n")}` : "OBSIDIAN NOTES: none retrieved.",
    payload.projectContext ? `PROJECT CONTEXT:\n${payload.projectContext}` : "",
  ].filter(Boolean).join("\n\n");
  return `${payload.command || "@research-task"}\n\nTASK:\n${payload.input}\n\n${sourceText}`;
}

async function runModel(config, payload, zotero, obsidian) {
  const provider = payload.provider === "kimi" ? "kimi" : "deepseek";
  const target = modelConfig(config, provider);
  if (!target.apiKey) throw new Error(`${provider === "kimi" ? "KIMI" : "DEEPSEEK"}_API_KEY is missing in .env.local.`);
  const system = "You are an exacting sports analytics PhD research assistant. Use only the supplied research context for source-specific claims. Cite Zotero records as [Z1] and Obsidian notes as [O1]. Clearly separate evidence, inference, and recommendations. Mark unsupported claims as [AUTHOR CHECK]. Return useful Markdown with a short conclusion and next actions.";
  const response = await fetch(`${target.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${target.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: target.model, messages: [{ role: "system", content: system }, { role: "user", content: buildPrompt(payload, zotero, obsidian) }], temperature: provider === "kimi" ? 1 : 0.2, max_tokens: 2400 }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `${provider} returned ${response.status}.`);
  const output = body?.choices?.[0]?.message?.content;
  if (!output) throw new Error(`${provider} returned no text.`);
  return { output, provider, model: body.model || target.model, usage: body.usage || null };
}

async function bridgeStatus(config) {
  const status = {
    bridge: true,
    deepseek: { connected: Boolean(config.DEEPSEEK_API_KEY), model: config.DEEPSEEK_MODEL || "deepseek-v4-flash" },
    kimi: { connected: Boolean(config.KIMI_API_KEY), model: config.KIMI_MODEL || "kimi-k3" },
    zotero: { connected: false, version: null },
    obsidian: { connected: false, vault: config.OBSIDIAN_VAULT_PATH ? path.basename(config.OBSIDIAN_VAULT_PATH) : null },
    calendar: { connected: false },
  };
  try {
    const response = await zoteroRequest(config, "/api/users/0/items?limit=1&format=json");
    status.zotero = { connected: true, version: response.headers.get("X-Zotero-Version") };
  } catch { /* offline */ }
  try {
    await access(config.OBSIDIAN_VAULT_PATH, constants.R_OK | constants.W_OK);
    status.obsidian.connected = true;
  } catch { /* unavailable */ }
  try {
    await runCalendar("list", { start: new Date().toISOString(), end: new Date(Date.now() + 1000).toISOString() });
    status.calendar.connected = true;
  } catch { /* unavailable */ }
  return status;
}

async function runCalendar(action, payload) {
  const { stdout } = await execFileAsync("/usr/bin/osascript", ["-l", "JavaScript", calendarScript, action, JSON.stringify(payload)], { timeout: 20_000, maxBuffer: 2_000_000 });
  return JSON.parse(stdout.trim() || "{}");
}

async function handle(request) {
  const config = await getConfig();
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, config) });
  if (url.pathname === "/health" && request.method === "GET") return json(request, config, await bridgeStatus(config));
  if (url.pathname === "/zotero/search" && request.method === "GET") return json(request, config, { items: await searchZotero(config, url.searchParams.get("q") || "", 12) });
  if (url.pathname === "/obsidian/search" && request.method === "GET") return json(request, config, { notes: await searchObsidian(config, url.searchParams.get("q") || "", 12) });
  if (url.pathname === "/calendar/today" && request.method === "GET") {
    const requestedDate = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const start = new Date(`${requestedDate}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return json(request, config, await runCalendar("list", { start: start.toISOString(), end: end.toISOString() }));
  }
  if (url.pathname === "/calendar/event" && request.method === "POST") {
    const payload = await readJson(request);
    return json(request, config, await runCalendar(payload.id ? "update" : "create", payload), payload.id ? 200 : 201);
  }
  if (url.pathname === "/calendar/event" && request.method === "DELETE") {
    const payload = await readJson(request);
    if (!payload.id) return json(request, config, { error: "Calendar event id is required." }, 400);
    return json(request, config, await runCalendar("delete", payload));
  }
  if (url.pathname === "/obsidian/note" && request.method === "POST") {
    const payload = await readJson(request);
    const title = String(payload.title || "WorkBuddy research note").replace(/[\\/:*?\"<>|]/g, "-").trim().slice(0, 120);
    const content = String(payload.content || "").trim();
    if (!content) return json(request, config, { error: "Note content is required." }, 400);
    const folder = path.join(config.OBSIDIAN_VAULT_PATH, "WorkBuddy");
    await mkdir(folder, { recursive: true });
    const file = path.join(folder, `${title || "Research note"}.md`);
    await writeFile(file, `${content}\n`, "utf8");
    return json(request, config, { saved: true, path: path.relative(config.OBSIDIAN_VAULT_PATH, file) }, 201);
  }
  if (url.pathname === "/ai/run" && request.method === "POST") {
    const payload = await readJson(request);
    const input = String(payload.input || "").trim();
    if (!input) return json(request, config, { error: "Task input is required." }, 400);
    const useZotero = payload.sources?.zotero !== false;
    const useObsidian = payload.sources?.obsidian !== false;
    const [zotero, obsidian] = await Promise.all([
      useZotero ? searchZotero(config, input).catch(() => []) : [],
      useObsidian ? searchObsidian(config, input).catch(() => []) : [],
    ]);
    const result = await runModel(config, { ...payload, input }, zotero, obsidian);
    return json(request, config, { ...result, sources: { zotero, obsidian } });
  }
  return json(request, config, { error: "Not found." }, 404);
}

const initialConfig = await getConfig();
const port = Number(initialConfig.WORKBUDDY_BRIDGE_PORT || 32145);
const server = createServer(async (incoming, outgoing) => {
  const chunks = [];
  for await (const chunk of incoming) chunks.push(chunk);
  const request = new Request(`http://127.0.0.1:${port}${incoming.url}`, { method: incoming.method, headers: incoming.headers, body: ["GET", "HEAD"].includes(incoming.method) ? undefined : Buffer.concat(chunks) });
  try {
    const response = await handle(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    const config = await getConfig();
    const response = json(request, config, { error: error instanceof Error ? error.message : "Bridge request failed." }, 500);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`WorkBuddy bridge ready at http://127.0.0.1:${port}\n`);
});
