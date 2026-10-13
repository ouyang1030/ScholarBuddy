// Reading the local Zotero library: items, annotations, and the section of the
// PDF a highlight sits in.
import { MANUSCRIPT_SECTIONS } from "../shared/constants.mjs";
import { TOP_LEVEL_NUMBER, headingWords, sectionForWords } from "../shared/section-headings.mjs";

import { queryTerms } from "./search-terms.mjs";

export async function zoteroRequest(config, pathname, signal) {
  const base = config.ZOTERO_LOCAL_URL || "http://127.0.0.1:23119";
  const response = await fetch(`${base}${pathname}`, {
    headers: { "Zotero-API-Version": "3" },
    signal: AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(8_000)]),
  });
  if (!response.ok) throw new Error(`Zotero returned ${response.status}.`);
  return response;
}

function creatorName(creator = {}) {
  return creator.name || [creator.firstName, creator.lastName].filter(Boolean).join(" ");
}

// Zotero tags mix author keywords with workflow markers — "/done", a star
// rating, a plugin's "no DOI found" — and with bilingual duplicates where the
// gloss trails the English term after a run of spaces. Only what starts with a
// letter or a digit is a subject keyword, and only its first segment is one.
export function itemKeywords(tags) {
  const keywords = [];
  const seen = new Set();
  for (const tag of tags || []) {
    const raw = String(typeof tag === "string" ? tag : tag?.tag || "").trim();
    // \w is ASCII-only even under the u flag, so a property escape is what keeps
    // "Übertraining" and "足球" from being filed away as symbols.
    if (!/^[\p{L}\p{N}]/u.test(raw)) continue;
    const keyword = raw
      .split(/\s{2,}/)[0]
      .trim()
      .slice(0, 60);
    const key = keyword.toLowerCase();
    if (!keyword || seen.has(key)) continue;
    seen.add(key);
    keywords.push(keyword);
    if (keywords.length === 8) break;
  }
  return keywords;
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
    keywords: itemKeywords(data.tags),
    excerpt: String(data.abstractNote || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2_000),
  };
}

function citationKey(data = {}) {
  if (data.citationKey) return data.citationKey;
  return (
    String(data.extra || "")
      .match(/^Citation Key:\s*(.+)$/im)?.[1]
      ?.trim() || ""
  );
}

// Zotero's reader builds its outline in the front end from the PDF's own
// bookmarks, never exposes it over the local API, and a third of this library's
// PDFs carry no bookmarks at all. The section a highlight sits in is therefore
// recovered from the full-text index every indexed attachment already has:
// `content` is the pages joined by form feeds, and an annotation's sortIndex
// counts the non-whitespace characters before it on its own page.
const PAGE_NUMBER_TAIL = /[\s.\u00b7]\d{1,4}$/;

// Extracted text says nothing about what is a heading, so the shared vocabulary
// is only consulted once the line has passed for one: short, unpunctuated, and
// few enough words. Only a top-level number makes it safe to match on opening
// words alone.
function headingSection(line) {
  const text = line.trim();
  if (!text || text.length > 80) return null;
  if (/[.,;:]$/.test(text)) return null;
  const words = headingWords(text);
  if (!words || words.split(/\s+/).length > 8) return null;
  return sectionForWords(words, { allowPrefix: TOP_LEVEL_NUMBER.test(text) }) || null;
}

// Running heads repeat the chapter title on every page and a table of contents
// lists every heading at once; both were enough on their own to file a whole
// thesis under "Introduction" before they were dropped here.
export function outlineFromFulltext(pages) {
  const candidates = [];
  for (const [pageIndex, page] of pages.entries()) {
    let sortOffset = 0;
    for (const line of page.split("\n")) {
      const section = headingSection(line);
      if (section)
        candidates.push({
          pageIndex,
          // annotationSortIndex counts a page's characters with the whitespace
          // removed. Recording headings in the same unit is what lets the page
          // text be thrown away once the outline is built.
          sortOffset,
          heading: line.trim(),
          section,
          key: line
            .trim()
            .toLowerCase()
            .replace(/[\d\s]+/g, " ")
            .trim(),
        });
      sortOffset += line.replace(/\s/g, "").length;
    }
  }
  const pagesByKey = new Map();
  for (const candidate of candidates)
    pagesByKey.set(
      candidate.key,
      (pagesByKey.get(candidate.key) || new Set()).add(candidate.pageIndex),
    );
  const contentsPages = new Set();
  const byPage = new Map();
  for (const candidate of candidates)
    byPage.set(candidate.pageIndex, [...(byPage.get(candidate.pageIndex) || []), candidate]);
  for (const [pageIndex, entries] of byPage)
    if (
      entries.length >= 4 &&
      entries.filter((entry) => PAGE_NUMBER_TAIL.test(entry.heading)).length >= 2
    )
      contentsPages.add(pageIndex);
  return (
    candidates
      .filter((candidate) => (pagesByKey.get(candidate.key)?.size || 0) < 3)
      .filter((candidate) => !contentsPages.has(candidate.pageIndex))
      // A contents entry keeps its page number where a heading never does, and a
      // two-page contents list is too short for the per-page rule above to see.
      .filter((candidate) => !PAGE_NUMBER_TAIL.test(candidate.heading))
      .map(({ pageIndex, sortOffset, heading, section }) => ({
        pageIndex,
        sortOffset,
        heading,
        section,
      }))
  );
}

