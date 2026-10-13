// ScholarBuddy's records as Markdown files in the vault: parsing, validation,
// optimistic concurrency, history, and the queue that serialises every write.
import { copyFile, mkdir, readFile, readdir, rm, unlink } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { coerceStoredRecord, decodeRecord } from "./record-schema.mjs";
import { RECORD_COLLECTIONS, RECORD_ID_PREFIXES } from "../shared/constants.mjs";
import { compareRecords } from "../shared/records.mjs";
import { writeFileAtomic } from "./atomic-file.mjs";
import { httpError, requireText } from "./http.mjs";
import { t } from "./i18n.mjs";

let recordMutationTail = Promise.resolve();

export function serializeRecordMutation(operation) {
  const result = recordMutationTail.then(operation, operation);
  recordMutationTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

const recordCollections = new Set(RECORD_COLLECTIONS);

function recordRoot(config) {
  if (!config.OBSIDIAN_VAULT_PATH) throw new Error("OBSIDIAN_VAULT_PATH is not configured.");
  return path.join(config.OBSIDIAN_VAULT_PATH, "ScholarBuddy");
}

function safeCollection(value) {
  const collection = String(value || "");
  if (!recordCollections.has(collection)) {
    throw httpError(422, "Unsupported ScholarBuddy collection.");
  }
  return collection;
}

export function safeRecordId(value) {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(id)) {
    throw httpError(422, "Invalid ScholarBuddy record id.");
  }
  return id;
}

function newRecordId(collection) {
  const prefix = RECORD_ID_PREFIXES[collection] || "REC";
  return `${prefix}-${randomUUID().slice(0, 12).toUpperCase()}`;
}

function serializeRecord(record) {
  const metadata = { ...record };
  delete metadata.description;
  delete metadata.content;
  delete metadata.contentHash;
  if (metadata.collection === "projects") delete metadata.active;
  const lines = Object.entries(metadata).map(
    ([key, value]) => `${key}: ${JSON.stringify(value ?? null)}`,
  );
  const body = String(record.description || record.content || "").trim();
  return `---\n${lines.join("\n")}\n---\n\n${body}${body ? "\n" : ""}`;
}

function parseScalar(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return /^'.*'$/.test(raw) ? raw.slice(1, -1).replaceAll("''", "'") : raw;
  }
}

// Records are written one JSON value per line, but Obsidian's property editor
// rewrites a list in YAML's own two spellings: `[a, b]` on the line, or one
// `- item` per line underneath it. Both are read back as the list they are.
function parseFlowList(raw) {
  const inner = raw.slice(1, -1).trim();
  return inner ? inner.split(",").map((item) => parseScalar(item.trim())) : [];
}

export function parseRecord(text, fallbackId) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { id: fallbackId, title: fallbackId, description: text.trim() };
  const record = {};
  const lines = match[1].split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const split = line.indexOf(":");
    if (split < 1) continue;
    const key = line.slice(0, split).trim();
    if (!key) continue;
    const raw = line.slice(split + 1).trim();
    if (!raw) {
      const items = [];
      while (/^\s*-(\s|$)/.test(lines[index + 1] ?? "")) {
        index += 1;
        items.push(parseScalar(lines[index].replace(/^\s*-\s*/, "").trim()));
      }
      record[key] = items.length ? items : "";
      continue;
    }
    const value = parseScalar(raw);
    // `[[Note]]` is how a link is written by hand; as YAML it would be a list
    // holding a list, which is never what was meant.
    record[key] =
      typeof value === "string" && /^\[(?!\[).*\]$/.test(raw) ? parseFlowList(raw) : value;
  }
  return { ...record, id: fallbackId, description: match[2].trim() };
}

async function readStoredRecord(file, id, collection) {
  const content = await readFile(file, "utf8");
  try {
    const parsed = coerceStoredRecord(parseRecord(content, id));
    return {
      ...decodeRecord(collection, {
        ...parsed,
        version: Number.isInteger(parsed.version) ? parsed.version : 1,
      }),
      contentHash: recordHash(content),
    };
  } catch (error) {
    error.reason = error.message;
    error.message = `Invalid ScholarBuddy record ${collection}/${id}: ${error.message}`;
    throw error;
  }
}

function recordHash(content) {
  return createHash("sha256").update(content).digest("hex");
}

function checkRecordHash(expected, actual) {
  if (!expected || expected !== actual) {
    const error = new Error(t("records.fileChanged"));
    error.status = expected ? 409 : 428;
    error.code = expected ? "content_conflict" : "content_hash_required";
    throw error;
  }
}

