"use client";

import { useLocale, useT, valueLabel, type Messages } from "../../i18n";
import { clampProgress, formatNumber } from "../../lib/format";
import { isOpen, quickActions } from "../../lib/workbench";
import type { DataProps, SubmissionAlert } from "../../lib/workbench";
import type { RecordItem } from "../../types";
import { LiveTimestamp } from "../LiveTimestamp";
import { EmptyState, PageHeader } from "../primitives";
import { PanelBoundary } from "../PanelBoundary";
import { CalendarPanel } from "../panels/CalendarPanel";
import { FocusPanel } from "../panels/FocusPanel";
import { IdeaInboxPanel } from "../panels/IdeaInboxPanel";
import { JournalPanel } from "../panels/JournalPanel";
import { LiteraturePanel } from "../panels/LiteraturePanel";
import { TaskPanel } from "../panels/TaskPanel";

function alertText(t: Messages, alert: SubmissionAlert) {
  const { attempt, kind, days } = alert;
  if (kind === "revision-deadline")
    return {
      title: days < 0 ? t.watch.revisionPassed : t.watch.revisionDue(days),
      detail: `${attempt.journal || t.watch.journal} · ${valueLabel(t.values.round, attempt.round || "Initial")}`,
    };
  if (kind === "follow-up")
    return {
      title: t.watch.followUp,
      detail: `${valueLabel(t.values.status, attempt.status || "Submitted")} · ${t.watch.inStage(days)}`,
    };
  return { title: t.watch.stale, detail: t.watch.sinceCheck(days) };
}

export function SubmissionWatch({
  alerts,
  onOpen,
}: {
  alerts: SubmissionAlert[];
  onOpen: (alert: SubmissionAlert) => void;
}) {
  const t = useT();
  if (!alerts.length) return null;
  return (
    <section className="submission-watch card">
      <div>
        <span className="label">{t.watch.label}</span>
        <strong>{t.watch.count(alerts.length)}</strong>
      </div>
      <div className="submission-watch-list">
        {alerts.map((alert) => {
          const text = alertText(t, alert);
          return (
            <button
              key={`${alert.attempt.id}-${alert.kind}`}
              className={alert.tone}
              onClick={() => onOpen(alert)}
            >
              <span>!</span>
              <span>
                <strong>{text.title}</strong>
                <small>
                  {alert.attempt.manuscriptTitle || alert.attempt.title} · {text.detail}
                </small>
              </span>
              <b>{t.watch.review}</b>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function Dashboard({
  state,
  openEditor,
  saveRecord,
  runAction,
  openManuscripts,
  submissionAlerts,
  openSubmissionAlert,
  paper,
}: DataProps & {
  openManuscripts: () => void;
  submissionAlerts: SubmissionAlert[];
  openSubmissionAlert: (alert: SubmissionAlert) => void;
  paper?: RecordItem;
}) {
  const t = useT();
  const { locale } = useLocale();
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
      <PageHeader
        eyebrow={t.today.eyebrow}
        title={t.today.title}
        description={<LiveTimestamp />}
        compact
        actions={
          <div className="daily-intro-actions">
            <button className="primary-button" onClick={() => runAction(quickActions[4])}>
              {t.today.plan} <b>✦</b>
            </button>
          </div>
        }
      />
      <SubmissionWatch alerts={submissionAlerts} onOpen={openSubmissionAlert} />
      <section className="daily-command-grid">
        <PanelBoundary label={t.today.panels.tasks}>
          <TaskPanel />
        </PanelBoundary>
        <PanelBoundary label={t.today.panels.schedule}>
          <CalendarPanel />
        </PanelBoundary>
        <PanelBoundary label={t.today.panels.focus}>
          <FocusPanel />
        </PanelBoundary>
      </section>
      {/* Capture sits directly under the working panels: a log entry or an idea
          is worth nothing if it has to be looked for. */}
      <section className="daily-capture-grid">
        <PanelBoundary label={t.today.panels.log}>
          <JournalPanel
            state={state}
            saveRecord={saveRecord}
            openEditor={openEditor}
            project={project}
            paper={manuscript}
          />
        </PanelBoundary>
        <PanelBoundary label={t.today.panels.ideas}>
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
              <span className="label">{t.today.activeProject}</span>
            </div>
            {project && (
              <button className="quiet-button" onClick={() => openEditor("projects", project)}>
                {t.common.edit}
              </button>
            )}
          </div>
          {project ? (
            <>
              <h2>{project.title}</h2>
              {project.description && <p>{project.description}</p>}
              <div className="manual-progress">
                <span>{t.today.progress}</span>
                <b>{clampProgress(project.progress)}%</b>
                <i>
                  <em style={{ width: `${clampProgress(project.progress)}%` }} />
                </i>
              </div>
            </>
          ) : (
            <EmptyState
              title={t.today.noProject}
              action={t.today.createProject}
              onAction={() => openEditor("projects")}
            />
          )}
        </article>
        <article className="card real-summary">
          <div className="section-heading">
            <div>
              <span className="label">{t.today.currentPaper}</span>
            </div>
            {manuscript && (
              <button className="quiet-button" onClick={openManuscripts}>
                {t.today.openPaper}
              </button>
            )}
          </div>
          {manuscript ? (
            <>
              <h2>{manuscript.title}</h2>
              <p>
                {manuscript.nextAction ||
                  `${manuscript.journal || t.today.noJournal} · ${t.today.words(formatNumber(manuscript.wordCount || 0, locale), formatNumber(manuscript.targetWords || 0, locale))}`}
              </p>
              <div className="manual-progress">
                <span>{t.today.progress}</span>
                <b>{clampProgress(manuscript.progress)}%</b>
                <i>
                  <em style={{ width: `${clampProgress(manuscript.progress)}%` }} />
                </i>
              </div>
            </>
          ) : (
            <EmptyState
              title={t.today.noPaper}
              action={t.today.createPaper}
              onAction={() => openEditor("manuscripts", { stage: "Concept" })}
            />
          )}
        </article>
      </section>
      <section className="daily-lower-grid">
        <PanelBoundary label={t.today.panels.library}>
          <LiteraturePanel state={state} saveRecord={saveRecord} compact />
        </PanelBoundary>
        <article className="research-debt card real-panel">
          <div className="section-heading">
            <div>
              <span className="label">{t.today.feedback}</span>
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
              {t.today.addFeedback}
            </button>
          </div>
          {!issues.length ? (
            <EmptyState title={t.today.noFeedback} />
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
                    <small>{item.manuscriptTitle || t.today.noLinkedPaper}</small>
                    {item.actionPlan && (
                      <small className="issue-response">{t.today.plan_(item.actionPlan)}</small>
                    )}
                  </span>
                  <b>{valueLabel(t.values.status, item.status || "Open")}</b>
                </button>
              ))}
            </div>
          )}
        </article>
      </section>
    </>
  );
}