// What is kept about an attachment after its text has been read: a few hundred
// bytes of structure instead of the megabytes of page text it was derived from.
export function fulltextIndex(pages) {
  return { pageCount: pages.length, outline: outlineFromFulltext(pages) };
}

export function detectPassageSection(index, pageIndex, sortOffset) {
  if (!index || !Number.isInteger(pageIndex) || !Number.isInteger(sortOffset)) return null;
  if (pageIndex < 0 || sortOffset < 0) return null;
  const { pageCount, outline } = index;
  if (!outline.length || pageIndex >= pageCount) return null;
  // A highlight above the first heading on its page belongs to the section that
  // started on an earlier one, so the search runs over the whole outline.
  let found = null;
  for (const entry of outline) {
    if (
      entry.pageIndex > pageIndex ||
      (entry.pageIndex === pageIndex && entry.sortOffset > sortOffset)
    )
      break;
    found = entry;
  }
  return found ? { section: found.section, heading: found.heading } : null;
}

const OUTLINE_TTL = 5 * 60_000;

const OUTLINE_CONCURRENCY = 8;

// Comfortably above the annotation ceiling below, so listing the passages of a
// heavily annotated library does not evict the entries it is still walking.
const OUTLINE_LIMIT = 500;

const outlineCache = new Map();

async function zoteroFulltextPages(config, attachmentKey, signal) {
  const response = await zoteroRequest(
    config,
    `/api/users/0/items/${encodeURIComponent(attachmentKey)}/fulltext`,
    signal,
  );
  const body = await response.json();
  const content = typeof body?.content === "string" ? body.content : "";
  return content ? content.split("\f") : null;
}

// Only the outline is cached. The page text behind it is read once, measured,
// and dropped: keeping hundreds of documents resident to answer "which section
// is this highlight in" cost orders of magnitude more memory than the answer.
async function zoteroOutline(config, attachmentKey, signal) {
  if (!attachmentKey) return null;
  const cached = outlineCache.get(attachmentKey);
  if (cached && Date.now() - cached.at < OUTLINE_TTL) return cached.value;
  let value = null;
  try {
    const pages = await zoteroFulltextPages(config, attachmentKey, signal);
    if (pages) value = fulltextIndex(pages);
  } catch (error) {
    // A request that was cancelled or timed out says nothing about the
    // attachment. AbortSignal.timeout rejects with TimeoutError, not
    // AbortError, so caching on that name alone pinned a slow Zotero as
    // "has no full text" for the whole TTL.
    if (error?.name === "AbortError" || error?.name === "TimeoutError") return null;
  }
  if (outlineCache.size >= OUTLINE_LIMIT) outlineCache.delete(outlineCache.keys().next().value);
  outlineCache.set(attachmentKey, { at: Date.now(), value });
  return value;
}

// A section the researcher wrote down themselves outranks one this reads out of
// the PDF, which in turn outranks the keyword guess the browser falls back to.
function passageSection(tags, index, pageIndex, sortOffset) {
  // Only a tag that *is* a section name is a filing decision. Matching the free
  // text of a comment by substring would file "compare to our results" under
  // Results and, worse, outrank the heading the highlight actually sits under.
  const filed = new Set(tags.map((tag) => tag.trim().toLowerCase()));
  const taggedSection = MANUSCRIPT_SECTIONS.slice(1).find((section) =>
    filed.has(section.toLowerCase()),
  );
  if (taggedSection) return { section: taggedSection, heading: "", source: "tag" };
  const detected = detectPassageSection(index, pageIndex, sortOffset);
  if (detected) return { ...detected, source: "pdf" };
  return { section: "", heading: "", source: "none" };
}

