// The submission tracker: status detection in publisher mail, the event log,
// and the recovery that completes a half-applied status change.
import { consequentialSubmissionStages, submissionStages } from "./record-schema.mjs";
import { runMail } from "./macos.mjs";
import { httpError, requireText, requireIsoDate } from "./http.mjs";
import { count, t } from "./i18n.mjs";
import {
  serializeRecordMutation,
  safeRecordId,
  listRecords,
  saveRecordUnlocked,
} from "./records.mjs";

const statusPatterns = [
  [
    "Published",
    /\b(published (?:online|in|by)|publication (?:is )?(?:now )?(?:online|available)|version of record (?:is )?(?:now )?(?:online|available))\b/i,
  ],
  ["Accepted", /\b(accept(?:ed|ance)|pleased to accept)\b/i],
  ["Rejected", /\b(reject(?:ed|ion)|declin(?:e|ed))\b/i],
  [
    "Revision Required",
    /\b(major revision|minor revision|revise and resubmit|revision (?:is )?required|invite you to revise)\b/i,
  ],
  [
    "Reviews Complete",
    /\b(required reviews? (?:are )?complete|reviews? completed|all reviews? (?:have been )?received)\b/i,
  ],
  [
    "Decision Pending",
    /\b(decision (?:in process|pending|being made)|awaiting (?:editor|decision))\b/i,
  ],
  [
    "Under Review",
    /\b(under review|in peer review|reviewers? (?:assigned|invited)|sent (?:out )?for review)\b/i,
  ],
  [
    "With Editor",
    /\b(with (?:the )?editor|editor assigned|handling editor|editorial assessment)\b/i,
  ],
  ["Technical Check", /\b(technical check|quality check|initial checks?|submission checks?)\b/i],
  [
    "Revised Submission",
    /\b(revised (?:manuscript|submission) (?:received|submitted)|revision submitted)\b/i,
  ],
  [
    "Submitted",
    /\b(submission (?:received|confirmed|successful)|manuscript submitted|thank you for (?:your )?submission)\b/i,
  ],
];

export function detectSubmissionStatus(value) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .slice(0, 30_000);
  for (const [stage, pattern] of statusPatterns) if (pattern.test(text)) return stage;
  return "";
}

function normalizeEmail(value = {}) {
  return {
    id: String(value.id || value.messageId || "").slice(0, 500),
    subject: String(value.subject || "").slice(0, 2_000),
    sender: String(value.sender || value.from || "").slice(0, 1_000),
    receivedAt: new Date(value.receivedAt || value.date || Date.now()).toISOString(),
    body: String(value.body || value.preview || "").slice(0, 30_000),
  };
}

export function submissionEmailCandidate(emailValue, attempts) {
  const email = normalizeEmail(emailValue);
  const haystack = `${email.subject}\n${email.sender}\n${email.body}`.toLowerCase();
  const ranked = attempts
    .flatMap((attempt) => {
      const submissionId = String(attempt.submissionId || "").trim();
      const title = String(attempt.manuscriptTitle || attempt.title || "").trim();
      const journal = String(attempt.journal || "").trim();
      let score = 0;
      if (submissionId && haystack.includes(submissionId.toLowerCase())) score += 8;
      if (title.length >= 12 && haystack.includes(title.toLowerCase())) score += 4;
      if (journal.length >= 4 && haystack.includes(journal.toLowerCase())) score += 2;
      return score ? [{ attempt, score }] : [];
    })
    .sort((a, b) => b.score - a.score);
  const match = ranked[0];
  const status = detectSubmissionStatus(`${email.subject}\n${email.body}`);
  if (!match || !status) return null;
  const confidence = match.score >= 8 ? "high" : match.score >= 4 ? "medium" : "low";
  return {
    email,
    attemptId: match.attempt.id,
    manuscriptId: match.attempt.manuscriptId || "",
    status,
    rawStatus: email.subject,
    confidence,
    score: match.score,
  };
}

function nextRevisionRound(value) {
  const match = String(value || "").match(/^R(\d+)$/i);
  return match ? `R${Number(match[1]) + 1}` : "R1";
}

