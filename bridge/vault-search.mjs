// Full-text search over the Obsidian vault, ranked with BM25 and cached per file.
import { access, readFile, readdir, stat } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { expandTerms, queryTerms } from "./search-terms.mjs";
import { count, t } from "./i18n.mjs";

async function walkMarkdown(root, current = root, files = [], ceiling = 2500, signal) {
  if (signal?.aborted) throw signal.reason;
  if (files.length >= ceiling) return files;
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (signal?.aborted) throw signal.reason;
    if (files.length >= ceiling) break;
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(current, entry.name);
    const relative = path.relative(root, full);
    // What the model wrote must not come back to it as evidence.
    if (entry.isDirectory() && relative === path.join("ScholarBuddy", "AI Outputs")) continue;
    if (entry.isDirectory()) await walkMarkdown(root, full, files, ceiling, signal);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(full);
  }
  return files;
}

const BM25_K1 = 1.2;

const BM25_B = 0.75;

function countOccurrences(haystack, term, cap) {
  let count = 0;
  for (
    let index = haystack.indexOf(term);
    index >= 0 && count < cap;
    index = haystack.indexOf(term, index + term.length)
  )
    count += 1;
  return count;
}

// Every AI run and note search used to re-read the whole vault. Keep the
// lowercased text per file, keyed on mtime and size so an edit in Obsidian is
// picked up by the next search, and cap the total so a large vault cannot grow
// the daemon's footprint without bound.
const VAULT_CACHE_MAX_BYTES = 48 * 1024 * 1024;

const VAULT_LIST_TTL_MS = 30_000;

const VAULT_FILE_LIMIT = 2500;

const vaultCache = new Map();

let vaultCacheBytes = 0;

let vaultList = { root: "", at: 0, files: [], truncated: false };

// An answer "from the vault" that only saw part of it has to say so.
export function vaultCoverageNote(root) {
  return vaultList.root === root && vaultList.truncated
    ? t("notes.vaultTruncated", count(VAULT_FILE_LIMIT))
    : "";
}

function rememberHaystack(file, info, haystack) {
  const previous = vaultCache.get(file);
  if (previous) vaultCacheBytes -= previous.haystack.length;
  vaultCache.set(file, { mtimeMs: info.mtimeMs, size: info.size, haystack });
  vaultCacheBytes += haystack.length;
  for (const [key, entry] of vaultCache) {
    if (vaultCacheBytes <= VAULT_CACHE_MAX_BYTES) break;
    if (key === file) continue;
    vaultCache.delete(key);
    vaultCacheBytes -= entry.haystack.length;
  }
}

async function vaultHaystack(file, info) {
  const cached = vaultCache.get(file);
  if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) {
    vaultCache.delete(file);
    vaultCache.set(file, cached);
    return cached.haystack;
  }
  const haystack = `${path.basename(file)}\n${await readFile(file, "utf8")}`.toLowerCase();
  rememberHaystack(file, info, haystack);
  return haystack;
}

async function vaultFiles(root, signal) {
  const now = Date.now();
  if (vaultList.root === root && now - vaultList.at < VAULT_LIST_TTL_MS) return vaultList.files;
  // One past the limit is how a vault of exactly that size is told from a larger one.
  const found = await walkMarkdown(root, root, [], VAULT_FILE_LIMIT + 1, signal);
  const files = found.slice(0, VAULT_FILE_LIMIT);
  if (vaultList.root !== root) {
    vaultCache.clear();
    vaultCacheBytes = 0;
  }
  vaultList = { root, at: now, files, truncated: found.length > VAULT_FILE_LIMIT };
  return files;
}

// `terms` lets a caller that has already ranked its own query supply them,
// while `query` stays the raw wording — the synonym table matches multi-word
// keys like "heart rate variability" against text, not against tokens.
export async function searchObsidian(config, query, limit = 5, signal, terms = null) {
  const root = config.OBSIDIAN_VAULT_PATH;
  if (!root) throw new Error("OBSIDIAN_VAULT_PATH is not configured.");
  await access(root, constants.R_OK);
  const base = terms?.length ? terms : queryTerms(query);
  if (!base.length) return [];
  const ranked = expandTerms(base, query);
  const matches = [];
  const documentFrequencies = new Array(ranked.length).fill(0);
  let scanned = 0;
  let totalLength = 0;
  for (const file of await vaultFiles(root, signal)) {
    if (signal?.aborted) throw signal.reason;
    let info;
    // The file list is cached, so a note can disappear between the walk and now.
    try {
      info = await stat(file);
    } catch {
      continue;
    }
    if (info.size > 2_000_000) continue;
    const haystack = await vaultHaystack(file, info);
    scanned += 1;
    totalLength += haystack.length;
    const frequencies = ranked.map((term) => countOccurrences(haystack, term, 64));
    frequencies.forEach((count, index) => {
      if (count) documentFrequencies[index] += 1;
    });
    if (frequencies.some(Boolean)) matches.push({ file, info, haystack, frequencies });
  }
  // BM25 over raw term counts: a rare term now outweighs a common one, and a long
  // note no longer wins on length alone the way plain frequency counting allowed.
  const averageLength = scanned ? totalLength / scanned : 1;
  const idf = documentFrequencies.map((df) => Math.log(1 + (scanned - df + 0.5) / (df + 0.5)));
  for (const match of matches)
    match.score = match.frequencies.reduce((total, count, index) => {
      if (!count) return total;
      const normalized =
        count + BM25_K1 * (1 - BM25_B + (BM25_B * match.haystack.length) / averageLength);
      return total + idf[index] * ((count * (BM25_K1 + 1)) / normalized);
    }, 0);
  const top = matches
    .sort((a, b) => b.score - a.score || b.info.mtimeMs - a.info.mtimeMs)
    .slice(0, limit);
  // Snippets need the original casing, so only the returned matches are re-read.
  return Promise.all(
    top.map(async (match) => {
      // Offsets are into the haystack, which is prefixed with the file name.
      const prefix = path.basename(match.file).length + 1;
      const offsets = ranked
        .map((term) => match.haystack.indexOf(term))
        .filter((value) => value >= 0);
      const start = Math.max(0, Math.min(...offsets) - prefix - 180);
      const content = await readFile(match.file, "utf8").catch(() => "");
      return {
        title: path.basename(match.file, ".md"),
        path: path.relative(root, match.file),
        snippet: content
          .slice(start, start + 700)
          .replace(/\s+/g, " ")
          .trim(),
        score: match.score,
        modified: match.info.mtime.toISOString(),
      };
    }),
  );
}