// PDF annotations carry their page in the position blob and their offset within
// that page in the sort index; anything else (EPUB, snapshots) has neither in a
// form this understands and is reported as unlocated.
function annotationLocation(note) {
  const [sortPage, sortOffset] = String(note.annotationSortIndex || "")
    .split("|")
    .map((part) => Number.parseInt(part, 10));
  let pageIndex = sortPage;
  if (!Number.isInteger(pageIndex))
    try {
      pageIndex = JSON.parse(note.annotationPosition || "{}").pageIndex;
    } catch {
      pageIndex = Number.NaN;
    }
  return {
    pageIndex: Number.isInteger(pageIndex) && pageIndex >= 0 ? pageIndex : -1,
    sortOffset: Number.isInteger(sortOffset) && sortOffset >= 0 ? sortOffset : -1,
  };
}

export function normalizeZoteroPassage(annotation, attachment, source, index = null) {
  const note = annotation?.data || annotation || {};
  const file = attachment?.data || attachment || {};
  const item = source?.data || source || {};
  const pageLabel = note.annotationPageLabel || "";
  const tags = (note.tags || [])
    .map((tag) => (typeof tag === "string" ? tag : tag.tag))
    .filter(Boolean);
  const { pageIndex, sortOffset } = annotationLocation(note);
  const section = passageSection(tags, index, pageIndex, sortOffset);
  return {
    key: note.key || annotation?.key || "",
    attachmentKey: file.key || note.parentItem || "",
    zoteroItemKey: item.key || file.parentItem || "",
    text: note.annotationText || "",
    comment: note.annotationComment || "",
    pageLabel,
    tags,
    pageIndex,
    section: section.section,
    sectionHeading: section.heading,
    sectionSource: section.source,
    color: note.annotationColor || "#ffd400",
    sourceTitle: item.title || file.title || "Untitled source",
    creators: (item.creators || []).map(creatorName).filter(Boolean),
    citationAuthors: (item.creators || [])
      .map((creator) => creator.lastName || creator.name)
      .filter(Boolean),
    year: String(item.date || "").match(/\d{4}/)?.[0] || "",
    citationKey: citationKey(item),
    dateModified: note.dateModified || "",
    url: `zotero://open-pdf/library/items/${file.key || note.parentItem || ""}?${new URLSearchParams({ ...(pageLabel ? { page: pageLabel } : {}), annotation: note.key || annotation?.key || "" })}`,
  };
}

export async function zoteroItemsByKey(config, keys, signal) {
  const unique = [...new Set(keys.filter(Boolean))];
  const chunks = Array.from({ length: Math.ceil(unique.length / 50) }, (_, index) =>
    unique.slice(index * 50, index * 50 + 50),
  );
  const batches = await Promise.all(
    chunks.map(async (chunk) => {
      const params = new URLSearchParams({
        itemKey: chunk.join(","),
        format: "json",
        limit: String(chunk.length),
      });
      const response = await zoteroRequest(config, `/api/users/0/items?${params}`, signal);
      return response.json();
    }),
  );
  const items = batches.flat();
  return new Map(items.map((item) => [item?.data?.key || item?.key, item]));
}

const PASSAGE_LIMIT = 250;

export async function listZoteroPassages(config, signal) {
  const params = new URLSearchParams({
    itemType: "annotation",
    limit: String(PASSAGE_LIMIT),
    format: "json",
    sort: "dateModified",
    direction: "desc",
  });
  const response = await zoteroRequest(config, `/api/users/0/items?${params}`, signal);
  const page = await response.json();
  // Zotero reports the size of the whole result beside the page it returned.
  // Without that header a full page is the only sign that more may exist.
  const header = response.headers.get("Total-Results");
  const counted = header !== null && Number.isInteger(+header) && +header >= page.length;
  const total = counted ? +header : page.length;
  const annotations = page.filter(
    (item) => item?.data?.annotationText || item?.data?.annotationComment,
  );
  const attachmentKeys = [
    ...new Set(annotations.map((item) => item.data.parentItem).filter(Boolean)),
  ];
  const attachments = await zoteroItemsByKey(config, attachmentKeys, signal);
  const sourceKeys = [
    ...new Set([...attachments.values()].map((item) => item?.data?.parentItem).filter(Boolean)),
  ];
  const sources = await zoteroItemsByKey(config, sourceKeys, signal);
  // One request per attachment, but not all at once: a library with hundreds of
  // annotated PDFs would otherwise open hundreds of sockets against the single
  // local Zotero server and hold every document in memory at the same time.
  // Only the outline of each survives the batch.
  const outlines = new Map();
  for (let index = 0; index < attachmentKeys.length; index += OUTLINE_CONCURRENCY) {
    const batch = attachmentKeys.slice(index, index + OUTLINE_CONCURRENCY);
    const loaded = await Promise.all(
      batch.map(async (key) => [key, await zoteroOutline(config, key, signal)]),
    );
    for (const [key, value] of loaded) outlines.set(key, value);
  }
  return {
    passages: annotations.map((annotation) => {
      const attachment = attachments.get(annotation.data.parentItem);
      return normalizeZoteroPassage(
        annotation,
        attachment,
        sources.get(attachment?.data?.parentItem),
        outlines.get(annotation.data.parentItem) || null,
      );
    }),
    limit: PASSAGE_LIMIT,
    total,
    truncated: counted ? total > page.length : page.length >= PASSAGE_LIMIT,
  };
}

