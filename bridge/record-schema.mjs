import { CONSEQUENTIAL_SUBMISSION_STAGES, SUBMISSION_STAGES } from "../shared/constants.mjs";

export const submissionStages = new Set(SUBMISSION_STAGES);
export const consequentialSubmissionStages = new Set(CONSEQUENTIAL_SUBMISSION_STAGES);

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
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(String(value)))
    invalid("A linked record id is invalid.");
}

export function validateRecord(collection, record) {
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
  if (record.portalUrl && !/^https?:\/\//i.test(record.portalUrl))
    invalid("portalUrl must use http or https.");
  if (
    collection === "projects" &&
    record.active !== undefined &&
    typeof record.active !== "boolean"
  )
    invalid("active must be true or false.");
  if (
    ["submission-attempts", "submission-events"].includes(collection) &&
    record.status &&
    !submissionStages.has(record.status)
  )
    invalid("Unsupported submission status.");
  return record;
}
