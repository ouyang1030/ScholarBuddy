"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { failureText, useLocale, useT, valueLabel } from "../../i18n";
import { clampProgress, daysSince, formatNumber, localDateKey, shortDate } from "../../lib/format";
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
const MAIL_CHECK_KEY = "scholarbuddy-submission-last-mail-check";
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
  const t = useT();
  const { locale } = useLocale();
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
      setMessage(t.submission.chooseFirst);
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
      setMessage(failureText(t, error, t.errors.saveFailed));
    }
  };
  const markChecked = async () => {
    if (!attempt) return;
    setMessage("");
    try {
      await verifyAttempt(attempt.id);
      setMessage(t.submission.checkedToday);
    } catch (error) {
      setMessage(failureText(t, error, t.errors.saveFailed));
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
        `${t.submission.mailResult({
          updated: result.updated.length,
          verified: result.verified || 0,
          pending: result.pending.length,
          scanned: result.scanned,
        })}${result.partial ? ` · ${result.partial}` : ""}`,
      );
    } catch (error) {
      setMessage(failureText(t, error, t.manuscript.mailFailed));
    } finally {
      setSyncing(false);
    }
  }, [syncEmail, t]);
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
        <span className="label">{t.submission.label}</span>
        <span>
          <button
            className="quiet-button"
            disabled={syncing || !attempts.length}
            onClick={checkEmail}
          >
            {syncing ? t.submission.checking : t.submission.check}
          </button>
          <button className="primary-button" onClick={createAttempt}>
            {t.submission.new}
          </button>
        </span>
      </div>
      {message && <div className="tracker-message">{message}</div>}
      {pendingCandidates.length > 0 && (
        <section className="pending-email-updates">
          <span className="label">{t.submission.confirmLabel}</span>
          {pendingCandidates.map((candidate) => (
            <article key={`${candidate.email.id}-${candidate.status}`}>
              <div>
                <strong>{valueLabel(t.values.status, candidate.status)}</strong>
                <p>{candidate.email.subject}</p>
                <small>
                  {candidate.email.sender} · {shortDate(candidate.email.receivedAt, locale)}
                </small>
              </div>
              <span>
                <button
                  className="quiet-button"
                  onClick={() =>
                    setPendingCandidates((items) => items.filter((item) => item !== candidate))
                  }
                >
                  {t.submission.dismiss}
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
                  {t.submission.confirm}
                </button>
              </span>
            </article>
          ))}
        </section>
      )}
      {!attempts.length ? (
        <EmptyState title={t.submission.none} />
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
                <strong>{item.journal || t.submission.noJournal}</strong>
                <small>
                  {valueLabel(t.values.status, item.status || "Preparing")} ·{" "}
                  {valueLabel(t.values.round, item.round || "Initial")}
                </small>
              </button>
            ))}
          </div>
          {attempt && (
            <>
              <article className="submission-status-card">
                <div className="submission-stage">
                  <span>{t.submission.currentStage}</span>
                  <h3>{valueLabel(t.values.status, attempt.status || "Preparing")}</h3>
                  <p>
                    {t.submission.inStage(
                      daysSince(attempt.stageStartedAt || attempt.submittedAt),
                      shortDate(attempt.lastVerifiedAt, locale),
                    )}
                  </p>
                </div>
                <div className="submission-facts">
                  <span>
                    <small>{t.submission.id}</small>
                    <strong>{attempt.submissionId || t.submission.notAssigned}</strong>
                  </span>
                  <span>
                    <small>{t.submission.journal}</small>
                    <strong>{attempt.journal || t.common.notSet}</strong>
                  </span>
                  <span>
                    <small>{t.submission.author}</small>
                    <strong>{attempt.correspondingAuthor || t.common.notSet}</strong>
                  </span>
                  <span>
                    <small>{t.submission.followUp}</small>
                    <strong>{shortDate(attempt.followUpDue, locale)}</strong>
                  </span>
                </div>
                <div className="submission-actions">
                  <button
                    className="quiet-button"
                    onClick={() => openEditor("submission-attempts", attempt)}
                  >
                    {t.submission.editDetails}
                  </button>
                  <button
                    className="quiet-button"
                    disabled={!attempt.portalUrl}
                    onClick={() => {
                      if (attempt.portalUrl) {
                        const targetUrl = /^https?:\/\//i.test(attempt.portalUrl)
                          ? attempt.portalUrl
                          : `https://${attempt.portalUrl}`;
                        window.open(targetUrl, "_blank", "noopener,noreferrer");
                        void markChecked();
                      }
                    }}
                  >
                    {t.submission.portal}
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => setAddingEvent((value) => !value)}
                  >
                    {t.submission.addStatus}
                  </button>
                </div>
              </article>
              {addingEvent && (
                <div className="status-event-form">
                  <label>
                    <span>{t.submission.newStage}</span>
                    <select
                      value={eventForm.status}
                      onChange={(event) =>
                        setEventForm({ ...eventForm, status: event.target.value })
                      }
                    >
                      <option value="">{t.submission.chooseStage}</option>
                      {submissionStages.map((stage) => (
                        <option key={stage} value={stage}>
                          {valueLabel(t.values.status, stage)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{t.submission.date}</span>
                    <input
                      type="date"
                      value={eventForm.eventDate}
                      onChange={(event) =>
                        setEventForm({ ...eventForm, eventDate: event.target.value })
                      }
                    />
                  </label>
                  <details className="status-event-details">
                    <summary>{t.submission.more}</summary>
                    <label>
                      <span>{t.submission.wording}</span>
                      <input
                        value={eventForm.rawStatus}
                        onChange={(event) =>
                          setEventForm({ ...eventForm, rawStatus: event.target.value })
                        }
                        placeholder="Required Reviews Complete"
                      />
                    </label>
                    <label>
                      <span>{t.submission.note}</span>
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
                      {t.common.cancel}
                    </button>
                    <button className="primary-button" onClick={submitEvent}>
                      {t.submission.addToTimeline}
                    </button>
                  </div>
                </div>
              )}
              <section className="submission-timeline">
                <div className="section-heading">
                  <div>
                    <span className="label">{t.submission.history}</span>
                  </div>
                </div>
                {!events.length ? (
                  <EmptyState title={t.submission.noHistory} />
                ) : (
                  events.map((event) => (
                    <article key={event.id}>
                      <i />
                      <time>{shortDate(event.eventDate || event.createdAt, locale)}</time>
                      <div>
                        <strong>{valueLabel(t.values.status, event.status)}</strong>
                        {event.rawStatus && <p>{event.rawStatus}</p>}
                        {event.description && <p>{event.description}</p>}
                        {!event.rawStatus && !event.description && <p>{t.submission.confirmed}</p>}
                        <small>{valueLabel(t.values.source, event.source || "Manual")}</small>
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
  const t = useT();
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
                {[
                  valueLabel(t.values.round, item.reviewRound),
                  item.reviewSource,
                  valueLabel(t.values.section, item.manuscriptSection),
                  valueLabel(t.values.category, item.type),
                ]
                  .filter(Boolean)
                  .join(" · ") || t.feedback.noDetails}
              </small>
              {detail && (
                <small className="issue-response">
                  {item.status === "Resolved" ? t.feedback.result(detail) : t.feedback.plan(detail)}
                </small>
              )}
            </span>
            <b>{valueLabel(t.values.status, item.status || "Open")}</b>
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
            {context === "review" ? t.feedback.review : t.feedback.develop}
          </span>
        </div>
        <button className="quiet-button" onClick={() => openEditor("reviews", defaults)}>
          {t.feedback.add}
        </button>
      </div>
      {!openRecords.length ? <EmptyState title={t.feedback.none} /> : renderRecords(openRecords)}
      {history.length > 0 && (
        <details className="paper-work-history">
          <summary>{t.feedback.history(history.length)}</summary>
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
  const t = useT();
  const { locale } = useLocale();
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
            <p className="eyebrow">{t.paper.eyebrow}</p>
            <h1>
              {t.paper.startLead}
              <em>{t.paper.startEm}</em>
            </h1>
          </div>
          <button
            className="primary-button"
            onClick={() => openEditor("manuscripts", { stage: "Concept" })}
          >
            {t.paper.new} <b>+</b>
          </button>
        </section>
        <EmptyState title={t.paper.none} />
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
          <p className="eyebrow">{t.paper.eyebrow}</p>
          <h1>
            {t.paper.titleLead}
            <em>{t.paper.titleEm}</em>
          </h1>
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
          {t.paper.new} <b>+</b>
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
              {valueLabel(t.values.stage, item.stage || item.status || "Concept")} ·{" "}
              {item.journal || t.paper.noJournal}
            </small>
          </button>
        ))}
      </div>
      <article className="paper-context card">
        <div>
          <span className="label">{t.paper.current}</span>
          <h2>{selected.title}</h2>
          <p>
            {selected.projectTitle || t.paper.noProject} · {selected.journal || t.paper.noTarget}
          </p>
        </div>
        <div className="paper-context-meta">
          <span>
            <small>{t.paper.stage}</small>
            <strong>
              {valueLabel(t.values.stage, selected.stage || selected.status || "Concept")}
            </strong>
          </span>
          <span>
            <small>{t.paper.nextAction}</small>
            <strong>{selected.nextAction || t.paper.noNextAction}</strong>
          </span>
          <span>
            <small>{t.paper.openWork}</small>
            <strong>{t.paper.openIssues(openIssues)}</strong>
          </span>
        </div>
        <button className="quiet-button" onClick={() => openEditor("manuscripts", selected)}>
          {t.paper.edit}
        </button>
      </article>
      <div className="module-tabs workflow-tabs">
        <button className={view === "develop" ? "active" : ""} onClick={() => setView("develop")}>
          {t.paper.develop}
        </button>
        <button className={view === "review" ? "active" : ""} onClick={() => setView("review")}>
          {t.paper.review}
        </button>
        <button
          className={view === "submission" ? "active" : ""}
          onClick={() => setView("submission")}
        >
          {t.paper.submission}
        </button>
        <button className={view === "summary" ? "active" : ""} onClick={() => setView("summary")}>
          {t.paper.summary}
        </button>
      </div>
      {view === "develop" && (
        <>
          <article className="manuscript-overview card manuscript-focus">
            <div className="manuscript-main">
              <div>
                <h2>{t.paper.draft}</h2>
                <p>
                  {t.paper.progressLine(
                    t.today.words(
                      formatNumber(selected.wordCount || 0, locale),
                      formatNumber(selected.targetWords || 0, locale),
                    ),
                    clampProgress(selected.progress),
                    clampProgress(selected.evidenceCoverage),
                  )}
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
