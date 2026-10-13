"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { bridgeFailure, failureText, useT, valueLabel } from "../../i18n";
import { bridgeFetch } from "../../lib/bridge-client";
import { manuscriptSections, passageCitation, passageSection } from "../../lib/workbench";
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
  const t = useT();
  const [passages, setPassages] = useState<ZoteroPassage[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "current" | "unused" | "used">("all");
  const [display, setDisplay] = useState<"cards" | "list">("cards");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState("");
  const [notice, setNotice] = useState("");
  // Only the most recently changed highlights are read; this says so when there are more.
  const [coverage, setCoverage] = useState<{ limit: number; total: number } | null>(null);
  const [paperIds, setPaperIds] = useState<Record<string, string>>({});
  const [sections, setSections] = useState<Record<string, string>>({});
  const [keywords, setKeywords] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await bridgeFetch("/zotero/passages");
      const body = await response.json();
      if (!response.ok) throw bridgeFailure(body, "");
      setPassages(body.passages || []);
      setCoverage(body.truncated ? { limit: body.limit, total: body.total } : null);
    } catch {
      setError(true);
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
          saved?.keywords,
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
    const auto = passageSection(passage);
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
        keywords: keywords[passage.key] ?? existing?.keywords ?? "",
        manuscriptId,
        manuscriptTitle: manuscript?.title || "",
        manuscriptSection: sections[passage.key] || existing?.manuscriptSection || auto.section,
        sectionSource: sections[passage.key]
          ? "manual"
          : existing?.manuscriptSection
            ? // A record saved before sections had a source records none, and
              // claiming "manual" would invent a decision nobody made.
              existing.sectionSource || ""
            : auto.source,
        // Where the highlight physically sits is a fact about the PDF, so it is
        // recorded even when the researcher files it under another section.
        sectionHeading: auto.heading,
        status: existing?.status || "Linked",
        linkedAt: existing?.linkedAt || new Date().toISOString(),
      });
    } catch (linkError) {
      setNotice(failureText(t, linkError, t.errors.saveFailed));
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
      setNotice(failureText(t, usedError, t.errors.saveFailed));
    }
  };
  return (
    <section className="passage-library">
      <div className="passage-toolbar card">
        <div>
          <span className="label">{t.passages.label}</span>
          <h2>{t.passages.title}</h2>
        </div>
        <button className="quiet-button passage-refresh" onClick={load}>
          {t.passages.refresh}
        </button>
        <div className="passage-search">
          <span>⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.passages.search}
          />
        </div>
        <div className="passage-toolbar-bottom">
          <div className="passage-filters">
            <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>
              {t.passages.all}
            </button>
            {paper && (
              <button
                className={filter === "current" ? "active" : ""}
                onClick={() => setFilter("current")}
              >
                {t.passages.current}
              </button>
            )}
            <button
              className={filter === "unused" ? "active" : ""}
              onClick={() => setFilter("unused")}
            >
              {t.passages.unused}
            </button>
            <button className={filter === "used" ? "active" : ""} onClick={() => setFilter("used")}>
              {t.passages.used}
            </button>
          </div>
          <div className="passage-display" aria-label={t.passages.display}>
            <button
              className={display === "cards" ? "active" : ""}
              onClick={() => setDisplay("cards")}
            >
              {t.passages.cards}
            </button>
            <button
              className={display === "list" ? "active" : ""}
              onClick={() => setDisplay("list")}
            >
              {t.passages.list}
            </button>
          </div>
        </div>
      </div>
      {coverage && (
        <p className="panel-notice">
          {coverage.total > coverage.limit
            ? t.passages.coverage(coverage.limit, coverage.total)
            : t.passages.coverageOlder(coverage.limit)}
        </p>
      )}
      {notice && (
        <p className="panel-notice" role="alert">
          {notice}
          <button onClick={() => setNotice("")}>{t.common.dismiss}</button>
        </p>
      )}
      {error ? (
        <div className="calendar-error">
          <span>!</span>
          <p>{t.passages.unavailable}</p>
          <button onClick={load}>{t.common.retry}</button>
        </div>
      ) : loading ? (
        <div className="schedule-loading">
          <span />
          {t.passages.loading}
        </div>
      ) : !visible.length ? (
        <EmptyState title={query ? t.passages.noMatch : t.passages.none} />
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
            const auto = passageSection(passage);
            const chosen = sections[passage.key] || saved?.manuscriptSection || "";
            const selectedSection = chosen || auto.section;
            // Saying where the section came from is the difference between a
            // default worth accepting and one worth checking by hand.
            const sectionOrigin = chosen
              ? t.passages.originChoice
              : auto.source === "pdf"
                ? t.passages.originPdf(auto.heading.slice(0, 32))
                : auto.source === "tag"
                  ? t.passages.originTag
                  : auto.source === "text"
                    ? t.passages.originText
                    : t.passages.originNone;
            return (
              <article
                className="passage-card card"
                key={passage.key}
                style={{ "--passage-color": passage.color } as React.CSSProperties}
              >
                <header>
                  <span className="passage-year-block">
                    <b>{passage.year || "—"}</b>
                    <em
                      className={`passage-list-section${auto.source === "pdf" && !chosen ? " located" : ""}`}
                      title={t.passages.section(sectionOrigin)}
                    >
                      {valueLabel(t.values.section, selectedSection)}
                    </em>
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
                      {valueLabel(t.values.status, saved.status || "Linked")}
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
                    <span>{t.passages.paper}</span>
                    <select
                      value={selectedPaper}
                      onChange={(event) =>
                        setPaperIds((current) => ({
                          ...current,
                          [passage.key]: event.target.value,
                        }))
                      }
                    >
                      <option value="">{t.common.notLinked}</option>
                      {state.manuscripts.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{t.passages.section(sectionOrigin)}</span>
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
                        <option key={section} value={section}>
                          {valueLabel(t.values.section, section)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{t.passages.keywords}</span>
                    <input
                      value={keywords[passage.key] ?? saved?.keywords ?? ""}
                      onChange={(event) =>
                        setKeywords((current) => ({
                          ...current,
                          [passage.key]: event.target.value,
                        }))
                      }
                      placeholder={t.passages.keywordsPlaceholder}
                    />
                  </label>
                </div>
                <footer>
                  <button
                    onClick={() => {
                      window.location.href = passage.url;
                    }}
                  >
                    {t.passages.openZotero}
                  </button>
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(passageCitation(passage));
                      setCopied(passage.key);
                      window.setTimeout(() => setCopied(""), 1600);
                    }}
                  >
                    {copied === passage.key ? t.passages.copied : t.passages.copy}
                  </button>
                  <button
                    className="passage-link"
                    disabled={!selectedPaper}
                    onClick={() => void link(passage)}
                  >
                    {saved ? t.passages.update : t.passages.link}
                  </button>
                  {saved && saved.status !== "Used" && (
                    <button onClick={() => void markUsed(passage)}>{t.passages.markUsed}</button>
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