async function verifySubmissionAttemptUnlocked(config, incoming) {
  const attemptId = safeRecordId(requireText(incoming.attemptId, "Submission attempt id", 100));
  const verifiedAt = requireIsoDate(
    incoming.verifiedAt || new Date().toISOString(),
    "Submission verification date",
  ).toISOString();
  const attempts = await listRecords(config, "submission-attempts");
  const attempt = attempts.find((item) => item.id === attemptId);
  if (!attempt) {
    throw httpError(404, "Submission attempt was not found.");
  }
  if (new Date(verifiedAt) < new Date(attempt.lastVerifiedAt || 0)) return attempt;
  return saveRecordUnlocked(config, "submission-attempts", {
    ...attempt,
    lastVerifiedAt: verifiedAt,
    rawStatus: incoming.rawStatus || attempt.rawStatus,
  });
}

export async function verifySubmissionAttempt(config, incoming) {
  return serializeRecordMutation(() => verifySubmissionAttemptUnlocked(config, incoming));
}

// Events are committed first. Replaying an existing event completes a failed
// attempt write; the date/status guard makes a successful replay a no-op.
async function applySubmissionEventUnlocked(config, attempt, event) {
  // A later Bridge edit must not be overwritten by replaying older history.
  if (event.attemptVersion !== undefined && attempt.version !== event.attemptVersion) return false;
  const existingTime = new Date(attempt.stageStartedAt || attempt.submittedAt || 0).getTime();
  const eventTime = new Date(event.eventDate).getTime();
  if (
    Number.isFinite(existingTime) &&
    (eventTime < existingTime || (eventTime === existingTime && attempt.status === event.status))
  )
    return false;
  const saved = await saveRecordUnlocked(config, "submission-attempts", {
    ...attempt,
    status: event.status,
    rawStatus: event.rawStatus || attempt.rawStatus || event.status,
    stageStartedAt: event.eventDate,
    lastVerifiedAt: new Date(
      Math.max(eventTime, new Date(attempt.lastVerifiedAt || 0).getTime()),
    ).toISOString(),
    submittedAt:
      event.status === "Submitted" && !attempt.submittedAt ? event.eventDate : attempt.submittedAt,
    round:
      event.status === "Revised Submission" && attempt.status !== event.status
        ? nextRevisionRound(attempt.round)
        : attempt.round,
  });
  Object.assign(attempt, saved);
  return true;
}

async function addSubmissionEventUnlocked(config, incoming) {
  const attemptId = safeRecordId(requireText(incoming.attemptId, "Submission attempt id", 100));
  const stage = requireText(incoming.status, "Submission status", 100);
  if (!submissionStages.has(stage)) {
    throw httpError(422, "Unsupported submission status.");
  }
  const eventDate = requireIsoDate(
    incoming.eventDate || new Date().toISOString(),
    "Submission event date",
  ).toISOString();
  const attempts = await listRecords(config, "submission-attempts");
  const attempt = attempts.find((item) => item.id === attemptId);
  if (!attempt) {
    throw httpError(404, "Submission attempt was not found.");
  }
  const existing = (await listRecords(config, "submission-events", { complete: true })).find(
    (event) =>
      event.attemptId === attemptId &&
      (incoming.id
        ? event.id === incoming.id
        : incoming.emailMessageId
          ? event.emailMessageId === incoming.emailMessageId
          : event.attemptVersion === attempt.version &&
            event.status === stage &&
            (event.eventDate === eventDate ||
              (!incoming.eventDate && event.attemptVersion === attempt.version)) &&
            event.source === (incoming.source || "Manual")),
  );
  if (existing) {
    if (existing.status !== stage || (incoming.eventDate && existing.eventDate !== eventDate)) {
      throw httpError(409, "This submission event already exists with different details.");
    }
    await applySubmissionEventUnlocked(config, attempt, existing);
    return existing;
  }
  if (stage === attempt.status) {
    const verified = await verifySubmissionAttemptUnlocked(config, {
      attemptId,
      verifiedAt: eventDate,
      rawStatus: incoming.rawStatus,
    });
    return {
      ...verified,
      eventDate,
      source: incoming.source || "Manual",
      confidence: incoming.confidence || "confirmed",
      verificationOnly: true,
    };
  }
  const event = await saveRecordUnlocked(config, "submission-events", {
    ...incoming,
    id: incoming.id,
    title: incoming.title || `${stage} · ${eventDate.slice(0, 10)}`,
    attemptId,
    manuscriptId: attempt.manuscriptId || "",
    attemptVersion: attempt.version,
    eventDate,
    status: stage,
    source: incoming.source || "Manual",
    confidence: incoming.confidence || "confirmed",
  });
  await applySubmissionEventUnlocked(config, attempt, event);
  return event;
}

