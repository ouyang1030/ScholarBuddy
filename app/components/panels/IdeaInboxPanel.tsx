"use client";

import { useEffect, useRef, useState } from "react";
import { failureText, useT } from "../../i18n";
import type { DataProps } from "../../lib/workbench";
import type { RecordItem } from "../../types";

const DRAFT_KEY = "scholarbuddy-idea-draft-v1";

export function IdeaInboxPanel({
  state,
  saveRecord,
  openEditor,
  project,
}: Pick<DataProps, "state" | "saveRecord" | "openEditor"> & { project?: RecordItem }) {
  const t = useT();
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
    window.addEventListener("scholarbuddy-capture-focus", focus);
    return () => window.removeEventListener("scholarbuddy-capture-focus", focus);
  }, []);
  const run = async (key: string, work: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(key);
    setError("");
    try {
      await work();
    } catch (actionError) {
      setError(failureText(t, actionError, t.errors.saveFailed));
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
          <span className="label">{t.ideas.label}</span>
        </div>
        <span className="completion-count">{t.ideas.waiting(inbox.length)}</span>
      </div>
      <div className="task-capture">
        <input
          ref={inputRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && capture()}
          placeholder={t.ideas.placeholder}
          aria-label={t.ideas.capture}
        />
        <button
          disabled={Boolean(busy) || !text.trim()}
          onClick={capture}
          aria-label={t.ideas.save}
        >
          +
        </button>
      </div>
      {error && (
        <div className="capture-error">
          <span>!</span>
          <p>{error}</p>
          <button onClick={() => setError("")}>{t.common.dismiss}</button>
        </div>
      )}
      {!inbox.length ? (
        <p className="capture-empty">{t.ideas.empty}</p>
      ) : (
        <div className="idea-inbox-list">
          {inbox.slice(0, 6).map((idea) => (
            <div className="idea-row" key={idea.id}>
              <button onClick={() => openEditor("ideas", idea)}>{idea.title}</button>
              <span className="idea-row-actions">
                <button disabled={Boolean(busy)} onClick={() => promote(idea)}>
                  {busy === idea.id ? "…" : t.ideas.promote}
                </button>
                <button
                  disabled={Boolean(busy)}
                  onClick={() => dismiss(idea)}
                  aria-label={t.ideas.drop(idea.title)}
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
