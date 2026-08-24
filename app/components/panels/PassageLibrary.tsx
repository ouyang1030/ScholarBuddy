"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { bridgeFetch } from "../../lib/bridge-client";
import { manuscriptSections, passageCitation, suggestedPassageSection } from "../../lib/workbench";
import type { CollectionKey, RecordItem, WorkbenchState, ZoteroPassage } from "../../types";
import { EmptyState, MetaPill } from "../primitives";

export function PassageLibrary({
  state,
  saveRecord,
  paper,
}: {
  state: WorkbenchState;
  saveRecord: (collection: CollectionKey, record: Partial<RecordItem>) => Promise<RecordItem>;
  paper?: RecordItem;
}) {
  const [passages, setPassages] = useState<ZoteroPassage[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "current" | "unused" | "used">("all");
  const [display, setDisplay] = useState<"cards" | "list">("cards");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [notice, setNotice] = useState("");
  const [paperIds, setPaperIds] = useState<Record<string, string>>({});
  const [sections, setSections] = useState<Record<string, string>>({});
  const [keywords, setKeywords] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await bridgeFetch("/zotero/passages");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Passages could not be loaded.");
      setPassages(body.passages || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Passages could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const savedByKey = useMemo(
    () => new Map(state.passages.map((item) => [item.annotationKey, item])),
    [state.passages],
  );
  const visible = useMemo(
    () =>
      passages.filter((passage) => {
        const saved = savedByKey.get(passage.key);
        const text = [
          passage.text,
          passage.comment,
          passage.sourceTitle,
          passage.creators.join(" "),
          passage.year,
          passage.tags.join(" "),
          saved?.workbuddyKeywords,
        ]
          .join(" ")
          .toLowerCase();
        if (query.trim() && !text.includes(query.trim().toLowerCase())) return false;
        if (filter === "current") return Boolean(paper && saved?.manuscriptId === paper.id);
        if (filter === "used") return saved?.status === "Used";
        if (filter === "unused") return saved?.status !== "Used";
        return true;
      }),
    [filter, paper, passages, query, savedByKey],
  );
  const link = async (passage: ZoteroPassage) => {
    const existing = savedByKey.get(passage.key);
    const manuscriptId =
      paperIds[passage.key] ||
      existing?.manuscriptId ||
      paper?.id ||
      state.manuscripts[0]?.id ||
      "";
    const manuscript = state.manuscripts.find((item) => item.id === manuscriptId);
    setNotice("");
    try {
      await saveRecord("passages", {
        ...existing,
        id: `PASS-${passage.key}`,
        title: `Passage · ${passage.sourceTitle}`,
        annotationKey: passage.key,
        attachmentKey: passage.attachmentKey,
        zoteroKey: passage.zoteroItemKey,
        quote: passage.text,
        comment: passage.comment,
        pageLabel: passage.pageLabel,
        zoteroTags: passage.tags,
        sourceTitle: passage.sourceTitle,
        creators: passage.creators,
        year: passage.year,
        citationKey: passage.citationKey,
        workbuddyKeywords: keywords[passage.key] ?? existing?.workbuddyKeywords ?? "",
        manuscriptId,
        manuscriptTitle: manuscript?.title || "",
        manuscriptSection:
          sections[passage.key] || existing?.manuscriptSection || suggestedPassageSection(passage),
        status: existing?.status || "Linked",
        linkedAt: existing?.linkedAt || new Date().toISOString(),
      });
    } catch (linkError) {
      setNotice(
        linkError instanceof Error ? linkError.message : "This passage could not be linked.",
      );
    }
  };
  const markUsed = async (passage: ZoteroPassage) => {
    const existing = savedByKey.get(passage.key);
    if (!existing) return;
    setNotice("");
    try {
      await saveRecord("passages", {
        ...existing,
        status: "Used",
        usedAt: new Date().toISOString(),
      });
    } catch (usedError) {
      setNotice(
        usedError instanceof Error
          ? usedError.message
          : "This passage could not be marked as used.",
      );
    }
  };
  return (
    <section className="passage-library">
      <div className="passage-toolbar card">
        <div>
          <span className="label">ZOTERO HIGHLIGHTS / LIVE</span>
          <h2>Passage Library</h2>
        </div>
        <button className="quiet-button passage-refresh" onClick={load}>
          Refresh
        </button>
        <div className="passage-search">
          <span>⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search passage, note, source, author, or keyword…"
          />
        </div>
        <div className="passage-toolbar-bottom">
          <div className="passage-filters">
            <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>
              All
            </button>
            {paper && (
              <button
                className={filter === "current" ? "active" : ""}
                onClick={() => setFilter("current")}
              >
                Current paper
              </button>
            )}
            <button
              className={filter === "unused" ? "active" : ""}
              onClick={() => setFilter("unused")}
            >
              Unused
            </button>
            <button className={filter === "used" ? "active" : ""} onClick={() => setFilter("used")}>
              Used
            </button>
          </div>
          <div className="passage-display" aria-label="Passage display">
            <button
              className={display === "cards" ? "active" : ""}
              onClick={() => setDisplay("cards")}
            >
              Cards
            </button>
            <button
              className={display === "list" ? "active" : ""}
              onClick={() => setDisplay("list")}
            >
              List
            </button>
          </div>
        </div>
      </div>
      {notice && (
        <p className="panel-notice" role="alert">
          {notice}
          <button onClick={() => setNotice("")}>Dismiss</button>
        </p>
      )}
      {error ? (
        <div className="calendar-error">
          <span>!</span>
          <p>Zotero passages are temporarily unavailable.</p>
          <button onClick={load}>Retry</button>
        </div>
      ) : loading ? (
        <div className="schedule-loading">
          <span />
          Loading Zotero highlights…
        </div>
      ) : !visible.length ? (
        <EmptyState title={query ? "No matching passages" : "No Zotero highlights yet"} />
      ) : (
        <div className={`passage-list ${display === "list" ? "list-view" : "card-view"}`}>
          {visible.map((passage) => {
            const saved = savedByKey.get(passage.key);
            const selectedPaper =
              paperIds[passage.key] ||
              saved?.manuscriptId ||
              paper?.id ||
              state.manuscripts[0]?.id ||
              "";
            const selectedSection =
              sections[passage.key] || saved?.manuscriptSection || suggestedPassageSection(passage);
            return (
              <article
                className="passage-card card"
                key={passage.key}
                style={{ "--passage-color": passage.color } as React.CSSProperties}
              >
                <header>
                  <span className="passage-year-block">
                    <b>{passage.year || "—"}</b>
                    <em className="passage-list-section">{selectedSection}</em>
                  </span>
                  <div>
                    <strong>{passage.sourceTitle}</strong>
                    <small>
                      {[passage.creators.join(", "), passage.pageLabel && `p. ${passage.pageLabel}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </div>
                  {saved && (
                    <MetaPill tone={saved.status === "Used" ? "lime" : "blue"}>
                      {saved.status || "Linked"}
                    </MetaPill>
                  )}
                </header>
                <blockquote>{passage.text || passage.comment}</blockquote>
                {passage.comment && passage.text && (
                  <p className="passage-comment">{passage.comment}</p>
                )}
                <div className="passage-tags">
                  {passage.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                <div className="passage-organize">
                  <label>
                    <span>Paper</span>
                    <select
                      value={selectedPaper}
                      onChange={(event) =>
                        setPaperIds((current) => ({
                          ...current,
                          [passage.key]: event.target.value,
                        }))
                      }
                    >
                      <option value="">Not linked</option>
                      {state.manuscripts.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Section · auto suggested</span>
                    <select
                      value={selectedSection}
                      onChange={(event) =>
                        setSections((current) => ({
                          ...current,
                          [passage.key]: event.target.value,
                        }))
                      }
                    >
                      {manuscriptSections.map((section) => (
                        <option key={section}>{section}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Keywords</span>
                    <input
                      value={keywords[passage.key] ?? saved?.workbuddyKeywords ?? ""}
                      onChange={(event) =>
                        setKeywords((current) => ({
                          ...current,
                          [passage.key]: event.target.value,
                        }))
                      }
                      placeholder="e.g. validity, COD"
                    />
                  </label>
                </div>
                <footer>
                  <button
                    onClick={() => {
                      window.location.href = passage.url;
                    }}
                  >
                    Open in Zotero
                  </button>
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(passageCitation(passage));
                      setCopied(passage.key);
                      window.setTimeout(() => setCopied(""), 1600);
                    }}
                  >
                    {copied === passage.key ? "Copied" : "Copy Citation"}
                  </button>
                  <button
                    className="passage-link"
                    disabled={!selectedPaper}
                    onClick={() => void link(passage)}
                  >
                    {saved ? "Update link" : "Link passage"}
                  </button>
                  {saved && saved.status !== "Used" && (
                    <button onClick={() => void markUsed(passage)}>Mark used</button>
                  )}
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