export async function addSubmissionEvent(config, incoming) {
  return serializeRecordMutation(() => addSubmissionEventUnlocked(config, incoming));
}

const MAIL_SCAN_DAYS = 45;
const MAIL_SCAN_LIMIT = 250;

export async function syncSubmissionEmails(config, suppliedEmails) {
  // Recovery uses persisted events, so a retry can finish even if the original
  // message is no longer in the inbox. Keep it inside the record mutation queue.
  const recovered = await serializeRecordMutation(async () => {
    const attempts = await listRecords(config, "submission-attempts");
    const events = (await listRecords(config, "submission-events", { complete: true })).sort(
      (a, b) => a.eventDate.localeCompare(b.eventDate),
    );
    const completed = [];
    for (const event of events) {
      const attempt = attempts.find((item) => item.id === event.attemptId);
      if (
        attempt &&
        event.attemptVersion !== undefined &&
        (await applySubmissionEventUnlocked(config, attempt, event))
      )
        completed.push(event);
    }
    return completed;
  });
  const attempts = await listRecords(config, "submission-attempts");
  if (!attempts.length)
    return { scanned: 0, partial: "", updated: [], verified: 0, pending: [], ignored: 0 };
  let emails = Array.isArray(suppliedEmails) ? suppliedEmails : null;
  // Mail is walked one message at a time, so a busy inbox is cut off at a
  // ceiling. Saying so is what keeps "nothing new" from meaning "did not look".
  let partial = "";
  if (!emails) {
    const identifiers = attempts
      .flatMap((attempt) => [attempt.submissionId, attempt.manuscriptTitle])
      .filter(Boolean)
      .slice(0, 60);
    const scan = await runMail(config, "scan", {
      sinceDays: MAIL_SCAN_DAYS,
      limit: MAIL_SCAN_LIMIT,
      identifiers,
    });
    emails = scan.messages || [];
    if (scan.limited)
      partial =
        scan.unchecked > 0
          ? t("notes.mailUnchecked", count(scan.unchecked), MAIL_SCAN_DAYS)
          : t("notes.mailFirst", count(MAIL_SCAN_LIMIT));
  }
  const events = await listRecords(config, "submission-events", { complete: true });
  const knownMessages = new Set(events.map((event) => event.emailMessageId).filter(Boolean));
  const candidates = emails
    .map((email) => submissionEmailCandidate(email, attempts))
    .filter(Boolean)
    .sort((a, b) => a.email.receivedAt.localeCompare(b.email.receivedAt));
  const updated = [...recovered];
  let verified = 0;
  const pending = [];
  for (const candidate of candidates) {
    if (candidate.email.id && knownMessages.has(candidate.email.id)) continue;
    const attempt = attempts.find((item) => item.id === candidate.attemptId);
    if (attempt?.status === candidate.status) {
      if (new Date(candidate.email.receivedAt) <= new Date(attempt.lastVerifiedAt || 0)) continue;
      await verifySubmissionAttempt(config, {
        attemptId: candidate.attemptId,
        verifiedAt: candidate.email.receivedAt,
        rawStatus: candidate.rawStatus,
      });
      attempt.lastVerifiedAt = candidate.email.receivedAt;
      verified += 1;
      continue;
    }
    if (candidate.confidence !== "high" || consequentialSubmissionStages.has(candidate.status)) {
      pending.push(candidate);
      continue;
    }
    const event = await addSubmissionEvent(config, {
      attemptId: candidate.attemptId,
      status: candidate.status,
      rawStatus: candidate.rawStatus,
      eventDate: candidate.email.receivedAt,
      source: "Email",
      confidence: candidate.confidence,
      emailMessageId: candidate.email.id,
      description: `Detected from ${candidate.email.sender}: ${candidate.email.subject}`,
    });
    updated.push(event);
    if (candidate.email.id) knownMessages.add(candidate.email.id);
  }
  return {
    scanned: emails.length,
    partial,
    updated,
    verified,
    // The browser lists a pending match by subject and sender; the body stays here.
    pending: pending.map((candidate) => {
      const { id, subject, sender, receivedAt } = candidate.email;
      return { ...candidate, email: { id, subject, sender, receivedAt } };
    }),
    ignored: Math.max(0, emails.length - candidates.length),
  };
}
