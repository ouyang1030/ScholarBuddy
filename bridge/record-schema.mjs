import { CONSEQUENTIAL_SUBMISSION_STAGES, SUBMISSION_STAGES } from "../shared/constants.mjs";

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
  "workbuddyKeywords",
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

function validateReference(value) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value)) invalid("A linked record id is invalid.");
}

// Validate the fields ScholarBuddy actually depends on. Other frontmatter is
// preserved so Obsidian plugins and future features can extend a record without
// requiring a schema release first.
export function decodeRecord(collection, value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid("Record must be an object.");
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
      invalid(`${field} must be a string.`);
    if (numberFields.has(field) && typeof fieldValue !== "number")
      invalid(`${field} must be a number.`);
    if (booleanFields.has(field) && typeof fieldValue !== "boolean")
      invalid(`${field} must be true or false.`);
    if (
      stringArrayFields.has(field) &&
      (!Array.isArray(fieldValue) || fieldValue.some((item) => typeof item !== "string"))
    )
      invalid(`${field} must be an array of strings.`);
    record[field] = fieldValue;
  }
  if (record.version !== undefined && (!Number.isInteger(record.version) || record.version < 1))
    invalid("version must be a positive integer.");
  if (record.collection && record.collection !== collection)
    invalid("Record collection does not match its vault folder.");
  for (const field of ["progress", "evidenceCoverage"]) {
    if (
      record[field] !== undefined &&
      (!Number.isFinite(record[field]) || record[field] < 0 || record[field] > 100)
    )
      invalid(`${field} must be between 0 and 100.`);
  }
  for (const field of ["wordCount", "targetWords"]) {
    if (record[field] !== undefined && (!Number.isInteger(record[field]) || record[field] < 0))
      invalid(`${field} must be a non-negative integer.`);
  }
  for (const field of dateFields)
    if (record[field] && Number.isNaN(new Date(record[field]).getTime()))
      invalid(`${field} must be a valid date.`);
  for (const field of referenceFields) if (record[field]) validateReference(record[field]);
  if (record.portalUrl) {
    const portal = URL.parse(record.portalUrl);
    if (!portal || !new Set(["http:", "https:"]).has(portal.protocol))
      invalid("portalUrl must use http or https.");
  }
  if (collection !== "projects" && record.active !== undefined)
    invalid("active is only supported for projects.");
  if (
    ["submission-attempts", "submission-events"].includes(collection) &&
    record.status &&
    !submissionStages.has(record.status)
  )
    invalid("Unsupported submission status.");
  return record;
}

export const validateRecord = decodeRecord;
