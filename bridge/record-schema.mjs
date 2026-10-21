import { CONSEQUENTIAL_SUBMISSION_STAGES, SUBMISSION_STAGES } from "../shared/constants.mjs";
import { t } from "./i18n.mjs";

export const submissionStages = new Set(SUBMISSION_STAGES);
export const consequentialSubmissionStages = new Set(CONSEQUENTIAL_SUBMISSION_STAGES);

const stringFields = new Set([
  "id",
  "collection",
  "title",
  "description",
  "status",
  "phase",
  "keywords",
  "journal",
  "severity",
  "type",
  "linkedObject",
  "linkedProject",
  "dueDate",
  "method",
  "zoteroKey",
  "year",
  "doi",
  "annotationKey",
  "attachmentKey",
  "quote",
  "comment",
  "pageLabel",
  "sourceTitle",
  "citationKey",
  "usedAt",
  "linkedAt",
  "manuscriptId",
  "manuscriptTitle",
  "projectId",
  "projectTitle",
  "manuscriptSection",
  "sectionSource",
  "sectionHeading",
  "reviewRound",
  "reviewSource",
  "resolution",
  "resolutionDecision",
  "issueKind",
  "actionPlan",
  "linkedDebtId",
  "originReviewId",
  "stage",
  "nextAction",
  "submissionId",
  "portalUrl",
  "correspondingAuthor",
  "correspondingEmail",
  "submittedAt",
  "stageStartedAt",
  "lastVerifiedAt",
  "expectedResponseDate",
  "nextCheckDate",
  "followUpDue",
  "round",
  "attemptId",
  "eventDate",
  "source",
  "rawStatus",
  "confidence",
  "emailMessageId",
  "entryDate",
  "promotedTo",
  "createdAt",
  "updatedAt",
]);
const numberFields = new Set([
  "version",
  "progress",
  "wordCount",
  "targetWords",
  "evidenceCoverage",
]);
const booleanFields = new Set(["active"]);
const stringArrayFields = new Set(["creators", "zoteroTags"]);
const knownFields = new Set([
  ...stringFields,
  ...numberFields,
  ...booleanFields,
  ...stringArrayFields,
]);
const dateFields = [
  "dueDate",
  "submittedAt",
  "stageStartedAt",
  "lastVerifiedAt",
  "expectedResponseDate",
  "nextCheckDate",
  "followUpDue",
  "eventDate",
  "entryDate",
  "createdAt",
  "updatedAt",
  "usedAt",
  "linkedAt",
];
const referenceFields = [
  "manuscriptId",
  "projectId",
  "attemptId",
  "linkedDebtId",
  "originReviewId",
  "promotedTo",
];

function invalid(message) {
  const error = new Error(message);
  error.status = 422;
  throw error;
}

// The grammar of a record id, wherever one is accepted: a file name, a reference
// between records, or a focus session's link to an operation.
export const RECORD_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

function validateReference(value) {
  if (!RECORD_ID.test(value)) invalid(t("records.reference"));
}

// A stored note is also edited by hand and by Obsidian itself, which writes
// `year: 2024` and a one-author list as a bare string. Reading accepts what
// plainly means the same thing; writing through decodeRecord stays strict.
export function coerceStoredRecord(value) {
  const record = { ...value };
  for (const [field, fieldValue] of Object.entries(record)) {
    if (stringFields.has(field)) {
      if (typeof fieldValue === "number" || typeof fieldValue === "boolean")
        record[field] = String(fieldValue);
      // A title typed as `[Draft]` is text, even though YAML reads it as a list.
      else if (Array.isArray(fieldValue) && fieldValue.every((item) => typeof item !== "object"))
        record[field] = `[${fieldValue.join(", ")}]`;
    } else if (numberFields.has(field)) {
      if (typeof fieldValue === "string" && fieldValue.trim() && Number.isFinite(+fieldValue))
        record[field] = Number(fieldValue);
    } else if (booleanFields.has(field)) {
      if (fieldValue === "true" || fieldValue === "false") record[field] = fieldValue === "true";
    } else if (stringArrayFields.has(field)) {
      if (typeof fieldValue === "string")
        record[field] = fieldValue.trim() ? [fieldValue.trim()] : [];
      else if (Array.isArray(fieldValue))
        record[field] = fieldValue.map((item) =>
          typeof item === "number" || typeof item === "boolean" ? String(item) : item,
        );
    }
  }
  return record;
}

// Validate the fields ScholarBuddy actually depends on. Other frontmatter is
// preserved so Obsidian plugins and future features can extend a record without
// requiring a schema release first.
export function decodeRecord(collection, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(t("records.object"));
  const source = { ...value };
  // These v0 transport fields are not part of the record model.
  delete source.zoteroUrl;
  delete source.revision;
  const record = {};
  for (const [field, fieldValue] of Object.entries(source)) {
    if (fieldValue === null || fieldValue === undefined) continue;
    if (!knownFields.has(field)) {
      record[field] = fieldValue;
      continue;
    }
    if (stringFields.has(field) && typeof fieldValue !== "string")
      invalid(t("records.string", field));
    if (numberFields.has(field) && typeof fieldValue !== "number")
      invalid(t("records.number", field));
    if (booleanFields.has(field) && typeof fieldValue !== "boolean")
      invalid(t("records.boolean", field));
    if (
      stringArrayFields.has(field) &&
      (!Array.isArray(fieldValue) || fieldValue.some((item) => typeof item !== "string"))
    )
      invalid(t("records.strings", field));
    record[field] = fieldValue;
  }
  if (record.version !== undefined && (!Number.isInteger(record.version) || record.version < 1))
    invalid(t("records.version"));
  if (record.collection && record.collection !== collection) invalid(t("records.collection"));
  for (const field of ["progress", "evidenceCoverage"]) {
    if (
      record[field] !== undefined &&
      (!Number.isFinite(record[field]) || record[field] < 0 || record[field] > 100)
    )
      invalid(t("records.percent", field));
  }
  for (const field of ["wordCount", "targetWords"]) {
    if (record[field] !== undefined && (!Number.isInteger(record[field]) || record[field] < 0))
      invalid(t("records.count", field));
  }
  for (const field of dateFields)
    if (record[field] && Number.isNaN(new Date(record[field]).getTime()))
      invalid(t("records.date", field));
  for (const field of referenceFields) if (record[field]) validateReference(record[field]);
  if (record.portalUrl) {
    const portal = URL.parse(record.portalUrl);
    if (!portal || !new Set(["http:", "https:"]).has(portal.protocol))
      invalid(t("records.portalUrl"));
  }
  if (collection !== "projects" && record.active !== undefined)
    invalid(t("records.activeProjectsOnly"));
  if (
    ["submission-attempts", "submission-events"].includes(collection) &&
    record.status &&
    !submissionStages.has(record.status)
  )
    invalid(t("records.submissionStatus"));
  return record;
}
