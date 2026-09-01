"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clampProgress, daysSince, localDateKey, shortDate } from "../../lib/format";
import { isOpen, submissionStages } from "../../lib/workbench";
import type { DataProps } from "../../lib/workbench";
import type {
  CollectionKey,
  RecordItem,
  SubmissionEmailCandidate,
  SubmissionSyncResult,
  WorkbenchState,
} from "../../types";
import { EmptyState, ProgressRing } from "../primitives";
import { ManuscriptSummary } from "./ManuscriptSummary";
import { LinkedPassages } from "../panels/LinkedPassages";

// Submission stages move on a scale of weeks, so opening this view checks Mail at
// most once per window instead of polling: a scan spawns osascript and walks the
// inbox, which is far too heavy to repeat while the tab happens to be open.
const MAIL_CHECK_KEY = "workbuddy-submission-last-mail-check";
const MAIL_CHECK_WINDOW_MS = 6 * 60 * 60 * 1000;

function mailCheckedRecently() {
  const last = Number(window.localStorage.getItem(MAIL_CHECK_KEY) || 0);
  return Number.isFinite(last) && Date.now() - last < MAIL_CHECK_WINDOW_MS;
}

export type SubmissionTrackerProps = {
  manuscript: RecordItem;
  state: WorkbenchState;
  openEditor: (collection: CollectionKey, record?: Partial<RecordItem>) => void;
  addEvent: (record: Partial<RecordItem>) => Promise<void>;
  verifyAttempt: (attemptId: string) => Promise<void>;
  syncEmail: () => Promise<SubmissionSyncResult>;
};
export function SubmissionTracker({
  manuscript,
  state,
  openEditor,
  addEvent,
  verifyAttempt,
  syncEmail,
}: SubmissionTrackerProps) {
  const attempts = state["submission-attempts"].filter(
    (item) => item.manuscriptId === manuscript.id,
  );
  const [selectedId, setSelectedId] = useState(attempts[0]?.id || "");
  const [addingEvent, setAddingEvent] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingCandidates, setPendingCandidates] = useState<SubmissionEmailCandidate[]>([]);
  const autoCheckedRef = useRef(false);
  const [eventForm, setEventForm] = useState({
    status: "",
    eventDate: localDateKey(new Date()),
    rawStatus: "",
    description: "",
  });
  const attempt = attempts.find((item) => item.id === selectedId) || attempts[0];
  const events = state["submission-events"]
    .filter((item) => item.attemptId === attempt?.id)
    .sort((a, b) =>
      String(b.eventDate || b.createdAt || "").localeCompare(
        String(a.eventDate || a.createdAt || ""),
      ),
    );
  const createAttempt = () =>
    openEditor("submission-attempts", {
      title: `${manuscript.title} · ${manuscript.journal || "New submission"}`,
      manuscriptId: manuscript.id,
      manuscriptTitle: manuscript.title,
      journal: manuscript.journal,
      status: "Preparing",
      round: "Initial",
    });
  const submitEvent = async () => {
    if (!attempt) return;
    if (!eventForm.status) {
      setMessage("Choose the new stage first.");
      return;
    }
    setMessage("");
    try {
      await addEvent({
        ...eventForm,
        title: `${eventForm.status} · ${eventForm.eventDate}`,
        attemptId: attempt.id,
        manuscriptId: manuscript.id,
        source: "Manual",
        confidence: "confirmed",
      });
      setAddingEvent(false);
      setEventForm({
        status: "",
        eventDate: localDateKey(new Date()),
        rawStatus: "",
        description: "",
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add the status event.");
    }
  };
  const markChecked = async () => {
    if (!attempt) return;
    setMessage("");
    try {
      await verifyAttempt(attempt.id);
      setMessage("Status checked today · no timeline event added");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not mark the submission checked.");
    }
  };
  const checkEmail = useCallback(async () => {
    setSyncing(true);
    setMessage("");
    window.localStorage.setItem(MAIL_CHECK_KEY, String(Date.now()));
    try {
      const result = await syncEmail();
      setPendingCandidates(result.pending);
      setMessage(
        `${result.updated.length} status update${result.updated.length === 1 ? "" : "s"} added · ${result.verified || 0} existing status${result.verified === 1 ? "" : "es"} verified · ${result.pending.length} need confirmation · ${result.scanned} emails checked`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Mail could not be checked.");
    } finally {
      setSyncing(false);
    }
  }, [syncEmail]);
  // The ref keeps this to one scan per mount: checkEmail changes identity whenever
  // the parent re-renders, which a background state poll does every minute.
  useEffect(() => {
    if (autoCheckedRef.current || !attempts.length || mailCheckedRecently()) return;
    autoCheckedRef.current = true;
    void checkEmail();
  }, [attempts.length, checkEmail]);
  return (
    <section className="submission-tracker">
      <div className="tracker-toolbar">
        <span className="label">SUBMISSION TRACKER</span>
        <span>
          <button
            className="quiet-button"
            disabled={syncing || !attempts.length}
            onClick={checkEmail}
          >
            {syncing ? "Checking Mail…" : "Check email updates"}
          </button>
          <button className="primary-button" onClick={createAttempt}>
            New submission
          </button>
        </span>
      </div>
      {message && <div className="tracker-message">{message}</div>}
      {pendingCandidates.length > 0 && (
        <section className="pending-email-updates">
          <span className="label">NEEDS CONFIRMATION</span>
          {pendingCandidates.map((candidate) => (
            <article key={`${candidate.email.id}-${candidate.status}`}>
              <div>
                <strong>{candidate.status}</strong>
                <p>{candidate.email.subject}</p>
                <small>
                  {candidate.email.sender} · {shortDate(candidate.email.receivedAt)}
                </small>
              </div>
              <span>
                <button
                  className="quiet-button"
                  onClick={() =>
                    setPendingCandidates((items) => items.filter((item) => item !== candidate))
                  }
                >
                  Dismiss for now
                </button>
                <button
                  className="primary-button"
                  onClick={async () => {
                    await addEvent({
                      attemptId: candidate.attemptId,
                      manuscriptId: candidate.manuscriptId,
                      status: candidate.status,
                      rawStatus: candidate.rawStatus,
                      eventDate: candidate.email.receivedAt,
                      source: "Email",
                      confidence: "user-confirmed",
                      emailMessageId: candidate.email.id,
                      title: `${candidate.status} · ${candidate.email.receivedAt.slice(0, 10)}`,
                    });
                    setPendingCandidates((items) => items.filter((item) => item !== candidate));
                  }}
                >
                  Confirm update
                </button>
              </span>
            </article>
          ))}
        </section>
      )}
      {!attempts.length ? (
        <EmptyState title="No submission attempts yet" />
      ) : (
        <>
          <div className="attempt-tabs">
            {attempts.map((item) => (
              <button
                className={item.id === attempt?.id ? "active" : ""}
                key={item.id}
                onClick={() => setSelectedId(item.id)}
              >
                <span>{item.submissionId || item.id}</span>
                <strong>{item.journal || "Journal not set"}</strong>
                <small>
                  {item.status || "Preparing"} · {item.round || "Initial"}
                </small>
              </button>
            ))}
          </div>
          {attempt && (
            <>
              <article className="submission-status-card">
                <div className="submission-stage">
                  <span>CURRENT STAGE</span>
                  <h3>{attempt.status || "Preparing"}</h3>
                  <p>
                    {daysSince(attempt.stageStartedAt || attempt.submittedAt)} days in this stage ·
                    verified {shortDate(attempt.lastVerifiedAt)}
                  </p>
                </div>
                <div className="submission-facts">
                  <span>
                    <small>Submission ID</small>
                    <strong>{attempt.submissionId || "Not assigned"}</strong>
                  </span>
                  <span>
                    <small>Journal</small>
                    <strong>{attempt.journal || "Not set"}</strong>
                  </span>
                  <span>
                    <small>Corresponding author</small>
                    <strong>{attempt.correspondingAuthor || "Not set"}</strong>
                  </span>
                  <span>
                    <small>Expected response</small>
                    <strong>{shortDate(attempt.expectedResponseDate)}</strong>
                  </span>
                  <span>
                    <small>Next check</small>
                    <strong>{shortDate(attempt.nextCheckDate)}</strong>
                  </span>
                  <span>
                    <small>Follow-up</small>
                    <strong>{shortDate(attempt.followUpDue)}</strong>
                  </span>
                </div>
                <div className="submission-actions">
                  <button
                    className="quiet-button"
                    onClick={() => openEditor("submission-attempts", attempt)}
                  >
                    Edit details
                  </button>
                  <button
                    className="quiet-button"
                    disabled={!attempt.portalUrl}
                    onClick={() => {
                      if (attempt.portalUrl && /^https?:\/\//i.test(attempt.portalUrl))
                        window.open(attempt.portalUrl, "_blank", "noopener,noreferrer");
                    }}
                  >
                    Open portal ↗
                  </button>
                  <button className="quiet-button" onClick={markChecked}>
                    Mark checked today
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => setAddingEvent((value) => !value)}
                  >
                    Add status
                  </button>
                </div>
              </article>
              {addingEvent && (
                <div className="status-event-form">
                  <label>
                    <span>New stage</span>
                    <select
                      value={eventForm.status}
                      onChange={(event) =>
                        setEventForm({ ...eventForm, status: event.target.value })
                      }
                    >
                      <option value="">Choose a stage…</option>
                      {submissionStages.map((stage) => (
                        <option key={stage}>{stage}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Date</span>
                    <input
                      type="date"
                      value={eventForm.eventDate}
                      onChange={(event) =>
                        setEventForm({ ...eventForm, eventDate: event.target.value })
                      }
                    />
                  </label>
                  <details className="status-event-details">
                    <summary>More details</summary>
                    <label>
                      <span>Publisher wording</span>
                      <input
                        value={eventForm.rawStatus}
                        onChange={(event) =>
                          setEventForm({ ...eventForm, rawStatus: event.target.value })
                        }
                        placeholder="Required Reviews Complete"
                      />
                    </label>
                    <label>
                      <span>Note</span>
                      <input
                        value={eventForm.description}
                        onChange={(event) =>
                          setEventForm({ ...eventForm, description: event.target.value })
                        }
                      />
                    </label>
                  </details>
                  <div>
                    <button className="quiet-button" onClick={() => setAddingEvent(false)}>
                      Cancel
                    </button>
                    <button className="primary-button" onClick={submitEvent}>
                      Add to timeline
                    </button>
                  </div>
                </div>
              )}
              <section className="submission-timeline">
                <div className="section-heading">
                  <div>
                    <span className="label">STATUS HISTORY</span>
                    <p>
                      {events.length} verified event{events.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                {!events.length ? (
                  <EmptyState title="No status history yet" />
                ) : (
                  events.map((event) => (
                    <article key={event.id}>
                      <i />
                      <time>{shortDate(event.eventDate || event.createdAt)}</time>
                      <div>
                        <strong>{event.status}</strong>
                        {event.rawStatus && <p>{event.rawStatus}</p>}
                        {event.description && <p>{event.description}</p>}
                        {!event.rawStatus && !event.description && <p>Confirmed status update</p>}
                        <small>
                          {event.source || "Manual"} · {event.confidence || "confirmed"}
                        </small>
                      </div>
                    </article>
                  ))
                )}
              </section>
            </>
          )}
        </>
      )}
    </section>
  );
}

export function PaperFeedbackList({
  paper,
  state,
  openEditor,
  context,
}: {
  paper: RecordItem;
  state: WorkbenchState;
  openEditor: (collection: CollectionKey, record?: Partial<RecordItem>) => void;
  context: "develop" | "review";
}) {
  const severityRank: Record<string, number> = { Critical: 0, Major: 1, Minor: 2 };
  const records = [
    ...state.reviews.map((item) => ({ item, collection: "reviews" as const })),
    ...state["research-debt"].map((item) => ({
      item,
      collection: "research-debt" as const,
    })),
  ].filter(({ item }) => item.manuscriptId === paper.id);
  const openRecords = records
    .filter(({ item }) => isOpen(item))
    .sort(
      (a, b) =>
        (severityRank[a.item.severity || ""] ?? 3) - (severityRank[b.item.severity || ""] ?? 3) ||
        String(a.item.dueDate || "9999").localeCompare(String(b.item.dueDate || "9999")),
    );
  const history = records.filter(({ item }) => !isOpen(item));
  const defaults = {
    manuscriptId: paper.id,
    manuscriptTitle: paper.title,
    projectId: paper.projectId || "",
    projectTitle: paper.projectTitle || "",
    status: "Open",
  };
  const renderRecords = (items: typeof records) => (
    <div className="real-record-list paper-issue-list">
      {items.map(({ item, collection }) => {
        const detail = item.status === "Resolved" ? item.resolution : item.actionPlan;
        return (
          <button key={`${collection}-${item.id}`} onClick={() => openEditor(collection, item)}>
            <span className={`severity-mark ${(item.severity || "unspecified").toLowerCase()}`}>
              !
            </span>
            <span>
              <strong>{item.description || item.title}</strong>
              <small>
                {[item.reviewRound, item.reviewSource, item.manuscriptSection, item.type]
                  .filter(Boolean)
                  .join(" · ") || "No optional details"}
              </small>
              {detail && (
                <small className="issue-response">
                  {item.status === "Resolved" ? "Result" : "Plan"}: {detail}
                </small>
              )}
            </span>
            <b>{item.status || "Open"}</b>
          </button>
        );
      })}
    </div>
  );
  return (
    <section className="paper-work-list card">
      <div className="section-heading">
        <div>
          <span className="label">
            {context === "review" ? "FEEDBACK & RESPONSES" : "FEEDBACK & SOLUTIONS"}
          </span>
        </div>
        <button className="quiet-button" onClick={() => openEditor("reviews", defaults)}>
          Add feedback
        </button>
      </div>
      {!openRecords.length ? <EmptyState title="No open feedback" /> : renderRecords(openRecords)}
      {history.length > 0 && (
        <details className="paper-work-history">
          <summary>
            History · {history.length} closed item{history.length === 1 ? "" : "s"}
          </summary>
          {renderRecords(history)}
        </details>
      )}
    </section>
  );
}

export function ManuscriptModule({
  state,
  openEditor,
  addEvent,
  verifyAttempt,
  syncEmail,
  selectedId,
  onSelect,
  initialView,
}: Pick<DataProps, "state" | "openEditor"> & {
  addEvent: (record: Partial<RecordItem>) => Promise<void>;
  verifyAttempt: (attemptId: string) => Promise<void>;
  syncEmail: () => Promise<SubmissionSyncResult>;
  selectedId: string;
  onSelect: (id: string) => void;
  initialView?: "develop" | "review" | "submission" | "summary";
}) {
  const records = state.manuscripts;
  const [view, setView] = useState<"develop" | "review" | "submission" | "summary">(
    initialView || "develop",
  );
  const selected = records.find((item) => item.id === selectedId) || records[0];
  if (!records.length)
    return (
      <>
        <section className="page-intro compact">
          <div>
            <p className="eyebrow">PAPER WORKSPACE</p>
            <h1>
              Start a <em>paper.</em>
            </h1>
            <p>
              Create a paper before the first draft, then keep evidence, feedback, revision, and
              submission work together.
            </p>
          </div>
          <button
            className="primary-button"
            onClick={() => openEditor("manuscripts", { stage: "Concept" })}
          >
            New paper <b>+</b>
          </button>
        </section>
        <EmptyState title="No papers yet" />
      </>
    );
  if (!selected) return null;
  const openIssues = [...state.reviews, ...state["research-debt"]].filter(
    (item) => item.manuscriptId === selected.id && isOpen(item),
  ).length;
  return (
    <>
      <section className="page-intro compact manuscript-page-title">
        <div>
          <p className="eyebrow">PAPER WORKSPACE</p>
          <h1>
            One paper, <em>one context.</em>
          </h1>
          <p>
            Develop the draft, resolve feedback, and track every submission round without leaving
            this paper.
          </p>
        </div>
        <button
          className="primary-button"
          onClick={() =>
            openEditor("manuscripts", {
              projectId: selected.projectId || "",
              projectTitle: selected.projectTitle || "",
              stage: "Concept",
            })
          }
        >
          New paper <b>+</b>
        </button>
      </section>
      <div className="manuscript-selector">
        {records.map((item) => (
          <button
            className={item.id === selected.id ? "active" : ""}
            key={item.id}
            onClick={() => onSelect(item.id)}
          >
            <span>{item.id}</span>
            <strong>{item.title}</strong>
            <small>
              {item.stage || item.status || "Concept"} · {item.journal || "Journal not set"}
            </small>
          </button>
        ))}
      </div>
      <article className="paper-context card">
        <div>
          <span className="label">CURRENT PAPER</span>
          <h2>{selected.title}</h2>
          <p>
            {selected.projectTitle || "No linked project"} ·{" "}
            {selected.journal || "No target journal"}
          </p>
        </div>
        <div className="paper-context-meta">
          <span>
            <small>Stage</small>
            <strong>{selected.stage || selected.status || "Concept"}</strong>
          </span>
          <span>
            <small>Next action</small>
            <strong>{selected.nextAction || "Set the next concrete action"}</strong>
          </span>
          <span>
            <small>Open work</small>
            <strong>{openIssues} open issues</strong>
          </span>
        </div>
        <button className="quiet-button" onClick={() => openEditor("manuscripts", selected)}>
          Edit paper
        </button>
      </article>
      <div className="module-tabs workflow-tabs">
        <button className={view === "develop" ? "active" : ""} onClick={() => setView("develop")}>
          Develop
        </button>
        <button className={view === "review" ? "active" : ""} onClick={() => setView("review")}>
          Review & revise
        </button>
        <button
          className={view === "submission" ? "active" : ""}
          onClick={() => setView("submission")}
        >
          Submission
        </button>
        <button className={view === "summary" ? "active" : ""} onClick={() => setView("summary")}>
          Summary
        </button>
      </div>
      {view === "develop" && (
        <>
          <article className="manuscript-overview card manuscript-focus">
            <div className="manuscript-main">
              <div>
                <h2>Draft & evidence</h2>
                <p>
                  {(selected.wordCount || 0).toLocaleString()} /{" "}
                  {(selected.targetWords || 0).toLocaleString()} words · Writing progress{" "}
                  {clampProgress(selected.progress)}% · Evidence coverage{" "}
                  {clampProgress(selected.evidenceCoverage)}%
                </p>
              </div>
              <ProgressRing value={selected.progress || 0} />
            </div>
          </article>
          <LinkedPassages paper={selected} state={state} />
          <PaperFeedbackList
            paper={selected}
            state={state}
            openEditor={openEditor}
            context="develop"
          />
        </>
      )}
      {view === "review" && (
        <>
          <PaperFeedbackList
            paper={selected}
            state={state}
            openEditor={openEditor}
            context="review"
          />
        </>
      )}
      {view === "submission" && (
        <SubmissionTracker
          manuscript={selected}
          state={state}
          openEditor={openEditor}
          addEvent={addEvent}
          verifyAttempt={verifyAttempt}
          syncEmail={syncEmail}
        />
      )}
      {view === "summary" && (
        <ManuscriptSummary
          state={state}
          onSelectPaper={(id) => {
            onSelect(id);
            setView("develop");
          }}
        />
      )}
    </>
  );
}
