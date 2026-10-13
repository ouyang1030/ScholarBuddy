"use client";

import { useEffect, useRef, useState } from "react";
import { bridgeFetch } from "../../lib/bridge-client";
import { bridgeFailure, failureText, useLocale, useT, valueLabel } from "../../i18n";
import { localDateKey } from "../../lib/format";
import {
  aiProviders,
  contextPassages,
  isAiProvider,
  manuscriptSections,
  nextTaskId,
  recordContext,
} from "../../lib/workbench";
import { readEventStream } from "../../../shared/sse.mjs";
import {
  manuscriptSectionEntries,
  manuscriptSectionText,
  replaceManuscriptSection,
  sectionBody,
} from "../../../shared/manuscript-text.mjs";
import { workflowContract } from "../../../shared/workflows.mjs";
import { closeWithTransition, DrawerHeader, useUnsavedWork } from "../primitives";
import type {
  Action,
  AiProvider,
  CollectionKey,
  RecordItem,
  WorkbenchState,
  WorkflowAction,
  WorkflowResult,
} from "../../types";
import { BrandLogo } from "../BrandLogo";
import { SourceDot } from "../primitives";

type Turn = { question: string; result: WorkflowResult };

// What each source said about only having been searched in part.
const coverageNotes = (result: WorkflowResult) =>
  Object.values(result.retrieval).flatMap((source) => (source.partial ? [source.partial] : []));

const DAILY_TASKS_KEY = "scholarbuddy-daily-tasks-en-v3";

function addDailyTask(title: string) {
  let stored: { id: number; title: string; done: boolean; date: string }[] = [];
  try {
    stored = JSON.parse(window.localStorage.getItem(DAILY_TASKS_KEY) || "[]");
  } catch {
    stored = [];
  }
  window.localStorage.setItem(
    DAILY_TASKS_KEY,
    JSON.stringify([
      ...stored,
      { id: nextTaskId(stored), title, done: false, date: localDateKey(new Date()) },
    ]),
  );
  // Today's panel keeps its own copy of the list, so it has to be told to re-read
  // it before its next save overwrites what was just appended here.
  window.dispatchEvent(new Event("scholarbuddy-tasks-changed"));
}

