import type {
  Action,
  AiProvider,
  CollectionKey,
  ModuleKey,
  RecordItem,
  WorkbenchState,
  ZoteroPassage,
} from "../types";
import { daysSince, daysUntil, localDateKey, shortDate } from "./format";
import {
  AI_PROVIDER_DEFINITIONS,
  CLOSED_RECORD_STATUSES,
  COLLECTION_LABELS,
  GENERIC_RECORD_STATUSES,
  MANUSCRIPT_SECTIONS,
  OPERATION_TYPES,
  READING_QUEUE_STATUSES,
  RECORD_COLLECTIONS,
  RECORD_STATUS_OPTIONS,
  SUBMISSION_STAGES,
} from "../../shared/constants.mjs";

// Completeness is enforced by `collectionLabels` below: if shared/constants.mjs
// and CollectionKey ever disagree, that annotation fails to compile.
export const emptyState = Object.fromEntries(
  RECORD_COLLECTIONS.map((collection) => [collection, [] as RecordItem[]]),
) as unknown as WorkbenchState;

export const aiProviders: { id: AiProvider; name: string; short: string; fallbackModel: string }[] =
  AI_PROVIDER_DEFINITIONS.map((provider) => ({
    id: provider.id as AiProvider,
    name: provider.name,
    short: provider.short,
    fallbackModel: provider.displayModel,
  }));
export function isAiProvider(value: string | null): value is AiProvider {
  return aiProviders.some((provider) => provider.id === value);
}

export const navItems: { key: ModuleKey; label: string; icon: string }[] = [
  { key: "dashboard", label: "Today", icon: "⌂" },
  { key: "projects", label: "Projects", icon: "▦" },
  { key: "manuscript", label: "Manuscripts", icon: "¶" },
  { key: "library", label: "Library", icon: "⌁" },
  { key: "operations", label: "Operations", icon: "◷" },
];

export const quickActions: Action[] = [
  { label: "Ask research knowledge", meta: "Obsidian", tone: "mint", command: "@ask-knowledge" },
  {
    label: "Find evidence for a claim",
    meta: "Zotero",
    tone: "blue",
    command: "@evidence-for-claim",
  },
  { label: "Explain a result", meta: "Statistics", tone: "violet", command: "@result-explain" },
  {
    label: "Review manuscript section",
    meta: "Reviewer",
    tone: "orange",
    command: "@reviewer-critique",
  },
  { label: "Plan today’s research", meta: "Planning", tone: "mint", command: "@plan-today" },
  { label: "Draft manuscript section", meta: "Writing", tone: "violet", command: "@write-section" },
];

export const collectionLabels: Record<CollectionKey, string> = COLLECTION_LABELS;

export const submissionStages = SUBMISSION_STAGES;

export const operationTypes: string[] = OPERATION_TYPES;

// Every collection that does not run on the generic record lifecycle names its
// own states, and its first one is what a new record opens in — so a default can
// never name a state its own dropdown does not offer.
export function statusOptions(collection: CollectionKey): string[] {
  return (RECORD_STATUS_OPTIONS as Record<string, string[]>)[collection] || GENERIC_RECORD_STATUSES;
}
export function statusDefault(collection: CollectionKey) {
  return statusOptions(collection)[0];
}

// One class per reading state, so a queue card and a Zotero result can both
// carry the state visually instead of leaving the word as the only sign of it.
export function readingStatusClass(status: string) {
  const known = (READING_QUEUE_STATUSES as string[]).find(
    (option) => option.toLowerCase() === status.toLowerCase(),
  );
  return `is-${(known || "other").toLowerCase()}`;
}

// Matched without regard to case: a status is frontmatter a researcher can type
// by hand in Obsidian, and "done" closes a record exactly as "Done" does.
const closedStatuses = new Set(
  CLOSED_RECORD_STATUSES.map((status: string) => status.toLowerCase()),
);
export const isOpen = (item: RecordItem) => !closedStatuses.has((item.status || "").toLowerCase());

