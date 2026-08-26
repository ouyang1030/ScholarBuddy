import { headingWords, sectionForHeading, sectionForWords } from "./section-headings.mjs";

const headingPattern = /^(#{1,6})[ \t]+(.+?)[ \t]*$/gm;

// Every Markdown heading is a boundary, not only the ones that name an IMRAD
// section: a Conclusion that ran to the end of the file would otherwise swallow
// "## References", and replacing it would delete the bibliography. A section
// ends at the next heading of the same or a shallower level, so its own
// subsections stay inside it.
function headings(text) {
  return [...text.matchAll(headingPattern)].map((match) => ({
    level: match[1].length,
    title: match[2].trim(),
    section: sectionForHeading(match[2]),
    start: match.index,
    bodyStart: match.index + match[0].length,
  }));
}

// Only the first heading for a section is reported. A "### Participants" under
// "## Methods" names the same section as its parent, and offering it as a second
// Methods would let the drawer rewrite a subsection believing it was the whole.
export function manuscriptSectionEntries(markdown) {
  const text = String(markdown || "");
  const all = headings(text);
  const seen = new Set();
  return all
    .map((entry, index) => {
      const next = all.slice(index + 1).find((item) => item.level <= entry.level);
      const end = next ? next.start : text.length;
      return { ...entry, end, text: text.slice(entry.bodyStart, end).trim() };
    })
    .filter((entry) => {
      if (!entry.section || entry.section === "Unassigned" || seen.has(entry.section)) return false;
      seen.add(entry.section);
      return true;
    });
}

export function manuscriptSectionText(markdown, section) {
  if (section === "Unassigned") return String(markdown || "").trim();
  return manuscriptSectionEntries(markdown).find((entry) => entry.section === section)?.text || "";
}

// A drafted body that opens by repeating its own heading would be nested under
// the real one, and the next parse would read the copy as a section of its own.
// Only a line that is *entirely* a heading may be dropped: "## Methods" and a
// line emphasised end to end are read the way a heading is, and anything else
// has to be the section's bare name and nothing more. Without that last rule
// "**Methods** were as follows." and "Methods varied." are both deleted as
// headings, which is how a draft loses its opening sentence.
const MARKDOWN_HEADING = /^\s*#{1,6}[ \t]+\S/;
const WHOLE_LINE_EMPHASIS = /^\s*(\*\*|__)(?!\s).*\1\s*:?\s*$/;
export function sectionBody(body, section) {
  let text = String(body || "").trim();
  for (let guard = 0; guard < 3; guard += 1) {
    const [line] = text.split("\n", 1);
    const isHeading = MARKDOWN_HEADING.test(line) || WHOLE_LINE_EMPHASIS.test(line);
    const named = isHeading
      ? sectionForHeading(line) === section
      : sectionForWords(headingWords(line), { allowPrefix: false }) === section;
    if (!named) break;
    text = text.slice(line.length).trim();
  }
  return text;
}

export function replaceManuscriptSection(markdown, section, body) {
  const text = String(markdown || "").trim();
  const cleanBody = sectionBody(body, section);
  // A body that was nothing but its own heading is not a rewrite of the section,
  // and writing it would delete one.
  if (!cleanBody) return text;
  const entry = manuscriptSectionEntries(text).find((item) => item.section === section);
  if (entry)
    return `${text.slice(0, entry.bodyStart).trimEnd()}\n${cleanBody}\n\n${text.slice(entry.end).trimStart()}`.trim();
  // A new heading matches the level the manuscript already uses for its
  // sections, so appending one to a "#"-per-section paper does not bury it, and
  // it goes in front of the back matter rather than after the reference list.
  const known = headings(text);
  const level = "#".repeat(known.find((item) => item.section)?.level || 2);
  // Back matter is what follows the last real section, not the first heading
  // that happens to be unassigned — an abstract sits at the front, and treating
  // it as back matter filed every new section above it, at the top of the paper.
  const lastSection = [...known]
    .reverse()
    .find((item) => item.section && item.section !== "Unassigned");
  const backMatter =
    lastSection &&
    known.find((item) => item.section === "Unassigned" && item.start > lastSection.start);
  const addition = `${level} ${section}\n\n${cleanBody}`;
  if (!text) return addition;
  if (!backMatter) return `${text}\n\n${addition}`;
  return `${text.slice(0, backMatter.start).trimEnd()}\n\n${addition}\n\n${text.slice(backMatter.start)}`;
}
