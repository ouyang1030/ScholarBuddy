"use client";

import { useCallback, useEffect, useState } from "react";
import { bridgeFetch } from "../../lib/bridge-client";
import { bridgeFailure, failureText, useT, valueLabel } from "../../i18n";
import { readingStatusClass } from "../../lib/workbench";
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
  const t = useT();
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
      setNotice(failureText(t, queueError, t.errors.saveFailed));
    }
  };
  const search = useCallback(async (value: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await bridgeFetch(`/zotero/search?q=${encodeURIComponent(value.trim())}`);
      const body = await response.json();
      if (!response.ok) throw bridgeFailure(body, "search failed");
      setItems(body.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "search failed");
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
  // The queue is what says how far a paper has been read, so this reports the
  // state the record is actually in rather than the fact that it was once added.
  const queuedStatus = new Map(
    state["reading-queue"]
      .filter((item) => item.zoteroKey)
      .map((item) => [item.zoteroKey as string, item.status || "Queued"]),
  );
  return (
    <article className={`${compact ? "literature-radar" : "literature-card"} card real-panel`}>
      <div className="section-heading">
        <div>
          <span className="label">{t.library.label}</span>
        </div>
        <span className="source-chip">
          <SourceDot />
          Zotero
        </span>
      </div>
      {paper && (
        <p className="paper-link-note">
          {t.library.for} <strong>{paper.title}</strong>
        </p>
      )}
      <div className="literature-search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search(query)}
          placeholder={t.library.search}
        />
        <button onClick={() => search(query)}>{t.library.searchButton}</button>
      </div>
      {notice && (
        <p className="panel-notice" role="alert">
          {notice}
          <button onClick={() => setNotice("")}>{t.common.dismiss}</button>
        </p>
      )}
      {error ? (
        <div className="calendar-error">
          <span>!</span>
          <p>{t.library.unavailable}</p>
          <button onClick={() => search(query)}>{t.common.retry}</button>
        </div>
      ) : loading ? (
        <div className="schedule-loading">
          <span />
          {t.library.searching}
        </div>
      ) : !items.length ? (
        <EmptyState title={t.library.noResults} />
      ) : (
        <div className="real-paper-list">
          {items.slice(0, compact ? 5 : 12).map((item) => (
            <article key={item.key}>
              <span className="zotero-year">{item.year || "—"}</span>
              <div>
                <strong>{item.title.replace(/<[^>]+>/g, "")}</strong>
                <small>{item.creators.join(", ") || t.library.noAuthors}</small>
                <em>{item.doi ? `DOI ${item.doi}` : t.library.item(item.key)}</em>
              </div>
              <span className="paper-buttons">
                <button
                  onClick={() => {
                    window.location.href = `zotero://select/library/items/${item.key}`;
                  }}
                >
                  {t.library.open}
                </button>
                <button
                  className={
                    queuedStatus.has(item.key)
                      ? `queued ${readingStatusClass(queuedStatus.get(item.key) || "")}`
                      : ""
                  }
                  disabled={queuedStatus.has(item.key)}
                  onClick={() => void queue(item)}
                >
                  {queuedStatus.has(item.key)
                    ? valueLabel(t.values.status, queuedStatus.get(item.key))
                    : paper
                      ? t.library.attach
                      : t.library.queue}
                </button>
              </span>
            </article>
          ))}
        </div>
      )}
    </article>
  );
}
