"use client";

import { useEffect, useRef, useState } from "react";
import { failureText, useT, valueLabel } from "../../i18n";
import { clampProgress, localDateKey } from "../../lib/format";
import { CLOSED_RECORD_STATUSES } from "../../../shared/constants.mjs";
import {
  manuscriptSections,
  operationTypes,
  statusDefault,
  statusOptions,
} from "../../lib/workbench";
import type { CollectionKey, RecordItem, WorkbenchState } from "../../types";
import { closeWithTransition, DrawerHeader, SaveFeedback, useUnsavedWork } from "../primitives";

export type EditorState = { collection: CollectionKey; record?: Partial<RecordItem> } | null;
export function RecordEditor({
  editor,
  state,
  onClose,
  onSave,
  onDelete,
  onUnsavedChange,
  ref,
}: {
  editor: NonNullable<EditorState>;
  state: WorkbenchState;
  onClose: () => void;
  onSave: (collection: CollectionKey, record: Partial<RecordItem>) => Promise<RecordItem>;
  onDelete: (
    collection: CollectionKey,
    record: Pick<RecordItem, "id" | "version" | "contentHash">,
  ) => Promise<void>;
  onUnsavedChange?: (unsaved: boolean) => void;
  ref?: React.Ref<HTMLElement>;
}) {
  const t = useT();
  // Stored values stay English; each option shows the current language.
  const option = (labels: Record<string, string>, value: string) => (
    <option key={value} value={value}>
      {valueLabel(labels, value)}
    </option>
  );
  const isJournal = editor.collection === "journal";
  const isIdea = editor.collection === "ideas";
  const isReadingQueue = editor.collection === "reading-queue";
  const isFeedback = editor.collection === "reviews";
  const isResearchGap = editor.collection === "research-debt";
  const isPaperWorkItem = isFeedback || isResearchGap;
  const isSubmission =
    editor.collection === "submission-attempts" || editor.collection === "submission-events";
  const isSubmissionAttempt = editor.collection === "submission-attempts";
  const showProgress =
    !isReadingQueue && !isSubmission && !isJournal && !isIdea && !isPaperWorkItem;
  // A log entry has no status and no percentage, an idea only has the three
  // states its inbox uses, and a reading item is read rather than worked on.
  // None should carry the generic record defaults into the vault, where they
  // would show up as noise on every note.
  const [form, setForm] = useState<Partial<RecordItem>>({
    ...(isJournal ? {} : { status: statusDefault(editor.collection) }),
    ...(showProgress ? { progress: 0 } : {}),
    ...(isFeedback ? { issueKind: "Feedback" } : {}),
    ...editor.record,
    ...(isPaperWorkItem && editor.record?.title && !editor.record.description
      ? { description: editor.record.title }
      : {}),
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // The success tick is shown before the drawer closes; if the editor goes away
  // first (Cancel, Esc, backdrop), the pending close must not fire on whatever
  // record is open by then.
  const closeTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Only what the researcher typed counts: the defaults a new record opens with
  // are not work that closing the drawer could lose.
  const [edited, setEdited] = useState(false);
  const edit = (change: (current: Partial<RecordItem>) => Partial<RecordItem>) => {
    setEdited(true);
    setForm(change);
  };
  const canDismiss = useUnsavedWork("record", edited && !saved, onUnsavedChange);
  const set = (key: keyof RecordItem, value: string | number | boolean) =>
    edit((current) => ({ ...current, [key]: value }));
  const save = async () => {
    const feedback = String(form.description || "").trim();
    if (isPaperWorkItem && !feedback) {
      setError(t.editor.feedbackRequired);
      return;
    }
    if (!isPaperWorkItem && !String(form.title || "").trim()) {
      setError(t.editor.titleRequired);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const feedbackTitle = feedback
        .split(/\r?\n/)
        .find((line) => line.trim())
        ?.trim()
        .slice(0, 160);
      const record: Partial<RecordItem> = isPaperWorkItem
        ? {
            ...form,
            title: String(form.title || feedbackTitle).trim(),
            description: feedback,
            issueKind: "Feedback",
          }
        : { ...form, title: String(form.title).trim() };
      if (isPaperWorkItem && record.status === "Resolved" && !record.resolutionDecision)
        record.resolutionDecision = "Addressed";
      // A percentage the form never showed is a value the researcher never set.
      if (!showProgress) delete record.progress;
      else record.progress = clampProgress(form.progress);
      if (isJournal) delete record.status;
      await onSave(editor.collection, record);
      setSaved(true);
      closeTimerRef.current = window.setTimeout(onClose, 650);
    } catch (saveError) {
      setError(failureText(t, saveError, t.errors.saveFailed));
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!form.id || !form.version) return;
    if (!form.contentHash) {
      setError(t.editor.reloadFirst);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onDelete(editor.collection, {
        id: form.id,
        version: form.version,
        contentHash: form.contentHash,
      });
      onClose();
    } catch (deleteError) {
      setError(failureText(t, deleteError, t.errors.deleteFailed));
      setSaving(false);
    }
  };
  const existing = Boolean(form.id);
  const showStatus =
    !isJournal && (!isPaperWorkItem || existing) && !(isSubmissionAttempt && existing);
  const showDescription = !isSubmission && !isPaperWorkItem;
  const descriptionLabel =
    editor.collection === "manuscripts" ? t.editor.manuscriptText : t.editor.notes;
  const editorLabel = isPaperWorkItem ? t.editor.feedbackLabel : t.collections[editor.collection];
  const options = statusOptions(editor.collection);
  // A status the list does not offer still has to be shown and still has to be
  // changeable; left out, the select renders blank and the record looks empty.
  const offeredStatuses = isSubmissionAttempt && !existing ? options.slice(0, 2) : options;
  const statusChoices =
    form.status && !offeredStatuses.includes(form.status)
      ? [...offeredStatuses, form.status]
      : offeredStatuses;
  // The operation vocabulary was rewritten, so a record filed under an older
  // type has to keep offering it rather than reading as Unclassified while the
  // board card beside it still shows the old label.
  const typeChoices =
    form.type && !operationTypes.includes(form.type)
      ? [...operationTypes, form.type]
      : operationTypes;
  // The paper link is an id the card views filter on, so it is always picked from
  // the known papers — a typed id silently detaches the record from its paper.
  const supportsPaperLink = [
    "reviews",
    "research-debt",
    "operations",
    "reading-queue",
    "submission-attempts",
    "journal",
  ].includes(editor.collection);
  const paperLinkField = (
    <label>
      <span>{t.editor.linkedPaper}</span>
      <select
        value={form.manuscriptId || ""}
        onChange={(event) => {
          const manuscript = state.manuscripts.find((item) => item.id === event.target.value);
          set("manuscriptId", event.target.value);
          set("manuscriptTitle", manuscript?.title || "");
        }}
      >
        <option value="">{t.common.notLinked}</option>
        {state.manuscripts.map((manuscript) => (
          <option key={manuscript.id} value={manuscript.id}>
            {manuscript.title}
          </option>
        ))}
        {form.manuscriptId && !state.manuscripts.some((item) => item.id === form.manuscriptId) && (
          <option value={form.manuscriptId}>
            {form.manuscriptTitle || form.manuscriptId} · {t.editor.paperMissing}
          </option>
        )}
      </select>
    </label>
  );
  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(event) => {
        if (canDismiss()) closeWithTransition(onClose, event.currentTarget);
      }}
    >
      <aside
        ref={ref}
        className="action-drawer record-editor"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        aria-label={t.editor.edit(editorLabel)}
      >
        <DrawerHeader
          label={`Obsidian / ${editor.collection}`}
          mark="✎"
          eyebrow={form.id}
          title={existing ? t.editor.edit(editorLabel) : t.editor.new(editorLabel)}
          onClose={onClose}
        />
        <div className="record-form">
          <div className="record-form-heading">
            {isPaperWorkItem ? (
              <label className="record-title-field">
                <span>{t.editor.feedback}</span>
                <textarea
                  autoFocus
                  value={form.description || ""}
                  onChange={(event) => set("description", event.target.value)}
                  placeholder={t.editor.feedbackPlaceholder}
                />
              </label>
            ) : (
              <label className="record-title-field">
                <span>{t.editor.title}</span>
                <input
                  autoFocus
                  value={form.title || ""}
                  onChange={(event) => set("title", event.target.value)}
                />
              </label>
            )}
            {showStatus && (
              <label>
                <span>
                  {isSubmissionAttempt
                    ? t.editor.initialState
                    : isPaperWorkItem
                      ? t.editor.workflowStatus
                      : t.editor.status}
                </span>
                <select
                  value={form.status || statusDefault(editor.collection)}
                  onChange={(event) => {
                    const nextStatus = event.target.value;
                    if (isSubmissionAttempt && !existing) {
                      edit((current) => ({
                        ...current,
                        status: nextStatus,
                        submittedAt:
                          nextStatus === "Submitted"
                            ? current.submittedAt || localDateKey(new Date())
                            : "",
                      }));
                      return;
                    }
                    if (showProgress && CLOSED_RECORD_STATUSES.includes(nextStatus)) {
                      edit((current) => ({ ...current, status: nextStatus, progress: 100 }));
                    } else {
                      set("status", nextStatus);
                    }
                  }}
                >
                  {statusChoices.map((status) => option(t.values.status, status))}
                </select>
              </label>
            )}
            {showProgress && (
              <label>
                <span>{t.editor.progress(clampProgress(form.progress))}</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={clampProgress(form.progress)}
                  onChange={(event) => set("progress", Number(event.target.value))}
                />
              </label>
            )}
          </div>
          {showDescription && (
            <label className="wide">
              <span>{descriptionLabel}</span>
              <textarea
                value={form.description || ""}
                onChange={(event) => set("description", event.target.value)}
                placeholder={
                  editor.collection === "manuscripts"
                    ? "## Introduction\n\n…\n\n## Methods\n\n…"
                    : undefined
                }
              />
            </label>
          )}
          {isJournal && (
            <label>
              <span>{t.editor.entryDate}</span>
              <input
                type="date"
                value={(form.entryDate || "").slice(0, 10)}
                onChange={(event) => set("entryDate", event.target.value)}
              />
            </label>
          )}
          {isIdea && form.promotedTo && (
            <label>
              <span>{t.editor.promotedTo}</span>
              <input value={form.promotedTo} readOnly />
            </label>
          )}
          {editor.collection === "projects" && (
            <>
              <label>
                <span>{t.editor.phase}</span>
                <input
                  value={form.phase || ""}
                  onChange={(event) => set("phase", event.target.value)}
                />
              </label>
              <label>
                <span>{t.editor.keywords}</span>
                <input
                  value={form.keywords || ""}
                  onChange={(event) => set("keywords", event.target.value)}
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={Boolean(form.active)}
                  onChange={(event) => set("active", event.target.checked)}
                />
                <span>{t.editor.activeProject}</span>
              </label>
            </>
          )}
          {editor.collection === "research-questions" && (
            <>
              <label>
                <span>{t.editor.linkedProject}</span>
                <select
                  value={form.linkedProject || ""}
                  onChange={(event) => set("linkedProject", event.target.value)}
                >
                  <option value="">{t.common.notLinked}</option>
                  {state.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t.editor.keywords}</span>
                <input
                  value={form.keywords || ""}
                  onChange={(event) => set("keywords", event.target.value)}
                />
              </label>
            </>
          )}
          {editor.collection === "manuscripts" && (
            <>
              <label>
                <span>{t.editor.linkedProject}</span>
                <select
                  value={form.projectId || ""}
                  onChange={(event) => {
                    const project = state.projects.find((item) => item.id === event.target.value);
                    set("projectId", event.target.value);
                    set("projectTitle", project?.title || "");
                  }}
                >
                  <option value="">{t.common.notLinked}</option>
                  {state.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t.editor.stage}</span>
                <select
                  value={form.stage || "Concept"}
                  onChange={(event) => set("stage", event.target.value)}
                >
                  {[
                    "Concept",
                    "Developing",
                    "Internal review",
                    "Ready to submit",
                    "Submitted",
                    "Revision",
                    "Accepted",
                    "Published",
                  ].map((stage) => option(t.values.stage, stage))}
                  {form.stage === "Accepted / published" &&
                    option(t.values.stage, "Accepted / published")}
                </select>
              </label>
              <label className="wide">
                <span>{t.editor.nextAction}</span>
                <input
                  value={form.nextAction || ""}
                  onChange={(event) => set("nextAction", event.target.value)}
                />
              </label>
              <label>
                <span>{t.editor.targetJournal}</span>
                <input
                  value={form.journal || ""}
                  onChange={(event) => set("journal", event.target.value)}
                />
              </label>
              <label>
                <span>{t.editor.currentWords}</span>
                <input
                  inputMode="numeric"
                  value={form.wordCount || ""}
                  onChange={(event) =>
                    set("wordCount", Number(event.target.value.replace(/\D/g, "")))
                  }
                />
              </label>
              <label>
                <span>{t.editor.targetWords}</span>
                <input
                  inputMode="numeric"
                  value={form.targetWords || ""}
                  onChange={(event) =>
                    set("targetWords", Number(event.target.value.replace(/\D/g, "")))
                  }
                />
              </label>
              <label>
                <span>{t.editor.evidence(clampProgress(form.evidenceCoverage))}</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={clampProgress(form.evidenceCoverage)}
                  onChange={(event) => set("evidenceCoverage", Number(event.target.value))}
                />
              </label>
            </>
          )}
          {supportsPaperLink && !isPaperWorkItem && paperLinkField}
          {isPaperWorkItem && (
            <>
              <label className="wide">
                <span>{t.editor.solution}</span>
                <textarea
                  value={form.actionPlan || ""}
                  onChange={(event) => set("actionPlan", event.target.value)}
                />
              </label>
              <details className="record-form-details wide">
                <summary>{t.editor.more}</summary>
                <div className="record-form-details-grid">
                  <label>
                    <span>{t.editor.priority}</span>
                    <select
                      value={form.severity || ""}
                      onChange={(event) => set("severity", event.target.value)}
                    >
                      <option value="">{t.common.notSet}</option>
                      {form.severity === "Critical" && option(t.values.severity, "Critical")}
                      {["Major", "Minor", "Suggestion"].map((value) =>
                        option(t.values.severity, value),
                      )}
                    </select>
                  </label>
                  {paperLinkField}
                  <label>
                    <span>{t.editor.section}</span>
                    <select
                      value={form.manuscriptSection || ""}
                      onChange={(event) => set("manuscriptSection", event.target.value)}
                    >
                      <option value="">{t.common.notSet}</option>
                      {manuscriptSections
                        .slice(1)
                        .map((section) => option(t.values.section, section))}
                      {form.manuscriptSection &&
                        !manuscriptSections.includes(form.manuscriptSection) &&
                        option(t.values.section, form.manuscriptSection)}
                    </select>
                  </label>
                  <label>
                    <span>{t.editor.dueDate}</span>
                    <input
                      type="date"
                      value={form.dueDate || ""}
                      onChange={(event) => set("dueDate", event.target.value)}
                    />
                  </label>
                  <label>
                    <span>{t.editor.category}</span>
                    <select
                      value={form.type || ""}
                      onChange={(event) => set("type", event.target.value)}
                    >
                      <option value="">{t.common.notSet}</option>
                      {["Evidence", "Methods", "Statistics", "Writing", "Reproducibility"].map(
                        (value) => option(t.values.category, value),
                      )}
                    </select>
                  </label>
                  <label>
                    <span>{t.editor.round}</span>
                    <select
                      value={form.reviewRound || ""}
                      onChange={(event) => set("reviewRound", event.target.value)}
                    >
                      <option value="">{t.common.notSet}</option>
                      {["Pre-submission", "R1", "R2", "R3"].map((value) =>
                        option(t.values.round, value),
                      )}
                      {form.reviewRound &&
                        !["Pre-submission", "R1", "R2", "R3"].includes(form.reviewRound) &&
                        option(t.values.round, form.reviewRound)}
                    </select>
                  </label>
                  <label>
                    <span>{t.editor.source}</span>
                    <input
                      value={form.reviewSource || ""}
                      onChange={(event) => set("reviewSource", event.target.value)}
                      placeholder={t.editor.sourcePlaceholder}
                    />
                  </label>
                </div>
              </details>
              {form.status === "Resolved" && (
                <>
                  <label>
                    <span>{t.editor.outcome}</span>
                    <select
                      value={form.resolutionDecision || "Addressed"}
                      onChange={(event) => set("resolutionDecision", event.target.value)}
                    >
                      {[
                        "Addressed",
                        "Partially addressed",
                        "Accepted as limitation",
                        "No change",
                      ].map((value) => option(t.values.resolution, value))}
                    </select>
                  </label>
                  <label className="wide">
                    <span>{t.editor.response}</span>
                    <textarea
                      value={form.resolution || ""}
                      onChange={(event) => set("resolution", event.target.value)}
                    />
                  </label>
                </>
              )}
            </>
          )}
          {editor.collection === "experiments" && (
            <>
              <label>
                <span>{t.editor.method}</span>
                <input
                  value={form.method || ""}
                  onChange={(event) => set("method", event.target.value)}
                />
              </label>
              <label>
                <span>{t.editor.linkedProject}</span>
                <select
                  value={form.linkedProject || ""}
                  onChange={(event) => set("linkedProject", event.target.value)}
                >
                  <option value="">{t.common.notLinked}</option>
                  {state.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {editor.collection === "operations" && (
            <>
              <label>
                <span>{t.editor.linkedProject}</span>
                <select
                  value={form.projectId || ""}
                  onChange={(event) => {
                    const project = state.projects.find((item) => item.id === event.target.value);
                    set("projectId", event.target.value);
                    set("projectTitle", project?.title || "");
                  }}
                >
                  <option value="">{t.common.notLinked}</option>
                  {state.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t.editor.type}</span>
                <select
                  value={form.type || ""}
                  onChange={(event) => set("type", event.target.value)}
                >
                  <option value="">{t.editor.unclassified}</option>
                  {typeChoices.map((type) => option(t.values.operationType, type))}
                </select>
              </label>
              <label>
                <span>{t.editor.dueDate}</span>
                <input
                  type="date"
                  value={form.dueDate || ""}
                  onChange={(event) => set("dueDate", event.target.value)}
                />
              </label>
            </>
          )}
          {editor.collection === "submission-attempts" && (
            <>
              <label>
                <span>{t.editor.journal}</span>
                <input
                  value={form.journal || ""}
                  onChange={(event) => set("journal", event.target.value)}
                />
              </label>
              <label>
                <span>{t.editor.submissionId}</span>
                <input
                  value={form.submissionId || ""}
                  onChange={(event) => set("submissionId", event.target.value)}
                />
              </label>
              <label className="wide">
                <span>{t.editor.portal}</span>
                <input
                  type="url"
                  value={form.portalUrl || ""}
                  onChange={(event) => set("portalUrl", event.target.value)}
                  placeholder="https://…"
                />
              </label>
              {!existing && form.status === "Submitted" && (
                <label>
                  <span>{t.editor.submissionDate}</span>
                  <input
                    type="date"
                    value={(form.submittedAt || "").slice(0, 10)}
                    onChange={(event) => set("submittedAt", event.target.value)}
                  />
                </label>
              )}
              <details className="record-form-details wide">
                <summary>{t.editor.more}</summary>
                <div className="record-form-details-grid">
                  <label>
                    <span>{t.editor.author}</span>
                    <input
                      value={form.correspondingAuthor || ""}
                      onChange={(event) => set("correspondingAuthor", event.target.value)}
                    />
                  </label>
                  <label>
                    <span>{t.editor.email}</span>
                    <input
                      type="email"
                      value={form.correspondingEmail || ""}
                      onChange={(event) => set("correspondingEmail", event.target.value)}
                    />
                  </label>
                  <label>
                    <span>{t.editor.roundShort}</span>
                    <input value={valueLabel(t.values.round, form.round || "Initial")} readOnly />
                  </label>
                  {existing && (
                    <label>
                      <span>{t.editor.submitted}</span>
                      <input
                        type="date"
                        value={(form.submittedAt || "").slice(0, 10)}
                        onChange={(event) => set("submittedAt", event.target.value)}
                      />
                    </label>
                  )}
                  {(form.status === "Revision Required" || form.dueDate) && (
                    <label>
                      <span>{t.editor.revisionDeadline}</span>
                      <input
                        type="date"
                        value={(form.dueDate || "").slice(0, 10)}
                        onChange={(event) => set("dueDate", event.target.value)}
                      />
                    </label>
                  )}
                  <label>
                    <span>{t.editor.followUp}</span>
                    <input
                      type="date"
                      value={(form.followUpDue || "").slice(0, 10)}
                      onChange={(event) => set("followUpDue", event.target.value)}
                    />
                  </label>
                </div>
              </details>
            </>
          )}
          {editor.collection === "submission-events" && (
            <>
              <label>
                <span>{t.editor.attemptId}</span>
                <input
                  value={form.attemptId || ""}
                  onChange={(event) => set("attemptId", event.target.value)}
                />
              </label>
              <label>
                <span>{t.editor.eventDate}</span>
                <input
                  type="date"
                  value={(form.eventDate || "").slice(0, 10)}
                  onChange={(event) => set("eventDate", event.target.value)}
                />
              </label>
              <label>
                <span>{t.editor.source}</span>
                <select
                  value={form.source || "Manual"}
                  onChange={(event) => set("source", event.target.value)}
                >
                  {["Manual", "Email", "Portal"].map((value) => option(t.values.source, value))}
                </select>
              </label>
              <label className="wide">
                <span>{t.editor.rawStatus}</span>
                <input
                  value={form.rawStatus || ""}
                  onChange={(event) => set("rawStatus", event.target.value)}
                />
              </label>
            </>
          )}
        </div>
        {error && (
          <div className="workflow-error">
            <span>!</span>
            <p>{error}</p>
            <button onClick={() => setError("")}>{t.common.dismiss}</button>
          </div>
        )}
        <div className="record-editor-footer">
          {form.id ? (
            confirmDelete ? (
              <span className="delete-confirm">
                <small>{t.editor.deleteNote}</small>
                <button onClick={remove}>{t.editor.deleteForever}</button>
                <button onClick={() => setConfirmDelete(false)}>{t.common.keep}</button>
              </span>
            ) : (
              <button className="delete-record" onClick={() => setConfirmDelete(true)}>
                {t.common.delete}
              </button>
            )
          ) : (
            <span />
          )}
          <span>
            <SaveFeedback state={saving ? "saving" : saved ? "saved" : error ? "error" : "idle"} />
            <button className="quiet-button" onClick={onClose}>
              {t.common.cancel}
            </button>
            <button className="primary-button" disabled={saving || saved} onClick={save}>
              {saving ? t.common.saving : t.editor.saveToObsidian}
            </button>
          </span>
        </div>
      </aside>
    </div>
  );
}