export function ActionDrawer({
  action,
  state,
  paper,
  saveRecord,
  onClose,
  openConnections,
  onUnsavedChange,
  ref,
}: {
  action: Action;
  state: WorkbenchState;
  paper?: RecordItem;
  saveRecord: (collection: CollectionKey, record: Partial<RecordItem>) => Promise<RecordItem>;
  onClose: () => void;
  openConnections: () => void;
  onUnsavedChange?: (unsaved: boolean) => void;
  ref?: React.Ref<HTMLElement>;
}) {
  const t = useT();
  const { locale } = useLocale();
  const contract = workflowContract(action.command)!;
  const label = t.actions[action.command as keyof typeof t.actions].label;
  const recordedSections = manuscriptSectionEntries(paper?.description || "");
  const initialSection = recordedSections[0]?.section || "Introduction";
  const [running, setRunning] = useState(false);
  const [provider, setProvider] = useState<AiProvider>(() => {
    const saved =
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem("scholarbuddy-ai-provider");
    return isAiProvider(saved) ? saved : "deepseek";
  });
  const [input, setInput] = useState(label);
  const [followUp, setFollowUp] = useState("");
  const [sources, setSources] = useState({ ...contract.sources });
  const [section, setSection] = useState(initialSection);
  const [sectionText, setSectionText] = useState(
    manuscriptSectionText(paper?.description || "", initialSection),
  );
  const [resultFocus, setResultFocus] = useState({
    resultSummary: "",
    estimate: "",
    confidenceInterval: "",
    pValue: "",
    sampleSize: "",
    model: "",
  });
  const [turns, setTurns] = useState<Turn[]>([]);
  const [live, setLive] = useState({ text: "", reasoning: "" });
  const [error, setError] = useState("");
  const [savedPath, setSavedPath] = useState("");
  const [appliedActions, setAppliedActions] = useState<string[]>([]);
  const controller = useRef<AbortController | null>(null);
  // A run in flight is paid for, and an answer not yet written anywhere exists
  // only in this drawer.
  const canDismiss = useUnsavedWork(
    "answer",
    running || (turns.length > 0 && !savedPath),
    onUnsavedChange,
  );
  // Providers emit a frame every few tokens. Buffering them and repainting on a
  // fixed cadence keeps a long answer from re-rendering the drawer hundreds of
  // times a second while still reading as live typing.
  const buffer = useRef({ text: "", reasoning: "" });
  const flushTimer = useRef<number | null>(null);
  const stopFlushing = () => {
    if (flushTimer.current) window.clearInterval(flushTimer.current);
    flushTimer.current = null;
  };
  useEffect(() => stopFlushing, []);
  const activeProvider = aiProviders.find((item) => item.id === provider) || aiProviders[0];
  const conversationId = turns.at(-1)?.result.conversationId || "";
  const latest = turns.at(-1)?.result;
  const sectionLabel = valueLabel(t.values.section, section);
  const outcomeLabel =
    contract.outcome === "section"
      ? t.workflow.outcomeSection(sectionLabel)
      : contract.outcome === "reviews"
        ? t.workflow.outcomeReviews
        : contract.outcome === "tasks"
          ? t.workflow.outcomeTasks
          : t.workflow.outcomeNote;
  const focus =
    contract.focus === "section"
      ? {
          manuscriptId: paper?.id || "",
          manuscriptTitle: paper?.title || "",
          section,
          sectionText,
        }
      : contract.focus === "result"
        ? resultFocus
        : {};
  const ready =
    input.trim() &&
    (contract.focus !== "section" || sectionText.trim()) &&
    (contract.focus !== "result" || resultFocus.resultSummary.trim());
  useEffect(() => () => controller.current?.abort(), []);
  const run = async (question: string, continues: boolean) => {
    if (!question.trim()) return;
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setRunning(true);
    setError("");
    setLive({ text: "", reasoning: "" });
    buffer.current = { text: "", reasoning: "" };
    stopFlushing();
    flushTimer.current = window.setInterval(() => setLive({ ...buffer.current }), 70);
    // A follow-up produces a new answer, so the previous save no longer stands
    // for what is on screen; leaving the label meant the button still read
    // "Introduction updated" over text that had never been written anywhere.
    setSavedPath("");
    if (!continues) {
      setTurns([]);
      setAppliedActions([]);
    }
    try {
      const response = await bridgeFetch(`/ai/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          input: question,
          command: action.command,
          // Manuscript workflows answer in English whatever this says; the
          // Bridge decides, so the rule lives in one place.
          language: locale,
          sources,
          focus,
          conversationId: continues ? conversationId : "",
          projectContext: continues || !sources.kbase ? "" : recordContext(state, paper?.id || ""),
          passages: continues || !sources.kbase ? [] : contextPassages(state, paper?.id || ""),
        }),
        signal: AbortSignal.any([active.signal, AbortSignal.timeout(180_000)]),
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}));
        throw bridgeFailure(body, "");
      }
      const result = (await readEventStream(response.body, (event, payload) => {
        const data = payload as { text: string; reasoning: string };
        if (event === "delta") buffer.current.text += data.text;
        if (event === "reasoning") buffer.current.reasoning += data.reasoning;
      })) as WorkflowResult;
      stopFlushing();
      setTurns((current) => [...current, { question, result }]);
      setLive({ text: "", reasoning: "" });
      setFollowUp("");
    } catch (e) {
      if (!active.signal.aborted)
        setError(
          e instanceof DOMException && e.name === "TimeoutError"
            ? t.workflow.timedOut
            : e instanceof TypeError
              ? t.errors.unreachable
              : failureText(t, e, t.workflow.failed),
        );
    } finally {
      stopFlushing();
      if (!active.signal.aborted) setRunning(false);
    }
  };
  const applyAction = async (item: WorkflowAction) => {
    try {
      if (item.kind === "review")
        await saveRecord("reviews", {
          title: item.title,
          description: item.detail,
          issueKind: "Feedback",
          severity: item.severity,
          status: "Open",
          manuscriptSection: section,
          reviewSource: "AI assist",
          manuscriptId: paper?.id || "",
          manuscriptTitle: paper?.title || "",
          projectId: paper?.projectId || "",
          projectTitle: paper?.projectTitle || "",
        });
      else if (item.kind === "gap")
        await saveRecord("reviews", {
          title: item.title,
          description: item.detail,
          issueKind: "Feedback",
          severity: item.severity,
          status: "Open",
          dueDate: item.dueDate,
          manuscriptId: paper?.id || "",
          manuscriptTitle: paper?.title || "",
          projectId: paper?.projectId || "",
          projectTitle: paper?.projectTitle || "",
        });
      else addDailyTask(item.title);
      setAppliedActions((current) => [...current, item.title]);
      return true;
    } catch (e) {
      setError(failureText(t, e, t.errors.saveFailed));
      return false;
    }
  };
  // A batch reports what actually landed. Counting what was attempted told the
  // researcher five tasks were added when the vault had rejected three.
  const applyAll = async (items: WorkflowAction[]) => {
    let added = 0;
    for (const item of items) if (await applyAction(item)) added += 1;
    return added;
  };
  // By the time the audit note is written the record it audits is already in the
  // vault, so a note the bridge refuses is reported without retracting a
  // write-back that did happen.
  const trySaveEvidenceNote = async () => {
    try {
      return await saveEvidenceNote();
    } catch (e) {
      setError(failureText(t, e, t.workflow.noteFailed));
      return "";
    }
  };
  const save = async () => {
    if (!latest) return;
    try {
      if (contract.outcome === "section") {
        if (!paper) throw new Error(t.workflow.choosePaper);
        // The model was asked for a body and sometimes returns its own heading
        // on top of it. What actually gets written is checked here rather than
        // discovered later as a duplicate heading in the manuscript.
        const body = sectionBody(latest.output, section);
        if (!body) throw new Error(t.workflow.noSectionText(sectionLabel));
        await saveRecord("manuscripts", {
          ...paper,
          description: replaceManuscriptSection(paper.description || "", section, body),
        });
        setSectionText(body);
        const notePath = await trySaveEvidenceNote();
        setSavedPath(
          `${t.workflow.sectionUpdated(sectionLabel)}${notePath ? t.workflow.withEvidence : ""}`,
        );
        return;
      }
      if (contract.outcome === "tasks") {
        const tasks = latest.actions.filter(
          (item) => item.kind === "task" && !appliedActions.includes(item.title),
        );
        const added = await applyAll(tasks);
        setSavedPath(added ? t.workflow.tasksAdded(added) : t.workflow.noNewTasks);
        return;
      }
      if (contract.outcome === "reviews") {
        const reviews = latest.actions.filter(
          (item) => item.kind === "review" && !appliedActions.includes(item.title),
        );
        const added = reviews.length ? await applyAll(reviews) : 0;
        if (!reviews.length)
          await saveRecord("reviews", {
            title: `AI review · ${section}`,
            description: latest.output,
            issueKind: "Feedback",
            severity: "Major",
            status: "Open",
            manuscriptSection: section,
            reviewSource: "AI assist",
            manuscriptId: paper?.id || "",
            manuscriptTitle: paper?.title || "",
            projectId: paper?.projectId || "",
            projectTitle: paper?.projectTitle || "",
          });
        const notePath = await trySaveEvidenceNote();
        setSavedPath(
          `${reviews.length ? t.workflow.reviewsAdded(added) : t.workflow.reviewAdded}${notePath ? t.workflow.withEvidence : ""}`,
        );
        return;
      }
      setSavedPath(await saveEvidenceNote());
    } catch (e) {
      setError(failureText(t, e, t.errors.saveFailed));
    }
  };
  // The manifest is what turns [Z1] in the answer back into a paper. A workflow
  // that lands its output somewhere else still writes it, or the section now
  // sitting in the manuscript carries citation markers nothing resolves.
  const saveEvidenceNote = async () => {
    if (!latest) return "";
    const evidence =
      [
        ...latest.manifest.zotero.map(
          (item) =>
            `- [${item.id}] ${item.title} — Zotero ${item.key}${item.doi ? ` — DOI ${item.doi}` : ""}`,
        ),
        ...latest.manifest.obsidian.map((item) => `- [${item.id}] ${item.title} — ${item.path}`),
        ...latest.manifest.passages.map(
          (item) =>
            `- [${item.id}] ${item.title || "Passage"}${item.pageLabel ? `, p. ${item.pageLabel}` : ""} — Zotero ${item.key}`,
        ),
      ].join("\n") || "- No external evidence retrieved.";
    const bibliography =
      latest.manifest.bibliography
        .map(
          (item) => `- ${item.title} — Zotero ${item.key}${item.doi ? ` — DOI ${item.doi}` : ""}`,
        )
        .join("\n") || "- None.";
    const transcript = turns
      .map((turn, index) => `## ${index + 1}. ${turn.question}\n\n${turn.result.output}`)
      .join("\n\n");
    // A reader of the saved note has no drawer to warn them the search was partial.
    const coverage = coverageNotes(latest)
      .map((note) => `\n- Coverage: ${note}`)
      .join("");
    const response = await bridgeFetch(`/obsidian/note`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `${action.command} ${localDateKey(new Date())}`,
        content: `---\nscholarbuddyGenerated: true\nprovider: ${latest.provider}\nmodel: ${latest.model}\ncreatedAt: ${new Date().toISOString()}\n---\n\n# ${action.label}\n\n${transcript}\n\n## Evidence manifest\n\n${evidence}${coverage}\n\n## Bibliographic candidates (not evidence)\n\n${bibliography}\n`,
      }),
    });
    const body = await response.json();
    if (!response.ok) throw bridgeFailure(body, "");
    return body.path as string;
  };
  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(event) => {
        if (canDismiss()) closeWithTransition(onClose, event.currentTarget);
      }}
    >
      <aside
        ref={ref}
        className="action-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <DrawerHeader
          label={t.workflow.label}
          mark="✦"
          tone={action.tone}
          eyebrow={action.command}
          title={label}
          onClose={onClose}
        />
        <div className="provider-switch">
          {aiProviders.map((item) => (
            <button
              key={item.id}
              className={provider === item.id ? "active" : ""}
              onClick={() => {
                setProvider(item.id);
                window.localStorage.setItem("scholarbuddy-ai-provider", item.id);
              }}
            >
              <BrandLogo brand={item.id} />
              <b>{item.name}</b>
              <small>{item.fallbackModel}</small>
            </button>
          ))}
        </div>
        <div className="drawer-section">
          <div className="drawer-section-title">
            <span>01</span>
            <strong>{t.workflow.task}</strong>
            <b>{t.workflow.required}</b>
          </div>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} />
        </div>
        {contract.focus === "section" && (
          <div className="drawer-section workflow-focus-input">
            <div className="drawer-section-title">
              <span>02</span>
              <strong>{t.workflow.sectionTitle}</strong>
              <b>{t.workflow.required}</b>
            </div>
            <label>
              <span>{t.workflow.section}</span>
              <select
                value={section}
                onChange={(event) => {
                  const next = event.target.value;
                  setSection(next);
                  setSectionText(manuscriptSectionText(paper?.description || "", next));
                }}
              >
                {manuscriptSections.slice(1).map((item) => (
                  <option key={item} value={item}>
                    {valueLabel(t.values.section, item)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{paper ? paper.title : t.workflow.sectionText}</span>
              <textarea
                value={sectionText}
                onChange={(event) => setSectionText(event.target.value)}
              />
            </label>
          </div>
        )}
        {contract.focus === "result" && (
          <div className="drawer-section workflow-focus-input result-focus-input">
            <div className="drawer-section-title">
              <span>02</span>
              <strong>{t.workflow.resultTitle}</strong>
              <b>{t.workflow.required}</b>
            </div>
            <label className="wide">
              <span>{t.workflow.resultSummary}</span>
              <textarea
                value={resultFocus.resultSummary}
                onChange={(event) =>
                  setResultFocus({ ...resultFocus, resultSummary: event.target.value })
                }
              />
            </label>
            {(["estimate", "confidenceInterval", "pValue", "sampleSize", "model"] as const).map(
              (key) => (
                <label key={key}>
                  <span>{t.workflow[key]}</span>
                  <input
                    value={resultFocus[key]}
                    onChange={(event) =>
                      setResultFocus({ ...resultFocus, [key]: event.target.value })
                    }
                  />
                </label>
              ),
            )}
          </div>
        )}
        <div className="drawer-section">
          <div className="drawer-section-title">
            <span>{["section", "result"].includes(contract.focus) ? "03" : "02"}</span>
            <strong>{t.workflow.sources}</strong>
            <b className="ready">{t.workflow.verified}</b>
          </div>
          <div className="drawer-sources">
            {contract.visibleSources.includes("kbase") && (
              <label>
                <input
                  type="checkbox"
                  checked={sources.kbase}
                  onChange={(e) => setSources({ ...sources, kbase: e.target.checked })}
                />
                <span>{t.workflow.paperSource}</span>
                <b>{t.workflow.passages(contextPassages(state, paper?.id || "").length)}</b>
              </label>
            )}
            {contract.visibleSources.includes("obsidian") && (
              <label>
                <input
                  type="checkbox"
                  checked={sources.obsidian}
                  onChange={(e) => setSources({ ...sources, obsidian: e.target.checked })}
                />
                <span>{t.workflow.obsidianSource}</span>
                <b>{t.workflow.liveSearch}</b>
              </label>
            )}
            {contract.visibleSources.includes("zotero") && (
              <label>
                <input
                  type="checkbox"
                  checked={sources.zotero}
                  onChange={(e) => setSources({ ...sources, zotero: e.target.checked })}
                />
                <span>{t.workflow.zoteroSource}</span>
                <b>{contract.focus === "claim" ? t.workflow.pdfExcerpts : t.workflow.liveSearch}</b>
              </label>
            )}
            {contract.visibleSources.includes("calendar") && (
              <label>
                <input
                  type="checkbox"
                  checked={sources.calendar}
                  onChange={(e) => setSources({ ...sources, calendar: e.target.checked })}
                />
                <span>{t.workflow.calendarSource}</span>
                <b>{t.workflow.calendarScope}</b>
              </label>
            )}
          </div>
        </div>
        {error && (
          <div className="workflow-error">
            <span>!</span>
            <p>{error}</p>
            <button onClick={openConnections}>{t.workflow.connections}</button>
          </div>
        )}
        {turns.map((turn, index) => (
          <section className="workflow-result" key={`${turn.result.conversationId}-${index}`}>
            <div className="workflow-result-head">
              <span>
                <b>
                  {aiProviders.find((item) => item.id === turn.result.provider)?.name ||
                    turn.result.provider}
                </b>
                <small>
                  {turn.result.model} · Zotero{" "}
                  {valueLabel(t.workflow.status, turn.result.retrieval.zotero.status)} · Obsidian{" "}
                  {valueLabel(t.workflow.status, turn.result.retrieval.obsidian.status)}
                  {turn.result.retrieval.calendar?.selected
                    ? ` · ${t.workflow.calendarSource} ${valueLabel(t.workflow.status, turn.result.retrieval.calendar.status)}`
                    : ""}
                </small>
              </span>
              {index === turns.length - 1 && (
                <button onClick={save}>{savedPath || outcomeLabel}</button>
              )}
            </div>
            {index > 0 && <p className="workflow-question">{turn.question}</p>}
            {turn.result.reasoning ? (
              <details className="reasoning-block">
                <summary>{t.workflow.thinking}</summary>
                <pre>{turn.result.reasoning}</pre>
              </details>
            ) : null}
            {coverageNotes(turn.result).map((note) => (
              <div className="citation-warning" key={note}>
                {note} {t.workflow.coverageMissing}
              </div>
            ))}
            {turn.result.invalidReferenceIds.length > 0 && (
              <div className="citation-warning">
                {t.workflow.unknownIds(turn.result.invalidReferenceIds.join(", "))}
              </div>
            )}
            <pre>{turn.result.output}</pre>
            {turn.result.actions.length > 0 && (
              <div className="workflow-actions">
                <span className="label">{t.workflow.nextActions}</span>
                {turn.result.actions.map((item) => (
                  <article key={item.id}>
                    <span>
                      <strong>{item.title}</strong>
                      <small>
                        {item.kind === "review" || item.kind === "gap"
                          ? t.workflow.feedbackItem(valueLabel(t.values.severity, item.severity))
                          : t.workflow.taskItem}
                        {item.dueDate ? t.workflow.due(item.dueDate) : ""}
                      </small>
                    </span>
                    <button
                      className="quiet-button"
                      disabled={appliedActions.includes(item.title)}
                      onClick={() => applyAction(item)}
                    >
                      {appliedActions.includes(item.title)
                        ? t.workflow.added
                        : item.kind === "review" || item.kind === "gap"
                          ? t.workflow.addFeedback
                          : t.workflow.addToday}
                    </button>
                  </article>
                ))}
              </div>
            )}
            <details className="evidence-manifest">
              <summary>
                {t.workflow.manifest(
                  turn.result.manifest.zotero.length +
                    turn.result.manifest.obsidian.length +
                    turn.result.manifest.passages.length,
                )}
              </summary>
              {turn.result.manifest.zotero.map((item) => (
                <p key={item.id}>
                  <b>[{item.id}]</b> {item.title} · Zotero {item.key}
                </p>
              ))}
              {turn.result.manifest.obsidian.map((item) => (
                <p key={item.id}>
                  <b>[{item.id}]</b> {item.title} · {item.path}
                </p>
              ))}
              {turn.result.manifest.passages.map((item) => (
                <p key={item.id}>
                  <b>[{item.id}]</b> {item.title || t.workflow.passage}
                  {item.pageLabel ? t.workflow.page(item.pageLabel) : ""} · Zotero {item.key}
                </p>
              ))}
            </details>
          </section>
        ))}
        {running && (live.text || live.reasoning) && (
          <section className="workflow-result streaming">
            {live.reasoning && (
              <details className="reasoning-block" open>
                <summary>{t.workflow.thinking}</summary>
                <pre>{live.reasoning}</pre>
              </details>
            )}
            <pre>
              {live.text}
              <i className="stream-caret" />
            </pre>
            <small className="stream-note">{t.workflow.streamNote}</small>
          </section>
        )}
        {turns.length > 0 && (
          <div className="drawer-section follow-up">
            <div className="drawer-section-title">
              <span>03</span>
              <strong>{t.workflow.followUp}</strong>
              <b>{t.workflow.sameSources}</b>
            </div>
            <textarea
              value={followUp}
              placeholder={t.workflow.followUpPlaceholder}
              onChange={(e) => setFollowUp(e.target.value)}
            />
            <button
              className="quiet-button"
              disabled={running || !followUp.trim()}
              onClick={() => run(followUp, true)}
            >
              {running ? t.workflow.working : t.workflow.ask}
            </button>
          </div>
        )}
        <div className="drawer-footer">
          <div>
            <SourceDot />
            <span>
              <strong>{t.workflow.footer}</strong>
              <small>
                {activeProvider.name} · {activeProvider.fallbackModel}
              </small>
            </span>
          </div>
          <button
            className="primary-button"
            disabled={running || !ready}
            onClick={() => run(input, false)}
          >
            {running ? t.workflow.working : turns.length ? t.workflow.runAgain : t.workflow.run}
          </button>
        </div>
      </aside>
    </div>
  );
}
