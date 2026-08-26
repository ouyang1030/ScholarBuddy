"use client";

import { useState } from "react";
import { clampProgress } from "../../lib/format";
import { CLOSED_RECORD_STATUSES } from "../../../shared/constants.mjs";
import {
  collectionLabels,
  operationTypes,
  statusDefault,
  statusOptions,
} from "../../lib/workbench";
import type { CollectionKey, RecordItem, WorkbenchState } from "../../types";

export type EditorState = { collection: CollectionKey; record?: Partial<RecordItem> } | null;
export function RecordEditor({
  editor,
  state,
  onClose,
  onSave,
  onDelete,
  ref,
}: {
  editor: NonNullable<EditorState>;
  state: WorkbenchState;
  onClose: () => void;
  onSave: (collection: CollectionKey, record: Partial<RecordItem>) => Promise<RecordItem>;
  onDelete: (
    collection: CollectionKey,
    record: Pick<RecordItem, "id" | "version">,
  ) => Promise<void>;
  ref?: React.Ref<HTMLElement>;
}) {
  const isJournal = editor.collection === "journal";
  const isIdea = editor.collection === "ideas";
  const isReadingQueue = editor.collection === "reading-queue";
  const isSubmission =
    editor.collection === "submission-attempts" || editor.collection === "submission-events";
  const showProgress = !isReadingQueue && !isSubmission && !isJournal && !isIdea;
  // A log entry has no status and no percentage, an idea only has the three
  // states its inbox uses, and a reading item is read rather than worked on.
  // None should carry the generic record defaults into the vault, where they
  // would show up as noise on every note.
  const [form, setForm] = useState<Partial<RecordItem>>({
    ...(isJournal ? {} : { status: statusDefault(editor.collection) }),
    ...(showProgress ? { progress: 0 } : {}),
    ...editor.record,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (key: keyof RecordItem, value: string | number | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));
  const save = async () => {
    if (!String(form.title || "").trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const record: Partial<RecordItem> = { ...form, title: String(form.title).trim() };
      // A percentage the form never showed is a value the researcher never set.
      if (!showProgress) delete record.progress;
      else record.progress = clampProgress(form.progress);
      if (isJournal) delete record.status;
      await onSave(editor.collection, record);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this record.");
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!form.id || !form.version) return;
    setSaving(true);
    setError("");
    try {
      await onDelete(editor.collection, { id: form.id, version: form.version });
      onClose();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Could not delete this record.",
      );
      setSaving(false);
    }
  };
  const existing = Boolean(form.id);
  const options = statusOptions(editor.collection);
  // A status the list does not offer still has to be shown and still has to be
  // changeable; left out, the select renders blank and the record looks empty.
  const statusChoices =
    form.status && !options.includes(form.status) ? [...options, form.status] : options;
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
  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside
        ref={ref}
        className="action-drawer record-editor"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        aria-label={`Edit ${collectionLabels[editor.collection]}`}
      >
        <div className="drawer-head">
          <button onClick={onClose}>×</button>
          <span className="label">OBSIDIAN / {editor.collection.toUpperCase()}</span>
          <span className="action-mark mint">✎</span>
        </div>
        <div className="drawer-title">
          {form.id && <span>{form.id}</span>}
          <h2>
            {existing
              ? `Edit ${collectionLabels[editor.collection]}`
              : `New ${collectionLabels[editor.collection]}`}
          </h2>
          <p>
            Saved as a readable Markdown record in Obsidian. Manual values remain authoritative
            until you change them.
          </p>
        </div>
        <div className="record-form">
          <label className="wide">
            <span>Title</span>
            <input
              autoFocus
              value={form.title || ""}
              onChange={(event) => set("title", event.target.value)}
            />
          </label>
          <label className="wide">
            <span>
              {editor.collection === "manuscripts"
                ? "Manuscript text · use Markdown section headings"
                : "Notes"}
            </span>
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
          {!isJournal && (
            <label>
              <span>Status</span>
              <select
                value={form.status || statusDefault(editor.collection)}
                onChange={(event) => {
                  const nextStatus = event.target.value;
                  if (showProgress && CLOSED_RECORD_STATUSES.includes(nextStatus)) {
                    setForm((current) => ({ ...current, status: nextStatus, progress: 100 }));
                  } else {
                    set("status", nextStatus);
                  }
                }}
              >
                {statusChoices.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
          )}
          {isJournal && (
            <label>
              <span>Entry date</span>
              <input
                type="date"
                value={(form.entryDate || "").slice(0, 10)}
                onChange={(event) => set("entryDate", event.target.value)}
              />
            </label>
          )}
          {isIdea && form.promotedTo && (
            <label>
              <span>Promoted to</span>
              <input value={form.promotedTo} readOnly />
            </label>
          )}
          {showProgress && (
            <label>
              <span>Manual progress · {clampProgress(form.progress)}%</span>
              <input
                type="range"
                min="0"
                max="100"
                value={clampProgress(form.progress)}
                onChange={(event) => set("progress", Number(event.target.value))}
              />
            </label>
          )}
          {editor.collection === "projects" && (
            <>
              <label>
                <span>Phase</span>
                <input
                  value={form.phase || ""}
                  onChange={(event) => set("phase", event.target.value)}
                  placeholder="Literature, analysis, writing…"
                />
              </label>
              <label>
                <span>Keywords</span>
                <input
                  value={form.keywords || ""}
                  onChange={(event) => set("keywords", event.target.value)}
                  placeholder="Comma-separated retrieval terms"
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={Boolean(form.active)}
                  onChange={(event) => set("active", event.target.checked)}
                />
                <span>Active project</span>
              </label>
            </>
          )}
          {editor.collection === "research-questions" && (
            <>
              <label>
                <span>Linked project</span>
                <select
                  value={form.linkedProject || ""}
                  onChange={(event) => set("linkedProject", event.target.value)}
                >
                  <option value="">Not linked</option>
                  {state.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Keywords</span>
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
                <span>Linked project</span>
                <select
                  value={form.projectId || ""}
                  onChange={(event) => {
                    const project = state.projects.find((item) => item.id === event.target.value);
                    set("projectId", event.target.value);
                    set("projectTitle", project?.title || "");
                  }}
                >
                  <option value="">Not linked</option>
                  {state.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Paper stage</span>
                <select
                  value={form.stage || "Concept"}
                  onChange={(event) => set("stage", event.target.value)}
                >
                  <option>Concept</option>
                  <option>Developing</option>
                  <option>Internal review</option>
                  <option>Ready to submit</option>
                  <option>Submitted</option>
                  <option>Revision</option>
                  <option>Accepted</option>
                  <option>Published</option>
                  {form.stage === "Accepted / published" && <option>Accepted / published</option>}
                </select>
              </label>
              <label className="wide">
                <span>Next action</span>
                <input
                  value={form.nextAction || ""}
                  onChange={(event) => set("nextAction", event.target.value)}
                  placeholder="The one concrete move that advances this paper"
                />
              </label>
              <label>
                <span>Target journal</span>
                <input
                  value={form.journal || ""}
                  onChange={(event) => set("journal", event.target.value)}
                />
              </label>
              <label>
                <span>Current words</span>
                <input
                  inputMode="numeric"
                  value={form.wordCount || ""}
                  onChange={(event) =>
                    set("wordCount", Number(event.target.value.replace(/\D/g, "")))
                  }
                />
              </label>
              <label>
                <span>Target words</span>
                <input
                  inputMode="numeric"
                  value={form.targetWords || ""}
                  onChange={(event) =>
                    set("targetWords", Number(event.target.value.replace(/\D/g, "")))
                  }
                />
              </label>
              <label>
                <span>Evidence coverage · {clampProgress(form.evidenceCoverage)}%</span>
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
          {supportsPaperLink && (
            <label>
              <span>Linked paper</span>
              <select
                value={form.manuscriptId || ""}
                onChange={(event) => {
                  const manuscript = state.manuscripts.find(
                    (item) => item.id === event.target.value,
                  );
                  set("manuscriptId", event.target.value);
                  set("manuscriptTitle", manuscript?.title || "");
                }}
              >
                <option value="">Not linked</option>
                {state.manuscripts.map((manuscript) => (
                  <option key={manuscript.id} value={manuscript.id}>
                    {manuscript.title}
                  </option>
                ))}
                {/* A record can point at a paper that no longer exists; show that
                    instead of silently rendering it as "Not linked". */}
                {form.manuscriptId &&
                  !state.manuscripts.some((item) => item.id === form.manuscriptId) && (
                    <option value={form.manuscriptId}>
                      {form.manuscriptTitle || form.manuscriptId} · paper not found
                    </option>
                  )}
              </select>
            </label>
          )}
          {editor.collection === "research-debt" && (
            <>
              <label>
                <span>Severity</span>
                <select
                  value={form.severity || "Major"}
                  onChange={(event) => set("severity", event.target.value)}
                >
                  <option>Critical</option>
                  <option>Major</option>
                  <option>Minor</option>
                </select>
              </label>
              <label>
                <span>Type</span>
                <select
                  value={form.type || "Evidence"}
                  onChange={(event) => set("type", event.target.value)}
                >
                  <option>Evidence</option>
                  <option>Methods</option>
                  <option>Statistics</option>
                  <option>Writing</option>
                  <option>Reproducibility</option>
                </select>
              </label>
              <label>
                <span>Paper section</span>
                <input
                  value={form.manuscriptSection || ""}
                  onChange={(event) => set("manuscriptSection", event.target.value)}
                  placeholder="Methods, Results…"
                />
              </label>
              <label>
                <span>Due date</span>
                <input
                  type="date"
                  value={form.dueDate || ""}
                  onChange={(event) => set("dueDate", event.target.value)}
                />
              </label>
            </>
          )}
          {editor.collection === "experiments" && (
            <>
              <label>
                <span>Method</span>
                <input
                  value={form.method || ""}
                  onChange={(event) => set("method", event.target.value)}
                />
              </label>
              <label>
                <span>Linked project</span>
                <select
                  value={form.linkedProject || ""}
                  onChange={(event) => set("linkedProject", event.target.value)}
                >
                  <option value="">Not linked</option>
                  {state.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {editor.collection === "reviews" && (
            <>
              <label>
                <span>Severity</span>
                <select
                  value={form.severity || "Major"}
                  onChange={(event) => set("severity", event.target.value)}
                >
                  <option>Major</option>
                  <option>Minor</option>
                  <option>Suggestion</option>
                </select>
              </label>
              <label>
                <span>Review round</span>
                <select
                  value={form.reviewRound || "Internal"}
                  onChange={(event) => set("reviewRound", event.target.value)}
                >
                  <option>Internal</option>
                  <option>Supervisor</option>
                  <option>Co-author</option>
                  <option>R1</option>
                  <option>R2</option>
                  <option>R3</option>
                </select>
              </label>
              <label>
                <span>Source</span>
                <input
                  value={form.reviewSource || ""}
                  onChange={(event) => set("reviewSource", event.target.value)}
                  placeholder="Reviewer 2, supervisor…"
                />
              </label>
              <label>
                <span>Paper section</span>
                <input
                  value={form.manuscriptSection || ""}
                  onChange={(event) => set("manuscriptSection", event.target.value)}
                  placeholder="Methods, Results…"
                />
              </label>
              <label className="wide">
                <span>Resolution note</span>
                <textarea
                  value={form.resolution || ""}
                  onChange={(event) => set("resolution", event.target.value)}
                  placeholder="What changed, or why no change was made"
                />
              </label>
            </>
          )}
          {editor.collection === "operations" && (
            <>
              <label>
                <span>Linked project</span>
                <select
                  value={form.projectId || ""}
                  onChange={(event) => {
                    const project = state.projects.find((item) => item.id === event.target.value);
                    set("projectId", event.target.value);
                    set("projectTitle", project?.title || "");
                  }}
                >
                  <option value="">Not linked</option>
                  {state.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Type</span>
                <select
                  value={form.type || ""}
                  onChange={(event) => set("type", event.target.value)}
                >
                  <option value="">Unclassified</option>
                  {typeChoices.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Due date</span>
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
                <span>Journal</span>
                <input
                  value={form.journal || ""}
                  onChange={(event) => set("journal", event.target.value)}
                />
              </label>
              <label>
                <span>Submission ID</span>
                <input
                  value={form.submissionId || ""}
                  onChange={(event) => set("submissionId", event.target.value)}
                />
              </label>
              <label className="wide">
                <span>Editorial Manager / ScholarOne URL</span>
                <input
                  type="url"
                  value={form.portalUrl || ""}
                  onChange={(event) => set("portalUrl", event.target.value)}
                  placeholder="https://…"
                />
              </label>
              <label>
                <span>Corresponding author</span>
                <input
                  value={form.correspondingAuthor || ""}
                  onChange={(event) => set("correspondingAuthor", event.target.value)}
                />
              </label>
              <label>
                <span>Author email</span>
                <input
                  type="email"
                  value={form.correspondingEmail || ""}
                  onChange={(event) => set("correspondingEmail", event.target.value)}
                />
              </label>
              <label>
                <span>Round</span>
                <select
                  value={form.round || "Initial"}
                  onChange={(event) => set("round", event.target.value)}
                >
                  <option>Initial</option>
                  <option>R1</option>
                  <option>R2</option>
                  <option>R3</option>
                </select>
              </label>
              <label>
                <span>Submitted</span>
                <input
                  type="date"
                  value={(form.submittedAt || "").slice(0, 10)}
                  onChange={(event) => set("submittedAt", event.target.value)}
                />
              </label>
              <label>
                <span>Current stage since</span>
                <input
                  type="date"
                  value={(form.stageStartedAt || "").slice(0, 10)}
                  onChange={(event) => set("stageStartedAt", event.target.value)}
                />
              </label>
              <label>
                <span>Last verified</span>
                <input
                  type="date"
                  value={(form.lastVerifiedAt || "").slice(0, 10)}
                  onChange={(event) => set("lastVerifiedAt", event.target.value)}
                />
              </label>
              <label>
                <span>Revision deadline</span>
                <input
                  type="date"
                  value={(form.dueDate || "").slice(0, 10)}
                  onChange={(event) => set("dueDate", event.target.value)}
                />
              </label>
              <label>
                <span>Expected response</span>
                <input
                  type="date"
                  value={(form.expectedResponseDate || "").slice(0, 10)}
                  onChange={(event) => set("expectedResponseDate", event.target.value)}
                />
              </label>
              <label>
                <span>Next check</span>
                <input
                  type="date"
                  value={(form.nextCheckDate || "").slice(0, 10)}
                  onChange={(event) => set("nextCheckDate", event.target.value)}
                />
              </label>
              <label>
                <span>Follow-up due</span>
                <input
                  type="date"
                  value={(form.followUpDue || "").slice(0, 10)}
                  onChange={(event) => set("followUpDue", event.target.value)}
                />
              </label>
            </>
          )}
          {editor.collection === "submission-events" && (
            <>
              <label>
                <span>Submission attempt ID</span>
                <input
                  value={form.attemptId || ""}
                  onChange={(event) => set("attemptId", event.target.value)}
                />
              </label>
              <label>
                <span>Event date</span>
                <input
                  type="date"
                  value={(form.eventDate || "").slice(0, 10)}
                  onChange={(event) => set("eventDate", event.target.value)}
                />
              </label>
              <label>
                <span>Source</span>
                <select
                  value={form.source || "Manual"}
                  onChange={(event) => set("source", event.target.value)}
                >
                  <option>Manual</option>
                  <option>Email</option>
                  <option>Portal</option>
                </select>
              </label>
              <label className="wide">
                <span>Original publisher status</span>
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
            <button onClick={() => setError("")}>Dismiss</button>
          </div>
        )}
        <div className="record-editor-footer">
          {form.id ? (
            confirmDelete ? (
              <span className="delete-confirm">
                <small>Removes this record and every saved history version.</small>
                <button onClick={remove}>Delete permanently</button>
                <button onClick={() => setConfirmDelete(false)}>Keep</button>
              </span>
            ) : (
              <button className="delete-record" onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            )
          ) : (
            <span />
          )}
          <span>
            <button className="quiet-button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary-button" disabled={saving} onClick={save}>
              {saving ? "Saving…" : "Save to Obsidian"}
            </button>
          </span>
        </div>
      </aside>
    </div>
  );
}