export async function searchZotero(config, query, limit = 5, signal) {
  const cleanQuery = String(query || "")
    .trim()
    .slice(0, 160);
  const terms = queryTerms(cleanQuery).slice(0, 5);
  const searches = terms.length ? terms : [""];
  const batches = await Promise.all(
    searches.map(async (term) => {
      const params = new URLSearchParams({
        limit: String(Math.max(limit, 12)),
        format: "json",
        itemType: "-attachment",
        sort: "dateModified",
        direction: "desc",
      });
      if (term) {
        params.set("q", term);
        params.set("qmode", "everything");
      }
      const response = await zoteroRequest(config, `/api/users/0/items?${params}`, signal);
      const items = await response.json();
      return Array.isArray(items) ? items.map(normalizeZoteroItem) : [];
    }),
  );
  const ranked = new Map();
  for (const batch of batches)
    for (const item of batch) {
      const current = ranked.get(item.key) || { item, score: 0 };
      current.score += 1;
      ranked.set(item.key, current);
    }
  return [...ranked.values()]
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
    .slice(0, limit)
    .map((entry) => entry.item);
}

export function relevantFulltextExcerpt(pages, query) {
  const terms = queryTerms(query).slice(0, 8);
  if (!pages?.length || !terms.length) return "";
  const candidates = pages.flatMap((page, pageIndex) =>
    String(page || "")
      .split(/\n{2,}/)
      .map((text) => text.replace(/\s+/g, " ").trim())
      .filter((text) => text.length >= 80)
      .map((text) => ({
        pageIndex,
        text,
        score: terms.reduce(
          (score, term) => score + (text.toLowerCase().includes(term.toLowerCase()) ? 1 : 0),
          0,
        ),
      })),
  );
  return candidates
    .filter((item) => item.score)
    .sort((a, b) => b.score - a.score || a.pageIndex - b.pageIndex)
    .slice(0, 2)
    .map((item) => `[PDF p. ${item.pageIndex + 1}] ${item.text.slice(0, 800)}`)
    .join("\n\n");
}

// The exact excerpt is an upgrade on the abstract, never a precondition for
// having a source at all: one attachment Zotero cannot serve must not cost the
// researcher the other five papers and the whole run with them.
async function itemEvidence(config, item, query, signal) {
  try {
    const response = await zoteroRequest(
      config,
      `/api/users/0/items/${encodeURIComponent(item.key)}/children?${new URLSearchParams({ itemType: "attachment", limit: "20", format: "json" })}`,
      signal,
    );
    const children = await response.json();
    const pdf = (Array.isArray(children) ? children : []).find(
      (child) => child?.data?.contentType === "application/pdf",
    );
    const pages = pdf?.data?.key ? await zoteroFulltextPages(config, pdf.data.key, signal) : null;
    const excerpt = relevantFulltextExcerpt(pages, query);
    if (excerpt) return { ...item, excerpt, evidenceType: "full_text" };
  } catch (error) {
    // A cancelled run is not a missing PDF, and swallowing it here would leave
    // the abandoned request retrieving evidence nobody is waiting for.
    if (error?.name === "AbortError" || error?.name === "TimeoutError") throw error;
  }
  return { ...item, evidenceType: item.excerpt ? "abstract" : "metadata" };
}

export async function searchZoteroEvidence(config, query, limit = 6, signal) {
  const items = await searchZotero(config, query, limit, signal);
  return Promise.all(items.map((item) => itemEvidence(config, item, query, signal)));
}
