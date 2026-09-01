export type ModuleKey = "dashboard" | "projects" | "manuscript" | "library" | "operations";
export type CollectionKey =
  | "projects"
  | "research-questions"
  | "manuscripts"
  | "research-debt"
  | "experiments"
  | "reviews"
  | "operations"
  | "journal"
  | "ideas"
  | "reading-queue"
  | "passages"
  | "submission-attempts"
  | "submission-events";
export type AiProvider = "deepseek" | "kimi" | "openai" | "claude" | "grok" | "gemini";
export type Action = { label: string; meta: string; tone: string; command: string };

export type RecordItem = {
  id: string;
  version: number;
  collection?: CollectionKey;
  title: string;
  description?: string;
  status?: string;
  progress?: number;
  active?: boolean;
  phase?: string;
  keywords?: string;
  journal?: string;
  wordCount?: number;
  targetWords?: number;
  evidenceCoverage?: number;
  severity?: string;
  type?: string;
  linkedObject?: string;
  linkedProject?: string;
  dueDate?: string;
  method?: string;
  zoteroKey?: string;
  creators?: string[];
  year?: string;
  doi?: string;
  annotationKey?: string;
  attachmentKey?: string;
  quote?: string;
  comment?: string;
  pageLabel?: string;
  zoteroTags?: string[];
  sourceTitle?: string;
  citationKey?: string;
  workbuddyKeywords?: string;
  usedAt?: string;
  linkedAt?: string;
  manuscriptId?: string;
  manuscriptTitle?: string;
  projectId?: string;
  projectTitle?: string;
  manuscriptSection?: string;
  sectionSource?: string;
  sectionHeading?: string;
  reviewRound?: string;
  reviewSource?: string;
  resolution?: string;
  resolutionDecision?: string;
  issueKind?: string;
  actionPlan?: string;
  linkedDebtId?: string;
  originReviewId?: string;
  stage?: string;
  nextAction?: string;
  submissionId?: string;
  portalUrl?: string;
  correspondingAuthor?: string;
  correspondingEmail?: string;
  submittedAt?: string;
  stageStartedAt?: string;
  lastVerifiedAt?: string;
  expectedResponseDate?: string;
  nextCheckDate?: string;
  followUpDue?: string;
  round?: string;
  attemptId?: string;
  eventDate?: string;
  source?: string;
  rawStatus?: string;
  confidence?: string;
  emailMessageId?: string;
  entryDate?: string;
  promotedTo?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type WorkbenchState = {
  projects: RecordItem[];
  "research-questions": RecordItem[];
  manuscripts: RecordItem[];
  "research-debt": RecordItem[];
  experiments: RecordItem[];
  reviews: RecordItem[];
  operations: RecordItem[];
  journal: RecordItem[];
  ideas: RecordItem[];
  "reading-queue": RecordItem[];
  passages: RecordItem[];
  "submission-attempts": RecordItem[];
  "submission-events": RecordItem[];
};

export type ZoteroItem = {
  key: string;
  title: string;
  creators: string[];
  year: string;
  itemType: string;
  doi: string;
  url: string;
  excerpt: string;
  evidenceType?: "full_text" | "abstract" | "metadata";
};
export type ZoteroPassage = {
  key: string;
  attachmentKey: string;
  zoteroItemKey: string;
  text: string;
  comment: string;
  pageLabel: string;
  pageIndex: number;
  section: string;
  sectionHeading: string;
  sectionSource: "tag" | "pdf" | "none";
  tags: string[];
  color: string;
  sourceTitle: string;
  creators: string[];
  citationAuthors: string[];
  year: string;
  citationKey: string;
  dateModified: string;
  url: string;
};
export type BridgeStatus = {
  bridge: boolean;
  paired: boolean;
  deepseek: { configured: boolean; model: string };
  kimi: { configured: boolean; model: string };
  openai: { configured: boolean; model: string };
  claude: { configured: boolean; model: string };
  grok: { configured: boolean; model: string };
  gemini: { configured: boolean; model: string };
  zotero: { connected: boolean; version: string | null };
  obsidian: { connected: boolean; vault: string | null };
  calendar: { connected: boolean };
};
export type BridgeIssue = "pairing" | "origin" | "unreachable" | "error" | null;
export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  notes: string;
  calendar: string;
  color: string;
};
export type FocusCalendarBlock = { id: string; start: string; end: string; target: string };
export type WorkflowResult = {
  output: string;
  provider: AiProvider;
  model: string;
  usage?: { total_tokens?: number } | null;
  sources: { zotero: ZoteroItem[]; obsidian: { title: string; path: string; snippet: string }[] };
  retrieval: Record<
    "zotero" | "obsidian" | "calendar",
    { selected: boolean; status: "disabled" | "ok" | "no_match" | "error"; error: string | null }
  >;
  manifest: {
    zotero: {
      id: string;
      key: string;
      title: string;
      creators: string[];
      year: string;
      doi: string;
      url: string;
      excerpt: string;
      evidenceType?: "full_text" | "abstract";
      query: string;
      retrievedAt: string;
    }[];
    bibliography: {
      key: string;
      title: string;
      creators: string[];
      year: string;
      doi: string;
      url: string;
      query: string;
      retrievedAt: string;
    }[];
    obsidian: {
      id: string;
      title: string;
      path: string;
      modified: string;
      snippet: string;
      query: string;
      retrievedAt: string;
    }[];
    passages: {
      id: string;
      key: string;
      title: string;
      year: string;
      pageLabel: string;
      quote: string;
      query: string;
      retrievedAt: string;
    }[];
  };
  invalidReferenceIds: string[];
  actions: WorkflowAction[];
  conversationId: string;
  reasoning?: string;
};
export type WorkflowAction = {
  id: string;
  title: string;
  kind: "task" | "gap" | "review";
  detail: string;
  severity: string;
  dueDate: string;
};
export type SubmissionEmailCandidate = {
  attemptId: string;
  manuscriptId?: string;
  status: string;
  rawStatus: string;
  confidence: string;
  email: { id: string; subject: string; sender: string; receivedAt: string };
};
export type SubmissionSyncResult = {
  scanned: number;
  updated: RecordItem[];
  verified?: number;
  pending: SubmissionEmailCandidate[];
};
