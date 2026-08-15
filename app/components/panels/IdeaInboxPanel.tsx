"use client";

import { useEffect, useRef, useState } from "react";
import type { DataProps } from "../../lib/workbench";
import type { RecordItem } from "../../types";

const DRAFT_KEY = "workbuddy-idea-draft-v1";

export function IdeaInboxPanel({
  state,
  saveRecord,
  openEditor,
  project,
}: Pick<DataProps, "state" | "saveRecord" | "openEditor"> & { project?: RecordItem }) {
  const [text, setText] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setText(window.localStorage.getItem(DRAFT_KEY) || "");
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (ready) window.localStorage.setItem(DRAFT_KEY, text);
  }, [ready, text]);
  useEffect(() => {
    const focus = (event: Event) => {
      if ((event as CustomEvent<{ target?: string }>).detail?.target !== "idea") return;
      inputRef.current?.focus();
    };
    window.addEventListener("workbuddy-capture-focus", focus);
    return () => window.removeEventListener("workbuddy-capture-focus", focus);
  }, []);
  const run = async (key: string, work: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(key);
    setError("");
    try {
      await work();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "That could not be saved yet.");
    } finally {
      setBusy("");
    }
  };
  const capture = () => {
    const title = text.trim();
    if (!title) return;
    return run("capture", async () => {
      await saveRecord("ideas", {
        title: title.slice(0, 200),
        status: "Inbox",
        ...(project ? { projectId: project.id, projectTitle: project.title } : {}),
      });
      setText("");
    });
  };
  // Promotion happens in one click rather than through the record editor: the
  // idea becomes a real research question immediately and keeps a link back to it.
  const promote = (idea: RecordItem) =>
    run(idea.id, async () => {
      const linkedProject = idea.projectId || project?.id;
      const question = await saveRecord("research-questions", {
        title: idea.title,
        description: idea.description || "",
        status: "Active",
        ...(linkedProject ? { linkedProject } : {}),
      });
      await saveRecord("ideas", { ...idea, status: "Promoted", promotedTo: question.id });
    });
  const dismiss = (idea: RecordItem) =>
    run(idea.id, () => saveRecord("ideas", { ...idea, status: "Dropped" }));
  const inbox = state.ideas.filter((item) => (item.status || "Inbox") === "Inbox");
  return (
    <article className="idea-inbox card real-panel">
      <div className="section-heading">
        <div>
          <span className="label">IDEA INBOX / OBSIDIAN</span>
          <p>Catch it now, judge it later</p>
        </div>
        <span className="completion-count">
          <b>{inbox.length}</b> waiting
        </span>
      </div>
      <div className="task-capture">
        <input
          ref={inputRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && capture()}
          placeholder="One line — ⌘ I from anywhere…"
          aria-label="Capture an idea"
        />
        <button disabled={Boolean(busy) || !text.trim()} onClick={capture} aria-label="Save idea">
          +
        </button>
      </div>
      {error && (
        <div className="capture-error">
          <span>!</span>
          <p>{error}</p>
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      {!inbox.length ? (
        <p className="capture-empty">
          Nothing waiting. Anything you capture stays here until you promote it to a research
          question or drop it.
        </p>
      ) : (
        <div className="idea-inbox-list">
          {inbox.slice(0, 6).map((idea) => (
            <div className="idea-row" key={idea.id}>
              <button onClick={() => openEditor("ideas", idea)}>{idea.title}</button>
              <span className="idea-row-actions">
                <button disabled={Boolean(busy)} onClick={() => promote(idea)}>
                  {busy === idea.id ? "…" : "↑ Question"}
                </button>
                <button
                  disabled={Boolean(busy)}
                  onClick={() => dismiss(idea)}
                  aria-label={`Drop ${idea.title}`}
                >
                  ×
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
