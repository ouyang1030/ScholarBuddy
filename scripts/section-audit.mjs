// Reports how often a Zotero highlight can be placed in a manuscript section
// from the full-text index, so the heading vocabulary is tuned against the
// real library instead of guessed at. Run with: node scripts/section-audit.mjs
import { detectPassageSection, fulltextIndex } from "../bridge/server.mjs";

const base = process.env.ZOTERO_LOCAL_URL || "http://127.0.0.1:23119";
const get = async (pathname) => {
  const response = await fetch(`${base}${pathname}`, { headers: { "Zotero-API-Version": "3" } });
  if (!response.ok) throw new Error(`Zotero returned ${response.status} for ${pathname}`);
  return response.json();
};

const limit = Number(process.argv[2] || 250);
const annotations = (await get(`/api/users/0/items?itemType=annotation&limit=${limit}&format=json`))
  .map((item) => item.data)
  .filter((data) => data.annotationText || data.annotationComment);
const attachmentKeys = [...new Set(annotations.map((data) => data.parentItem).filter(Boolean))];
const indexes = new Map(
  await Promise.all(
    attachmentKeys.map(async (key) => {
      try {
        const pages = (await get(`/api/users/0/items/${key}/fulltext`)).content.split("\f");
        return [key, fulltextIndex(pages)];
      } catch {
        return [key, null];
      }
    }),
  ),
);

const sections = new Map();
const misses = [];
let located = 0;
for (const data of annotations) {
  // The same parse production uses, so the audit measures what ships: a sort
  // index that does not name a page falls back to the position blob, and
  // Number.parseInt yields NaN rather than nothing when neither is usable.
  const [sortPage, offset] = String(data.annotationSortIndex || "")
    .split("|")
    .map((part) => Number.parseInt(part, 10));
  let page = sortPage;
  if (!Number.isInteger(page))
    try {
      page = JSON.parse(data.annotationPosition || "{}").pageIndex;
    } catch {
      page = Number.NaN;
    }
  const detected = detectPassageSection(indexes.get(data.parentItem), page, offset);
  if (detected) {
    located += 1;
    sections.set(detected.section, (sections.get(detected.section) || 0) + 1);
  } else if (misses.length < 12) {
    misses.push(
      `${data.parentItem} p${Number.isInteger(page) ? page : "?"} · ${(data.annotationText || "").slice(0, 60)}`,
    );
  }
}
const withOutline = [...indexes.values()].filter((item) => item?.outline.length).length;
console.log(`annotations       ${annotations.length}`);
console.log(`attachments       ${attachmentKeys.length} (${withOutline} with a usable outline)`);
console.log(
  `located           ${located} (${Math.round((located / annotations.length) * 100)}%)\n`,
);
for (const [section, count] of [...sections].sort((a, b) => b[1] - a[1]))
  console.log(`  ${section.padEnd(18)}${count}`);
if (misses.length) console.log("\nunlocated examples:");
for (const miss of misses) console.log(`  ${miss}`);
