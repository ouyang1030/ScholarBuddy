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
  "research-debt": "Research debt",
  experiments: "Experiment",
  reviews: "Review item",
  operations: "PhD operation",
  journal: "Research log entry",
  ideas: "Idea",
  "reading-queue": "Reading queue item",
  passages: "Passage",
  "submission-attempts": "Submission attempt",
  "submission-events": "Submission event",
};

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
    defaultBase: "https://api.moonshot.cn/v1",
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
    defaultModel: "gemini-3.7-flash",
    displayModel: "3.7 Flash",
    adapter: "gemini-generate-content",
  },
];

export const AI_PROVIDERS = AI_PROVIDER_DEFINITIONS.map((provider) => provider.id);
