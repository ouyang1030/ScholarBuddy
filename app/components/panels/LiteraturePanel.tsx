"use client";

import { useCallback, useEffect, useState } from "react";
import { bridgeFetch } from "../../lib/bridge-client";
import type { CollectionKey, RecordItem, WorkbenchState, ZoteroItem } from "../../types";
import { EmptyState, SourceDot } from "../primitives";

export function LiteraturePanel({
  state,
  saveRecord,
  compact = false,
  paper,
}: {
  state: WorkbenchState;
  saveRecord: (collection: CollectionKey, record: Partial<RecordItem>) => Promise<RecordItem>;
  compact?: boolean;
  paper?: RecordItem;
}) {
  const activeProject = state.projects.find((item) => item.active) || state.projects[0];
  const activeRQ =
    state["research-questions"].find((item) => item.status === "Active") ||
    state["research-questions"][0];
  const seed = [activeProject?.keywords, activeProject?.title, activeRQ?.keywords, activeRQ?.title]
    .filter(Boolean)
    .join(" ")
    .slice(0, 240);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ZoteroItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const queue = async (item: ZoteroItem) => {
    setNotice("");
    try {
      await saveRecord("reading-queue", {
        id: `zotero-${item.key}`,
        title: item.title.replace(/<[^>]+>/g, ""),
        zoteroKey: item.key,
        creators: item.creators,
        year: item.year,
        doi: item.doi,
        status: "Queued",
        manuscriptId: paper?.id || "",
        manuscriptTitle: paper?.title || "",
      });
    } catch (queueError) {
      setNotice(
        queueError instanceof Error
          ? queueError.message
          : "This paper could not be added to the reading queue.",
      );
    }
  };
  const search = useCallback(async (value: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await bridgeFetch(`/zotero/search?q=${encodeURIComponent(value.trim())}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Zotero search failed.");
      setItems(body.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Zotero search failed.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const initial = seed || "";
      setQuery(initial);
      void search(initial);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [search, seed]);
  const queued = new Set(state["reading-queue"].map((item) => item.zoteroKey));
  return (
    <article className={`${compact ? "literature-radar" : "literature-card"} card real-panel`}>
      <div className="section-heading">
        <div>
          <span className="label">ZOTERO / LIVE LIBRARY</span>
        </div>
        <span className="source-chip">
          <SourceDot />
          Zotero
        </span>
      </div>
      {paper && (
        <p className="paper-link-note">
          Adding literature to <strong>{paper.title}</strong>
        </p>
      )}
      <div className="literature-search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search(query)}
          placeholder="Search your Zotero library…"
        />
        <button onClick={() => search(query)}>Search</button>
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
          <p>Zotero is temporarily unavailable.</p>
          <button onClick={() => search(query)}>Retry</button>
        </div>
      ) : loading ? (
        <div className="schedule-loading">
          <span />
          Searching Zotero…
        </div>
      ) : !items.length ? (
        <EmptyState title="No matching records" />
      ) : (
        <div className="real-paper-list">
          {items.slice(0, compact ? 5 : 12).map((item) => (
            <article key={item.key}>
              <span className="zotero-year">{item.year || "—"}</span>
              <div>
                <strong>{item.title.replace(/<[^>]+>/g, "")}</strong>
                <small>{item.creators.join(", ") || "No creators recorded"}</small>
                <em>{item.doi ? `DOI ${item.doi}` : `Zotero item ${item.key}`}</em>
              </div>
              <span className="paper-buttons">
                <button
                  onClick={() => {
                    window.location.href = `zotero://select/library/items/${item.key}`;
                  }}
                >
                  Open
                </button>
                <button
                  className={queued.has(item.key) ? "queued" : ""}
                  disabled={queued.has(item.key)}
                  onClick={() => void queue(item)}
                >
                  {queued.has(item.key) ? "Queued" : paper ? "+ Attach" : "+ Queue"}
                </button>
              </span>
            </article>
          ))}
        </div>
      )}
    </article>
  );
}
