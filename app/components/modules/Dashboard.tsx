"use client";

import { clampProgress } from "../../lib/format";
import { isOpen, quickActions } from "../../lib/workbench";
import type { DataProps, SubmissionAlert } from "../../lib/workbench";
import type { RecordItem } from "../../types";
import { LiveTimestamp } from "../LiveTimestamp";
import { EmptyState } from "../primitives";
import { PanelBoundary } from "../PanelBoundary";
import { CalendarPanel } from "../panels/CalendarPanel";
import { FocusPanel } from "../panels/FocusPanel";
import { IdeaInboxPanel } from "../panels/IdeaInboxPanel";
import { JournalPanel } from "../panels/JournalPanel";
import { LiteraturePanel } from "../panels/LiteraturePanel";
import { TaskPanel } from "../panels/TaskPanel";

export function SubmissionWatch({
  alerts,
  onOpen,
}: {
  alerts: SubmissionAlert[];
  onOpen: (alert: SubmissionAlert) => void;
}) {
  if (!alerts.length) return null;
  return (
    <section className="submission-watch card">
      <div>
        <span className="label">SUBMISSION WATCH</span>
        <strong>
          {alerts.length} item{alerts.length === 1 ? "" : "s"} need attention
        </strong>
      </div>
      <div className="submission-watch-list">
        {alerts.map((alert) => (
          <button
            key={`${alert.attempt.id}-${alert.title}`}
            className={alert.tone}
            onClick={() => onOpen(alert)}
          >
            <span>!</span>
            <span>
              <strong>{alert.title}</strong>
              <small>
                {alert.attempt.manuscriptTitle || alert.attempt.title} · {alert.detail}
              </small>
            </span>
            <b>Review →</b>
          </button>
        ))}
      </div>
    </section>
  );
}

