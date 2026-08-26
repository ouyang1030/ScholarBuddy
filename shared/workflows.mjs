export const WORKFLOW_CONTRACTS = {
  "@ask-knowledge": {
    focus: "question",
    sources: { kbase: true, zotero: true, obsidian: true, calendar: false },
    visibleSources: ["kbase", "zotero", "obsidian"],
    outcome: "note",
  },
  "@evidence-for-claim": {
    focus: "claim",
    sources: { kbase: true, zotero: true, obsidian: false, calendar: false },
    visibleSources: ["kbase", "zotero", "obsidian"],
    outcome: "note",
  },
  "@result-explain": {
    focus: "result",
    sources: { kbase: true, zotero: false, obsidian: true, calendar: false },
    visibleSources: ["kbase", "obsidian"],
    outcome: "note",
  },
  "@reviewer-critique": {
    focus: "section",
    sources: { kbase: true, zotero: true, obsidian: false, calendar: false },
    visibleSources: ["kbase", "zotero", "obsidian"],
    outcome: "reviews",
  },
  "@plan-today": {
    focus: "plan",
    sources: { kbase: true, zotero: false, obsidian: false, calendar: true },
    visibleSources: ["kbase", "obsidian", "calendar"],
    outcome: "tasks",
  },
  "@write-section": {
    focus: "section",
    sources: { kbase: true, zotero: true, obsidian: true, calendar: false },
    visibleSources: ["kbase", "zotero", "obsidian"],
    outcome: "section",
  },
};

export function workflowContract(command) {
  return WORKFLOW_CONTRACTS[String(command || "").trim()] || null;
}