async function atomicWrite(file, content, expectedHash) {
  await writeFileAtomic(file, content, {
    check:
      expectedHash === undefined
        ? undefined
        : async () => checkRecordHash(expectedHash, recordHash(await readFile(file, "utf8"))),
  });
}

// Snapshots are an audit trail, not a backup: cap them so a heavily edited
// record cannot grow the vault without bound. Names start with an ISO stamp,
// so a lexicographic sort is chronological.
const HISTORY_VERSIONS = 20;

async function pruneHistory(history) {
  let entries;
  try {
    entries = (await readdir(history)).filter((name) => name.endsWith(".md")).sort();
  } catch {
    return;
  }
  await Promise.all(
    entries
      .slice(0, Math.max(0, entries.length - HISTORY_VERSIONS))
      .map((name) => unlink(path.join(history, name)).catch(() => {})),
  );
}

async function archiveVersion(config, collection, id, file, suffix = "version") {
  const history = path.join(recordRoot(config), ".history", collection, id);
  await mkdir(history, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await copyFile(file, path.join(history, `${stamp}-${randomUUID().slice(0, 8)}-${suffix}.md`));
  await pruneHistory(history);
}

// A note that cannot be read is that note's problem. It is reported beside the
// records that did load instead of failing its collection: one hand-edited date
// or one sync-conflict copy used to empty the whole workbench.
export async function readCollection(config, collection) {
  const safe = safeCollection(collection);
  const folder = path.join(recordRoot(config), safe);
  let entries;
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return { records: [], invalid: [] };
    throw error;
  }
  const records = [];
  const invalid = [];
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map(async (entry) => {
        const id = entry.name.slice(0, -3);
        const skip = (reason) => invalid.push({ collection: safe, file: entry.name, reason });
        try {
          safeRecordId(id);
        } catch {
          // Listing it would offer a record no save or delete could address.
          skip(t("records.rename"));
          return;
        }
        try {
          records.push(await readStoredRecord(path.join(folder, entry.name), id, safe));
        } catch (error) {
          // Deleted between the listing and the read: there is nothing to report.
          if (error?.code === "ENOENT") return;
          skip(error?.status === 422 ? error.reason : t("records.unreadable"));
        }
      }),
  );
  records.sort((a, b) => compareRecords(safe, a, b));
  invalid.sort((a, b) => a.file.localeCompare(b.file));
  if (safe !== "projects") return { records, invalid };
  const workspace = await readWorkspaceState(config);
  const activeProjectId =
    workspace?.activeProjectId || records.find((record) => record.active)?.id || "";
  return {
    records: records.map((record) => ({ ...record, active: record.id === activeProjectId })),
    invalid,
  };
}

// Most callers look one record up and are indifferent to a broken neighbour. A
// caller that decides from the whole collection — "has this email been recorded
// already?" — asks for it `complete`, and is refused while one of its notes
// cannot be read rather than deciding from what happened to load.
export async function listRecords(config, collection, { complete = false } = {}) {
  const { records, invalid } = await readCollection(config, collection);
  if (complete && invalid.length)
    throw httpError(
      409,
      t(
        "records.repairFirst",
        `ScholarBuddy/${invalid[0].collection}/${invalid[0].file}`,
        invalid[0].reason,
      ),
      "collection_incomplete",
    );
  return records;
}

export async function workbenchState(config) {
  const collections = await Promise.all(
    [...recordCollections].map(async (collection) => [
      collection,
      await readCollection(config, collection),
    ]),
  );
  return {
    ...Object.fromEntries(collections.map(([collection, { records }]) => [collection, records])),
    invalid: collections.flatMap(([, { invalid }]) => invalid),
  };
}

// The file holds one pointer the Bridge can rebuild from the project notes, so a
// damaged copy is read as absent and replaced by the next project save instead
// of failing every load.
async function readWorkspaceState(config) {
  const file = path.join(recordRoot(config), ".workspace.json");
  try {
    const value = JSON.parse(await readFile(file, "utf8"));
    const activeProjectId = String(value?.activeProjectId || "");
    if (activeProjectId) safeRecordId(activeProjectId);
    return { activeProjectId };
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError || error?.status === 422)
      return null;
    throw error;
  }
}

async function writeWorkspaceState(config, activeProjectId) {
  await atomicWrite(
    path.join(recordRoot(config), ".workspace.json"),
    `${JSON.stringify({ activeProjectId }, null, 2)}\n`,
  );
}