export function Dashboard({
  state,
  openEditor,
  saveRecord,
  runAction,
  openContext,
  openManuscripts,
  submissionAlerts,
  openSubmissionAlert,
  paper,
}: DataProps & {
  openContext: () => void;
  openManuscripts: () => void;
  submissionAlerts: SubmissionAlert[];
  openSubmissionAlert: (alert: SubmissionAlert) => void;
  paper?: RecordItem;
}) {
  const project = state.projects.find((item) => item.active) || state.projects[0];
  const manuscript = paper || state.manuscripts[0];
  const issues = [
    ...state.reviews.map((item) => ({ item, collection: "reviews" as const })),
    ...state["research-debt"].map((item) => ({
      item,
      collection: "research-debt" as const,
    })),
  ].filter(({ item }) => isOpen(item));
  return (
    <>
      <section className="daily-intro">
        <div>
          <LiveTimestamp />
          <h1>Move one thing forward.</h1>
          <p>
            Choose the next concrete output, work without switching tools, and leave a clear handoff
            for tomorrow.
          </p>
        </div>
        <div className="daily-intro-actions">
          <button className="quiet-button" onClick={openContext}>
            ◇ View real context
          </button>
          <button className="primary-button" onClick={() => runAction(quickActions[4])}>
            Plan today with AI <b>✦</b>
          </button>
        </div>
      </section>
      <SubmissionWatch alerts={submissionAlerts} onOpen={openSubmissionAlert} />
      <section className="daily-command-grid">
        <PanelBoundary label="Primary focus">
          <TaskPanel />
        </PanelBoundary>
        <PanelBoundary label="Today’s schedule">
          <CalendarPanel />
        </PanelBoundary>
        <PanelBoundary label="Focus session">
          <FocusPanel />
        </PanelBoundary>
      </section>
      {/* Capture sits directly under the working panels: a log entry or an idea
          is worth nothing if it has to be looked for. */}
      <section className="daily-capture-grid">
        <PanelBoundary label="Research log">
          <JournalPanel
            state={state}
            saveRecord={saveRecord}
            openEditor={openEditor}
            project={project}
            paper={manuscript}
          />
        </PanelBoundary>
        <PanelBoundary label="Idea inbox">
          <IdeaInboxPanel
            state={state}
            saveRecord={saveRecord}
            openEditor={openEditor}
            project={project}
          />
        </PanelBoundary>
      </section>
      <section className="real-summary-grid">
        <article className="card real-summary">
          <div className="section-heading">
            <div>
              <span className="label">ACTIVE PROJECT / OBSIDIAN</span>
            </div>
            {project && (
              <button className="quiet-button" onClick={() => openEditor("projects", project)}>
                Edit
              </button>
            )}
          </div>
          {project ? (
            <>
              <h2>{project.title}</h2>
              <p>{project.description || "No project description yet."}</p>
              <div className="manual-progress">
                <span>Manual progress</span>
                <b>{clampProgress(project.progress)}%</b>
                <i>
                  <em style={{ width: `${clampProgress(project.progress)}%` }} />
                </i>
              </div>
            </>
          ) : (
            <EmptyState
              title="No active project"
              action="Create project"
              onAction={() => openEditor("projects")}
            />
          )}
        </article>
        <article className="card real-summary">
          <div className="section-heading">
            <div>
              <span className="label">CURRENT PAPER / OBSIDIAN</span>
            </div>
            {manuscript && (
              <button className="quiet-button" onClick={openManuscripts}>
                Open paper
              </button>
            )}
          </div>
          {manuscript ? (
            <>
              <h2>{manuscript.title}</h2>
              <p>
                {manuscript.nextAction ||
                  `${manuscript.journal || "No target journal set"} · ${(manuscript.wordCount || 0).toLocaleString()} / ${(manuscript.targetWords || 0).toLocaleString()} words`}
              </p>
              <div className="manual-progress">
                <span>Writing progress</span>
                <b>{clampProgress(manuscript.progress)}%</b>
                <i>
                  <em style={{ width: `${clampProgress(manuscript.progress)}%` }} />
                </i>
              </div>
            </>
          ) : (
            <EmptyState
              title="No paper context"
              action="Create paper"
              onAction={() => openEditor("manuscripts", { stage: "Concept" })}
            />
          )}
        </article>
      </section>
      <section className="daily-lower-grid">
        <PanelBoundary label="Zotero library">
          <LiteraturePanel state={state} saveRecord={saveRecord} compact />
        </PanelBoundary>
        <article className="research-debt card real-panel">
          <div className="section-heading">
            <div>
              <span className="label">PAPER FEEDBACK / OBSIDIAN</span>
            </div>
            <button
              className="mini-add"
              onClick={() =>
                openEditor("reviews", {
                  manuscriptId: manuscript?.id || "",
                  manuscriptTitle: manuscript?.title || "",
                  projectId: manuscript?.projectId || "",
                  projectTitle: manuscript?.projectTitle || "",
                  status: "Open",
                })
              }
            >
              ＋ Feedback
            </button>
          </div>
          {!issues.length ? (
            <EmptyState
              title="No open feedback"
              detail="Feedback appears here beside its planned solution."
            />
          ) : (
            <div className="real-record-list paper-issue-list">
              {issues.slice(0, 6).map(({ item, collection }) => (
                <button
                  key={`${collection}-${item.id}`}
                  onClick={() => openEditor(collection, item)}
                >
                  <span
                    className={`severity-mark ${(item.severity || "unspecified").toLowerCase()}`}
                  >
                    !
                  </span>
                  <span>
                    <strong>{item.description || item.title}</strong>
                    <small>{item.manuscriptTitle || "No linked paper"}</small>
                    {item.actionPlan && (
                      <small className="issue-response">Plan: {item.actionPlan}</small>
                    )}
                  </span>
                  <b>{item.status || "Open"}</b>
                </button>
              ))}
            </div>
          )}
        </article>
      </section>
    </>
  );
}
