"use client";

import { useEffect, useRef, useState } from "react";
import { bridgeFetch } from "../../lib/bridge-client";
import { localDateKey } from "../../lib/format";
import {
  aiProviders,
  contextPassages,
  isAiProvider,
  manuscriptSections,
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

const DAILY_TASKS_KEY = "workbuddy-daily-tasks-en-v3";

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
      { id: Date.now(), title, done: false, date: localDateKey(new Date()) },
    ]),
  );
  // Today's panel keeps its own copy of the list, so it has to be told to re-read
  // it before its next save overwrites what was just appended here.
  window.dispatchEvent(new Event("workbuddy-tasks-changed"));
}

export function ActionDrawer({
  action,
  state,
  paper,
  saveRecord,
  onClose,
  openConnections,
  ref,
}: {
  action: Action;
  state: WorkbenchState;
  paper?: RecordItem;
  saveRecord: (collection: CollectionKey, record: Partial<RecordItem>) => Promise<RecordItem>;
  onClose: () => void;
  openConnections: () => void;
  ref?: React.Ref<HTMLElement>;
}) {
  const contract = workflowContract(action.command)!;
  const recordedSections = manuscriptSectionEntries(paper?.description || "");
  const initialSection = recordedSections[0]?.section || "Introduction";
  const [running, setRunning] = useState(false);
  const [provider, setProvider] = useState<AiProvider>(() => {
    const saved =
      typeof window === "undefined" ? null : window.localStorage.getItem("workbuddy-ai-provider");
    return isAiProvider(saved) ? saved : "deepseek";
  });
  const [input, setInput] = useState(action.label);
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
  const outcomeLabel =
    contract.outcome === "section"
      ? `Update ${section}`
      : contract.outcome === "reviews"
        ? "Add review items"
        : contract.outcome === "tasks"
          ? "Add plan to Today"
          : "Save with evidence";
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
        throw new Error(body.error || "Workflow failed.");
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
            ? "The AI workflow timed out."
            : e instanceof TypeError
              ? "The local bridge is unreachable or local access is blocked."
              : e instanceof Error
                ? e.message
                : "Workflow failed.",
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
          severity: item.severity,
          status: "Active",
          manuscriptSection: section,
          reviewSource: "AI assist",
          manuscriptId: paper?.id || "",
          manuscriptTitle: paper?.title || "",
          projectId: paper?.projectId || "",
          projectTitle: paper?.projectTitle || "",
        });
      else if (item.kind === "gap")
        await saveRecord("research-debt", {
          title: item.title,
          description: item.detail,
          severity: item.severity,
          status: "Active",
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
      setError(e instanceof Error ? e.message : "Could not save that action.");
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
      setError(e instanceof Error ? e.message : "Evidence note could not be saved.");
      return "";
    }
  };
  const save = async () => {
    if (!latest) return;
    try {
      if (contract.outcome === "section") {
        if (!paper) throw new Error("Choose a manuscript before writing a section.");
        // The model was asked for a body and sometimes returns its own heading
        // on top of it. What actually gets written is checked here rather than
        // discovered later as a duplicate heading in the manuscript.
        const body = sectionBody(latest.output, section);
        if (!body)
          throw new Error(`The answer holds no ${section} text to write. Run the workflow again.`);
        await saveRecord("manuscripts", {
          ...paper,
          description: replaceManuscriptSection(paper.description || "", section, body),
        });
        setSectionText(body);
        const notePath = await trySaveEvidenceNote();
        setSavedPath(`${section} updated${notePath ? " · evidence saved" : ""}`);
        return;
      }
      if (contract.outcome === "tasks") {
        const tasks = latest.actions.filter(
          (item) => item.kind === "task" && !appliedActions.includes(item.title),
        );
        const added = await applyAll(tasks);
        setSavedPath(added ? `${added} tasks added` : "No new tasks");
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
            severity: "Major",
            status: "Active",
            manuscriptSection: section,
            reviewSource: "AI assist",
            manuscriptId: paper?.id || "",
            manuscriptTitle: paper?.title || "",
            projectId: paper?.projectId || "",
            projectTitle: paper?.projectTitle || "",
          });
        const notePath = await trySaveEvidenceNote();
        setSavedPath(
          `${reviews.length ? `${added} review items added` : "Review added"}${notePath ? " · evidence saved" : ""}`,
        );
        return;
      }
      setSavedPath(await saveEvidenceNote());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save to Obsidian.");
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
    const response = await bridgeFetch(`/obsidian/note`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `${action.command} ${localDateKey(new Date())}`,
        content: `---\nworkbuddyGenerated: true\nprovider: ${latest.provider}\nmodel: ${latest.model}\ncreatedAt: ${new Date().toISOString()}\n---\n\n# ${action.label}\n\n${transcript}\n\n## Evidence manifest\n\n${evidence}\n\n## Bibliographic candidates (not evidence)\n\n${bibliography}\n`,
      }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    return body.path as string;
  };
  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside
        ref={ref}
        className="action-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={action.label}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <button onClick={onClose}>×</button>
          <span className="label">STRUCTURED AI WORKFLOW</span>
          <span className={`action-mark ${action.tone}`}>✦</span>
        </div>
        <div className="drawer-title">
          <span>{action.command}</span>
          <h2>{action.label}</h2>
          <p>Selected sources must be retrieved successfully before the model runs.</p>
        </div>
        <div className="provider-switch">
          {aiProviders.map((item) => (
            <button
              key={item.id}
              className={provider === item.id ? "active" : ""}
              onClick={() => {
                setProvider(item.id);
                window.localStorage.setItem("workbuddy-ai-provider", item.id);
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
            <strong>Task input</strong>
            <b>Required</b>
          </div>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} />
        </div>
        {contract.focus === "section" && (
          <div className="drawer-section workflow-focus-input">
            <div className="drawer-section-title">
              <span>02</span>
              <strong>Exact manuscript section</strong>
              <b>Required</b>
            </div>
            <label>
              <span>Section</span>
              <select
                value={section}
                onChange={(event) => {
                  const next = event.target.value;
                  setSection(next);
                  setSectionText(manuscriptSectionText(paper?.description || "", next));
                }}
              >
                {manuscriptSections.slice(1).map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              <span>{paper ? paper.title : "Paste the section text"}</span>
              <textarea
                value={sectionText}
                onChange={(event) => setSectionText(event.target.value)}
                placeholder={`Paste or write the ${section.toLowerCase()} section here…`}
              />
            </label>
          </div>
        )}
        {contract.focus === "result" && (
          <div className="drawer-section workflow-focus-input result-focus-input">
            <div className="drawer-section-title">
              <span>02</span>
              <strong>Structured result</strong>
              <b>Required</b>
            </div>
            <label className="wide">
              <span>Result to explain</span>
              <textarea
                value={resultFocus.resultSummary}
                onChange={(event) =>
                  setResultFocus({ ...resultFocus, resultSummary: event.target.value })
                }
                placeholder="State the result exactly as reported…"
              />
            </label>
            {[
              ["estimate", "Estimate / effect size"],
              ["confidenceInterval", "Confidence interval"],
              ["pValue", "p value"],
              ["sampleSize", "Sample size"],
              ["model", "Model / statistical test"],
            ].map(([key, label]) => (
              <label key={key}>
                <span>{label}</span>
                <input
                  value={resultFocus[key as keyof typeof resultFocus]}
                  onChange={(event) =>
                    setResultFocus({ ...resultFocus, [key]: event.target.value })
                  }
                />
              </label>
            ))}
          </div>
        )}
        <div className="drawer-section">
          <div className="drawer-section-title">
            <span>{["section", "result"].includes(contract.focus) ? "03" : "02"}</span>
            <strong>Live sources</strong>
            <b className="ready">Verified before AI</b>
          </div>
          <div className="drawer-sources">
            {contract.visibleSources.includes("kbase") && (
              <label>
                <input
                  type="checkbox"
                  checked={sources.kbase}
                  onChange={(e) => setSources({ ...sources, kbase: e.target.checked })}
                />
                <span>Paper frame &amp; passages</span>
                <b>{contextPassages(state, paper?.id || "").length} passages</b>
              </label>
            )}
            {contract.visibleSources.includes("obsidian") && (
              <label>
                <input
                  type="checkbox"
                  checked={sources.obsidian}
                  onChange={(e) => setSources({ ...sources, obsidian: e.target.checked })}
                />
                <span>Obsidian notes</span>
                <b>Live search</b>
              </label>
            )}
            {contract.visibleSources.includes("zotero") && (
              <label>
                <input
                  type="checkbox"
                  checked={sources.zotero}
                  onChange={(e) => setSources({ ...sources, zotero: e.target.checked })}
                />
                <span>Zotero literature</span>
                <b>{contract.focus === "claim" ? "PDF excerpts" : "Live search"}</b>
              </label>
            )}
            {contract.visibleSources.includes("calendar") && (
              <label>
                <input
                  type="checkbox"
                  checked={sources.calendar}
                  onChange={(e) => setSources({ ...sources, calendar: e.target.checked })}
                />
                <span>Committed time</span>
                <b>7 days · titles only</b>
              </label>
            )}
          </div>
        </div>
        {error && (
          <div className="workflow-error">
            <span>!</span>
            <p>{error}</p>
            <button onClick={openConnections}>Connections</button>
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
                  {turn.result.model} · Zotero {turn.result.retrieval.zotero.status} · Obsidian{" "}
                  {turn.result.retrieval.obsidian.status}
                  {turn.result.retrieval.calendar?.selected
                    ? ` · Calendar ${turn.result.retrieval.calendar.status}`
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
                <summary>🧠 Thinking process</summary>
                <pre>{turn.result.reasoning}</pre>
              </details>
            ) : null}
            {turn.result.invalidReferenceIds.length > 0 && (
              <div className="citation-warning">
                Unknown reference IDs: {turn.result.invalidReferenceIds.join(", ")}
              </div>
            )}
            <pre>{turn.result.output}</pre>
            {turn.result.actions.length > 0 && (
              <div className="workflow-actions">
                <span className="label">NEXT ACTIONS</span>
                {turn.result.actions.map((item) => (
                  <article key={item.id}>
                    <span>
                      <strong>{item.title}</strong>
                      <small>
                        {item.kind === "review"
                          ? `Review item · ${item.severity}`
                          : item.kind === "gap"
                            ? `Research gap · ${item.severity}`
                            : "Task for today"}
                        {item.dueDate ? ` · due ${item.dueDate}` : ""}
                      </small>
                    </span>
                    <button
                      className="quiet-button"
                      disabled={appliedActions.includes(item.title)}
                      onClick={() => applyAction(item)}
                    >
                      {appliedActions.includes(item.title)
                        ? "Added ✓"
                        : item.kind === "review"
                          ? "Add review"
                          : item.kind === "gap"
                            ? "Add gap"
                            : "Add to today"}
                    </button>
                  </article>
                ))}
              </div>
            )}
            <details className="evidence-manifest">
              <summary>
                Evidence manifest ·{" "}
                {turn.result.manifest.zotero.length +
                  turn.result.manifest.obsidian.length +
                  turn.result.manifest.passages.length}{" "}
                sources
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
                  <b>[{item.id}]</b> {item.title || "Passage"}
                  {item.pageLabel ? `, p. ${item.pageLabel}` : ""} · Zotero {item.key}
                </p>
              ))}
            </details>
          </section>
        ))}
        {running && (live.text || live.reasoning) && (
          <section className="workflow-result streaming">
            {live.reasoning && (
              <details className="reasoning-block" open>
                <summary>🧠 Thinking process</summary>
                <pre>{live.reasoning}</pre>
              </details>
            )}
            <pre>
              {live.text}
              <i className="stream-caret" />
            </pre>
            <small className="stream-note">
              Citations are audited against the evidence manifest when the answer completes.
            </small>
          </section>
        )}
        {turns.length > 0 && (
          <div className="drawer-section follow-up">
            <div className="drawer-section-title">
              <span>03</span>
              <strong>Follow-up</strong>
              <b>Same sources</b>
            </div>
            <textarea
              value={followUp}
              placeholder="Ask about the answer above — the retrieved sources and their [Z1] ids stay fixed."
              onChange={(e) => setFollowUp(e.target.value)}
            />
            <button
              className="quiet-button"
              disabled={running || !followUp.trim()}
              onClick={() => run(followUp, true)}
            >
              {running ? "Working…" : "Ask follow-up"}
            </button>
          </div>
        )}
        <div className="drawer-footer">
          <div>
            <SourceDot />
            <span>
              <strong>Traceable-source workflow</strong>
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
            {running ? "Working…" : turns.length ? "Run again" : "Run workflow"}
          </button>
        </div>
      </aside>
    </div>
  );
}