// Feedback and internal gaps are one user workflow even though older vaults store
// them in two collections. The model receives the same combined issue view as the UI.
export function recordContext(state: WorkbenchState, paperId = "") {
  const project = state.projects.find((item) => item.active) || state.projects[0];
  const paper = state.manuscripts.find((item) => item.id === paperId) || state.manuscripts[0];
  const questions = state["research-questions"]
    .filter((item) => !project || !item.linkedProject || item.linkedProject === project.id)
    .slice(0, 4);
  const scoped = (items: RecordItem[]) =>
    items.filter((item) => isOpen(item) && (!paper || item.manuscriptId === paper.id)).slice(0, 6);
  const feedback = [...scoped(state.reviews), ...scoped(state["research-debt"])].slice(0, 8);
  const operations = state.operations.filter(isOpen).slice(0, 5);
  // Planning a day without knowing what happened in the last few is guesswork,
  // so the recent log and the unjudged ideas travel with the project frame.
  const since = localDateKey(new Date(Date.now() - 3 * 86_400_000));
  const log = state.journal.filter((item) => (item.entryDate || "") >= since).slice(0, 5);
  const ideas = state.ideas.filter((item) => (item.status || "Inbox") === "Inbox").slice(0, 5);
  const summarize = (item: RecordItem) =>
    (item.description || item.title || "").replace(/\s+/g, " ").trim().slice(0, 200);
  const list = (title: string, lines: string[]) =>
    lines.length ? `${title}\n${lines.join("\n")}` : "";
  return [
    project &&
      `PROJECT ${project.id}: ${project.title}${project.phase ? ` (phase: ${project.phase})` : ""}`,
    list(
      "RESEARCH QUESTIONS:",
      questions.map((item) => `- ${item.id}: ${item.title}`),
    ),
    paper &&
      [
        `CURRENT PAPER ${paper.id}: ${paper.title}`,
        `- stage: ${paper.stage || paper.status || "Concept"} · target journal: ${paper.journal || "not set"}`,
        `- words: ${paper.wordCount || 0}/${paper.targetWords || 0} · evidence coverage: ${paper.evidenceCoverage || 0}%`,
        paper.nextAction ? `- next action: ${paper.nextAction}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    list(
      "OPEN FEEDBACK & PLANNED RESPONSES:",
      feedback.map((item) =>
        [
          `- [${item.severity || "Unspecified"}] ${item.id}: ${item.description || item.title}`,
          item.manuscriptSection ? `section ${item.manuscriptSection}` : "",
          item.reviewRound
            ? `${item.reviewRound}${item.reviewSource ? `, ${item.reviewSource}` : ""}`
            : "",
          item.actionPlan ? `plan: ${item.actionPlan}` : "",
          item.dueDate ? `due ${item.dueDate}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
      ),
    ),
    list(
      "READING QUEUE:",
      state["reading-queue"]
        .filter((item) => (item.status || "Queued") !== "Read")
        .slice(0, 6)
        .map(
          (item) =>
            `- [${item.status || "Queued"}] ${item.title}${item.year ? ` (${item.year})` : ""}${item.manuscriptId ? ` · ${item.manuscriptId}` : ""}`,
        ),
    ),
    list(
      "OPEN COMMITMENTS:",
      operations.map(
        (item) =>
          `- ${item.title}${item.type ? ` [${item.type}]` : ""}${item.dueDate ? ` · due ${item.dueDate}` : ""}`,
      ),
    ),
    list(
      "RECENT RESEARCH LOG:",
      log.map((item) => `- ${item.entryDate || "undated"}: ${summarize(item)}`),
    ),
    list(
      "IDEA INBOX:",
      ideas.map((item) => `- ${item.title}`),
    ),
  ]
    .filter(Boolean)
    .join("\n\n");
}

// Passages travel as data, not prose: the Bridge numbers them [P1…] and the same
// citation audit that guards [Z1] then applies to them.
export function contextPassages(state: WorkbenchState, paperId = "") {
  const linked = state.passages.filter((item) => item.manuscriptId === paperId);
  return (linked.length ? linked : state.passages).slice(0, 8).map((item) => ({
    quote: item.quote || item.comment || "",
    sourceTitle: item.sourceTitle || "",
    year: item.year || "",
    pageLabel: item.pageLabel || "",
    key: item.zoteroKey || item.id || "",
    manuscriptSection: item.manuscriptSection || "",
  }));
}

export const manuscriptSections: string[] = MANUSCRIPT_SECTIONS;

export function passageCitation(passage: ZoteroPassage) {
  const authors = passage.citationAuthors.length
    ? passage.citationAuthors
    : passage.creators.map((name) => name.split(" ").at(-1) || name);
  const author =
    authors.length > 2
      ? `${authors[0]} et al.`
      : authors.length === 2
        ? `${authors[0]} & ${authors[1]}`
        : authors[0] || "Unknown author";
  const attribution = `(${author}, ${passage.year || "n.d."})`;
  const text = passage.text || passage.comment;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return words >= 40 ? `${text}\n\n${attribution}` : `“${text}” ${attribution}`;
}

