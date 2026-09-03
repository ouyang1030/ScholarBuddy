// Single source of truth for values the browser bundle and the local Bridge must
// agree on. Anything duplicated here used to drift silently between the two.

export const RECORD_COLLECTIONS = [
  "projects",
  "research-questions",
  "manuscripts",
  "research-debt",
  "experiments",
  "reviews",
  "operations",
  "journal",
  "ideas",
  "reading-queue",
  "passages",
  "submission-attempts",
  "submission-events",
];

export const COLLECTION_LABELS = {
  projects: "Project",
  "research-questions": "Research question",
  manuscripts: "Manuscript",
  "research-debt": "Feedback",
  experiments: "Experiment",
  reviews: "Feedback",
  operations: "PhD operation",
  journal: "Research log entry",
  ideas: "Idea",
  "reading-queue": "Reading queue item",
  passages: "Passage",
  "submission-attempts": "Submission attempt",
  "submission-events": "Submission event",
};

export const MANUSCRIPT_SECTIONS = [
  "Unassigned",
  "Introduction",
  "Literature review",
  "Methods",
  "Results",
  "Discussion",
  "Conclusion",
];

export const RECORD_ID_PREFIXES = {
  projects: "PRJ",
  "research-questions": "RQ",
  manuscripts: "MS",
  "research-debt": "DEBT",
  experiments: "EXP",
  reviews: "REV",
  operations: "OPS",
  journal: "LOG",
  ideas: "IDEA",
  "reading-queue": "READ",
  passages: "PASS",
  "submission-attempts": "SUB",
  "submission-events": "SEV",
};

// A reading item is queued, being read, or read. A new item opens in the first
// of these, which is why the list stays in that order.
export const READING_QUEUE_STATUSES = ["Queued", "Reading", "Read"];

// The queue is not read in the order the states are offered in: what is being
// read now belongs at the top, what is finished belongs at the bottom, and "*"
// is where a status this vocabulary does not know (one typed by hand in
// Obsidian, or left over from an older list) sits — above the finished ones,
// because nothing says it is finished.
export const READING_QUEUE_STATUS_ORDER = ["Reading", "Queued", "*", "Read"];

// One state per outcome the operations board actually draws. The generic list
// offered seven, of which "Active" and "In progress" rendered identically and
// "Resolved", "Completed" and "Archived" all counted as finished.
export const OPERATION_STATUSES = ["Planned", "In progress", "Blocked", "Done", "Archived"];

// Every state that closes a record, across every vocabulary. Attention counts
// and the model's picture of open work both read this, so a new finished state
// has to be named here or finished work keeps being reported as outstanding.
export const CLOSED_RECORD_STATUSES = [
  "Done",
  "Read",
  "Resolved",
  "Completed",
  "Archived",
  "Dropped",
];

// One axis: what the commitment is about. Whether it has a deadline is the due
// date's job, and a submission is tracked as a submission attempt, not here.
export const OPERATION_TYPES = [
  "Supervision",
  "Teaching",
  "Ethics & data",
  "Funding",
  "Conference",
  "Service",
  "Admin",
];

export const RECORD_STATUS_ORDER = {
  "reading-queue": READING_QUEUE_STATUS_ORDER,
};

export const GENERIC_RECORD_STATUSES = [
  "Active",
  "Planned",
  "In progress",
  "Blocked",
  "Resolved",
  "Completed",
  "Archived",
];

export const SUBMISSION_STAGES = [
  "Preparing",
  "Submitted",
  "Technical Check",
  "With Editor",
  "Under Review",
  "Reviews Complete",
  "Decision Pending",
  "Revision Required",
  "Revised Submission",
  "Accepted",
  "Published",
  "Rejected",
  "Withdrawn",
];

// Stages that change what the record means, so email detection never applies
// them without an explicit confirmation.
export const CONSEQUENTIAL_SUBMISSION_STAGES = ["Accepted", "Published", "Rejected", "Withdrawn"];

// A collection with its own lifecycle names it here; the first entry is the
// state a new record opens in, so a default can never drift from the list.
export const RECORD_STATUS_OPTIONS = {
  ideas: ["Inbox", "Promoted", "Dropped"],
  "reading-queue": READING_QUEUE_STATUSES,
  operations: OPERATION_STATUSES,
  reviews: ["Open", "In progress", "Blocked", "Resolved"],
  "research-debt": ["Open", "In progress", "Blocked", "Resolved"],
  "submission-attempts": SUBMISSION_STAGES,
  "submission-events": SUBMISSION_STAGES,
};

export const AI_PROVIDER_DEFINITIONS = [
  {
    id: "deepseek",
    name: "DeepSeek",
    short: "DS",
    key: "DEEPSEEK_API_KEY",
    base: "DEEPSEEK_BASE_URL",
    model: "DEEPSEEK_MODEL",
    defaultBase: "https://api.deepseek.com",
    defaultModel: "deepseek-v4-flash",
    displayModel: "V4 Flash",
    adapter: "chat-completions",
  },
  {
    id: "kimi",
    name: "Kimi",
    short: "KM",
    key: "KIMI_API_KEY",
    base: "KIMI_BASE_URL",
    model: "KIMI_MODEL",
    defaultBase: "https://api.moonshot.ai/v1",
    defaultModel: "kimi-k3",
    displayModel: "K3",
    adapter: "chat-completions",
  },
  {
    id: "openai",
    name: "ChatGPT",
    short: "AI",
    key: "OPENAI_API_KEY",
    base: "OPENAI_BASE_URL",
    model: "OPENAI_MODEL",
    defaultBase: "https://api.openai.com/v1",
    defaultModel: "gpt-5.6-terra",
    displayModel: "GPT-5.6 Terra",
    adapter: "responses",
  },
  {
    id: "claude",
    name: "Claude",
    short: "CL",
    key: "ANTHROPIC_API_KEY",
    base: "ANTHROPIC_BASE_URL",
    model: "ANTHROPIC_MODEL",
    defaultBase: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-5",
    displayModel: "Sonnet 5",
    adapter: "anthropic-messages",
  },
  {
    id: "grok",
    name: "Grok",
    short: "GX",
    key: "XAI_API_KEY",
    base: "XAI_BASE_URL",
    model: "XAI_MODEL",
    defaultBase: "https://api.x.ai/v1",
    defaultModel: "grok-4.6",
    displayModel: "4.6",
    adapter: "responses",
  },
  {
    id: "gemini",
    name: "Gemini",
    short: "GM",
    key: "GEMINI_API_KEY",
    base: "GEMINI_BASE_URL",
    model: "GEMINI_MODEL",
    defaultBase: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-3.8-flash",
    displayModel: "3.8 Flash",
    adapter: "gemini-generate-content",
  },
];

export const AI_PROVIDERS = AI_PROVIDER_DEFINITIONS.map((provider) => provider.id);