export async function saveRecordUnlocked(config, collectionValue, incoming) {
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
    throw httpError(422, "Record must be an object.");
  }
  const collection = safeCollection(collectionValue);
  const id = incoming.id ? safeRecordId(incoming.id) : newRecordId(collection);
  const folder = path.join(recordRoot(config), collection);
  const file = path.join(folder, `${id}.md`);
  const requestedVersion = incoming.version;
  const requestedActive = collection === "projects" ? incoming.active : undefined;
  const input = { ...incoming };
  delete input.version;
  delete input.contentHash;
  if (collection === "projects") delete input.active;
  // A property is written as `name: value` on one line. A name holding a colon
  // or a line break would come back as a different property, or as several.
  for (const name of Object.keys(input))
    if (!name || name !== name.trim() || /[:\x00-\x1f]/.test(name))
      throw httpError(422, "A record property has a name that cannot be stored.");
  let previous = {};
  let exists = false;
  try {
    previous = await readStoredRecord(file, id, collection);
    exists = true;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (exists && !requestedVersion) {
    throw httpError(428, t("records.reloadBeforeSaving"), "version_required");
  }
  if (exists && requestedVersion !== previous.version) {
    throw httpError(409, t("records.changedBeforeSaving"), "version_conflict");
  }
  if (exists) checkRecordHash(incoming.contentHash, previous.contentHash);
  else if (requestedVersion || incoming.contentHash) {
    throw httpError(409, t("records.goneBeforeSaving"), "content_conflict");
  }
  const previousTime = new Date(previous.updatedAt || 0).getTime();
  const candidate = {
    ...previous,
    ...input,
    id,
    collection,
    version: exists ? previous.version + 1 : 1,
    updatedAt: new Date(
      Math.max(Date.now(), Number.isFinite(previousTime) ? previousTime + 1 : 0),
    ).toISOString(),
  };
  candidate.title = requireText(candidate.title, "Record title", 1_000);
  const record = decodeRecord(collection, candidate);
  if (!record.createdAt) record.createdAt = record.updatedAt;
  if (exists) await archiveVersion(config, collection, id, file);
  const content = serializeRecord(record);
  await atomicWrite(file, content, exists ? previous.contentHash : undefined);
  let active = false;
  if (collection === "projects") {
    const workspace = await readWorkspaceState(config);
    const currentActiveProjectId =
      workspace?.activeProjectId ||
      (previous.active
        ? id
        : (await listRecords(config, "projects")).find((item) => item.active)?.id) ||
      "";
    const activeProjectId =
      requestedActive === true
        ? id
        : requestedActive === false && currentActiveProjectId === id
          ? ""
          : currentActiveProjectId;
    await writeWorkspaceState(config, activeProjectId);
    active = activeProjectId === id;
  }
  return {
    ...record,
    contentHash: recordHash(content),
    ...(collection === "projects" ? { active } : {}),
  };
}

export async function saveRecord(config, collectionValue, incoming) {
  return serializeRecordMutation(() => saveRecordUnlocked(config, collectionValue, incoming));
}

async function deleteRecordUnlocked(config, collectionValue, idValue, version, contentHash) {
  const collection = safeCollection(collectionValue);
  const id = safeRecordId(idValue);
  const file = path.join(recordRoot(config), collection, `${id}.md`);
  let record;
  try {
    record = await readStoredRecord(file, id, collection);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    throw httpError(404, t("records.gone"));
  }
  if (!version) {
    throw httpError(428, t("records.reloadBeforeDeleting"), "version_required");
  }
  if (version !== record.version) {
    throw httpError(409, t("records.changedBeforeDeleting"), "version_conflict");
  }
  checkRecordHash(contentHash, record.contentHash);
  checkRecordHash(contentHash, recordHash(await readFile(file, "utf8")));
  await unlink(file);
  await rm(path.join(recordRoot(config), ".history", collection, id), {
    recursive: true,
    force: true,
  });
  if (collection === "projects") {
    const workspace = await readWorkspaceState(config);
    if (workspace?.activeProjectId === id) await writeWorkspaceState(config, "");
  }
  return { deleted: true, id, historyPurged: true };
}

export async function deleteRecord(config, collectionValue, idValue, version, contentHash) {
  return serializeRecordMutation(() =>
    deleteRecordUnlocked(config, collectionValue, idValue, version, contentHash),
  );
}

export async function saveAiNote(config, payload) {
  const title =
    String(payload.title || "ScholarBuddy research note")
      .replace(/[\\/:*?\"<>|]/g, "-")
      .trim()
      .slice(0, 120) || "Research note";
  const content = requireText(payload.content, "Note content", 200_000);
  const folder = path.join(recordRoot(config), "AI Outputs");
  await mkdir(folder, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(folder, `${title} ${stamp} ${randomUUID().slice(0, 8)}.md`);
  await atomicWrite(file, `${content}\n`);
  return { saved: true, path: path.relative(config.OBSIDIAN_VAULT_PATH, file) };
}