export function suggestedPassageSection(passage: ZoteroPassage) {
  const tagged = [...passage.tags, passage.comment].join(" ").toLowerCase();
  const explicit = manuscriptSections
    .slice(1)
    .find((section) => tagged.includes(section.toLowerCase()));
  if (explicit) return explicit;
  const text = `${passage.text} ${passage.comment}`.toLowerCase();
  if (/\b(in conclusion|we conclude|to conclude|conclusions?)\b/.test(text)) return "Conclusion";
  if (
    /\b(participants?|sample|protocol|procedure|measured|measurement|collected|data collection|statistical analysis|regression|model training|methods?|methodology)\b/.test(
      text,
    )
  )
    return "Methods";
  if (
    /\b(results?|significant|confidence interval|odds ratio|effect size|increased|decreased|associated with)\b|\b\d+(?:\.\d+)?%/.test(
      text,
    )
  )
    return "Results";
  if (
    /\b(discussion|suggests?|indicates?|implications?|limitations?|future research|may explain)\b/.test(
      text,
    )
  )
    return "Discussion";
  if (
    /\b(systematic review|meta-analysis|previous studies|prior studies|existing literature)\b/.test(
      text,
    )
  )
    return "Literature review";
  if (
    /\b(background|aimed? to|purpose of|research gap|little is known|remains unclear)\b/.test(text)
  )
    return "Introduction";
  return "Unassigned";
}

export type PassageSection = {
  section: string;
  heading: string;
  source: "tag" | "pdf" | "text" | "none";
};

// The Bridge reports where a highlight physically sits; this decides what to
// default the Section dropdown to. A section the researcher tagged themselves
// wins, then the heading the highlight sits under, and only then the wording of
// the highlight itself — which is also what places the ones the structure
// cannot, since a highlight in the abstract or the reference list summarises the
// whole paper rather than belonging to one of its sections.
export function passageSection(passage: ZoteroPassage): PassageSection {
  const heading = passage.sectionHeading || "";
  if (passage.sectionSource === "tag" && passage.section)
    return { section: passage.section, heading: "", source: "tag" };
  if (passage.sectionSource === "pdf" && passage.section && passage.section !== "Unassigned")
    return { section: passage.section, heading, source: "pdf" };
  const guessed = suggestedPassageSection(passage);
  return {
    section: guessed,
    heading,
    source: guessed === "Unassigned" ? "none" : "text",
  };
}

export type DataProps = {
  state: WorkbenchState;
  openEditor: (collection: CollectionKey, record?: Partial<RecordItem>) => void;
  // Returns the record the Bridge actually wrote: promoting an idea has to link
  // back to the id of the research question it just created.
  saveRecord: (collection: CollectionKey, record: Partial<RecordItem>) => Promise<RecordItem>;
  runAction: (action: Action) => void;
};
export type SubmissionAlert = {
  attempt: RecordItem;
  kind:
    | "revision-deadline"
    | "follow-up"
    | "expected-response"
    | "status-verification"
    | "stale-verification";
  tone: "critical" | "warning" | "quiet";
  title: string;
  detail: string;
};

export function submissionAlertKey(alert: SubmissionAlert) {
  return `${alert.attempt.id}:${alert.kind}`;
}

export function submissionAlerts(state: WorkbenchState): SubmissionAlert[] {
  const alerts: SubmissionAlert[] = [];
  for (const attempt of state["submission-attempts"]) {
    if (["Accepted", "Published", "Rejected", "Withdrawn"].includes(attempt.status || "")) continue;
    const revision = daysUntil(attempt.dueDate);
    const followUp = daysUntil(attempt.followUpDue);
    const expected = daysUntil(attempt.expectedResponseDate);
    const nextCheck = daysUntil(attempt.nextCheckDate);
    if (attempt.status === "Revision Required" && revision !== null && revision <= 14)
      alerts.push({
        attempt,
        kind: "revision-deadline",
        tone: revision < 0 ? "critical" : "warning",
        title: revision < 0 ? "Revision deadline has passed" : `Revision due in ${revision} days`,
        detail: `${attempt.journal || "Journal"} · ${attempt.round || "Current round"}`,
      });
    else if (followUp !== null && followUp <= 0)
      alerts.push({
        attempt,
        kind: "follow-up",
        tone: "warning",
        title: "Follow-up is due",
        detail: `${attempt.status || "Submission"} · ${daysSince(attempt.stageStartedAt || attempt.submittedAt)} days in stage`,
      });
    else if (expected !== null && expected < 0)
      alerts.push({
        attempt,
        kind: "expected-response",
        tone: "warning",
        title: "Expected response window passed",
        detail: `${attempt.status || "Submission"} · expected ${shortDate(attempt.expectedResponseDate)}`,
      });
    else if (nextCheck !== null && nextCheck <= 0)
      alerts.push({
        attempt,
        kind: "status-verification",
        tone: "quiet",
        title: "Status verification due",
        detail: `Last verified ${shortDate(attempt.lastVerifiedAt)}`,
      });
    else if (daysSince(attempt.lastVerifiedAt || attempt.submittedAt) >= 21)
      alerts.push({
        attempt,
        kind: "stale-verification",
        tone: "quiet",
        title: "Submission has not been verified recently",
        detail: `${daysSince(attempt.lastVerifiedAt || attempt.submittedAt)} days since the last check`,
      });
  }
  return alerts.slice(0, 5);
}
