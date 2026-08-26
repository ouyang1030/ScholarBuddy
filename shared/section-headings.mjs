// One vocabulary for both sides of the section problem. The PDF reader has to
// decide whether a line of extracted text is a heading at all; a Markdown
// manuscript already says so with its "#". Only the classification is shared —
// each caller keeps its own evidence that it is looking at a heading.

const EXACT_SECTIONS = [
  {
    section: "Introduction",
    pattern: /^(introductions?|background|background and (motivation|related work)|motivation)$/,
  },
  {
    section: "Literature review",
    pattern:
      /^(related works?|literature review|related literature|prior work|theoretical (background|framework)|state of the art)$/,
  },
  {
    section: "Methods",
    pattern:
      /^(materials? and methods?|methods? and materials?|methods?|methodology|methodological approach|data and methods?|materials?|study design|experimental (setup|design|procedure)|participants|procedures?|data collection|(data|statistical) analysis)$/,
  },
  {
    section: "Results",
    pattern:
      /^(results?|results? and discussion|findings|main findings|evaluation|experiments?|experimental results?)$/,
  },
  {
    section: "Discussion",
    pattern:
      /^(discussions?|general discussion|limitations?|limitations and future (work|research)|implications?)$/,
  },
  {
    section: "Conclusion",
    pattern:
      /^(conclusions?|conclusions? and future work|concluding remarks|summary|summary and (conclusions?|outlook)|outlook)$/,
  },
  {
    section: "Unassigned",
    pattern:
      /^(abstract|keywords?|references?|bibliography|acknowledge?ments?|appendix( [a-z0-9]+)?|appendices|funding|declarations?|declaration of (competing )?interests?|supplementary( material)?|author contributions?|conflicts? of interest|data availability( statement)?|ethics( statement)?|notes)$/,
  },
];

// Matching on opening words alone is only safe once something else has already
// established that the line is a heading — a number in the PDF, a "#" in the
// manuscript. Without that, prose starting "Results of the model…" opens a
// section that does not exist.
const PREFIX_SECTIONS = [
  { section: "Introduction", pattern: /^(introduction|background)\b/ },
  {
    section: "Literature review",
    pattern: /^(related work|literature review|prior work|theoretical|state of the art)\b/,
  },
  {
    section: "Methods",
    pattern:
      /^(materials?|methods?|methodolog|study design|experimental|participants|procedure|data (collection|and methods))\b/,
  },
  { section: "Results", pattern: /^(results?|findings|evaluation|experiment)\b/ },
  { section: "Discussion", pattern: /^(discussion|limitations?|implications?)\b/ },
  { section: "Conclusion", pattern: /^(conclusions?|concluding|summary|outlook)\b/ },
  {
    section: "Unassigned",
    pattern:
      /^(abstract|references?|bibliography|acknowledge?ments?|appendix( [a-z0-9]+)?|appendices|funding|declaration|supplementary)\b/,
  },
];

// "3." and "IV)" and "B." all number a heading, and so does "3.2.1".
export const HEADING_NUMBER = /^(?:\d+(?:\.\d+)*[.)]?|[IVXLC]{1,5}[.)]|[A-Z][.)])\s+(?=\S)/;
// Only a top-level number earns the looser prefix match: "3.2 Summary of
// findings" sits inside a study chapter and is not the paper's conclusion.
export const TOP_LEVEL_NUMBER = /^(?:\d+[.)]?|[IVXLC]{1,5}[.)]|[A-Z][.)])\s+(?=\S)/;

// Trailing colons and the emphasis a drafting model likes to add are part of the
// decoration, not the name: "**3. Methods:**" is the methods heading.
export function headingWords(text) {
  return String(text || "")
    .replace(/^[\s#>*_`]+|[\s*_`:.]+$/g, "")
    .replace(HEADING_NUMBER, "")
    .trim()
    .toLowerCase();
}

export function sectionForWords(words, { allowPrefix = true } = {}) {
  if (!words) return "";
  for (const entry of EXACT_SECTIONS) if (entry.pattern.test(words)) return entry.section;
  if (!allowPrefix) return "";
  for (const entry of PREFIX_SECTIONS) if (entry.pattern.test(words)) return entry.section;
  return "";
}

// A Markdown "#" is proof enough of a heading that the opening words can be
// trusted, so a numbered "## 3.2 Materials and Methods" files itself the same
// way the plain word would.
export function sectionForHeading(text) {
  return sectionForWords(headingWords(text));
}
