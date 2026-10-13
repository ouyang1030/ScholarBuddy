"use client";

import { useState } from "react";
import { useT, valueLabel } from "../../i18n";
import { readingStatusClass, type DataProps } from "../../lib/workbench";
import type { RecordItem } from "../../types";
import { EmptyState } from "../primitives";
import { PanelBoundary } from "../PanelBoundary";
import { LiteraturePanel } from "../panels/LiteraturePanel";
import { PassageLibrary } from "../panels/PassageLibrary";

export function LibraryModule({
  state,
  saveRecord,
  openEditor,
  paper,
}: Pick<DataProps, "state" | "saveRecord" | "openEditor"> & { paper?: RecordItem }) {
  const t = useT();
  const [tab, setTab] = useState<"literature" | "queue" | "passages">("literature");
  const queued = state["reading-queue"];
  return (
    <>
      <div className="module-tabs library-tabs">
        <button
          className={tab === "literature" ? "active" : ""}
          onClick={() => setTab("literature")}
        >
          {t.libraryPage.literature}
        </button>
        <button className={tab === "queue" ? "active" : ""} onClick={() => setTab("queue")}>
          {t.libraryPage.queue}
        </button>
        <button className={tab === "passages" ? "active" : ""} onClick={() => setTab("passages")}>
          {t.libraryPage.passages}
        </button>
      </div>
      <section className="page-intro compact">
        <div>
          <p className="eyebrow">{t.libraryPage.eyebrow}</p>
          <h1>
            {t.libraryPage.titleLead}
            <em>{t.libraryPage.titleEm}</em>
          </h1>
        </div>
        {tab === "queue" && (
          <button
            className="primary-button"
            onClick={() =>
              openEditor(
                "reading-queue",
                paper ? { manuscriptId: paper.id, manuscriptTitle: paper.title } : undefined,
              )
            }
          >
            {t.libraryPage.addItem} <b>+</b>
          </button>
        )}
      </section>
      {tab === "literature" && (
        <PanelBoundary label={t.today.panels.library}>
          <LiteraturePanel state={state} saveRecord={saveRecord} paper={paper} />
        </PanelBoundary>
      )}
      {tab === "passages" && (
        <PanelBoundary label={t.libraryPage.passages}>
          <PassageLibrary state={state} saveRecord={saveRecord} paper={paper} />
        </PanelBoundary>
      )}
      {tab === "queue" && (
        <section className="editable-section card reading-queue-section">
          <div className="section-heading">
            <div>
              <span className="label">{t.libraryPage.queueLabel}</span>
            </div>
          </div>
          {!queued.length ? (
            <EmptyState title={t.libraryPage.noQueue} />
          ) : (
            <div className="reading-queue-list">
              {queued.map((item) => {
                const status = item.status || "Queued";
                return (
                  <button
                    key={item.id}
                    className={`reading-queue-item ${readingStatusClass(status)}`}
                    onClick={() => openEditor("reading-queue", item)}
                  >
                    <span className="reading-queue-year">{item.year || "—"}</span>
                    <span className="reading-queue-body">
                      <strong>{item.title}</strong>
                      <small>
                        {item.creators?.join(", ") || item.doi || t.libraryPage.savedLiterature}
                      </small>
                      {item.manuscriptTitle && (
                        <em className="reading-queue-paper">↳ {item.manuscriptTitle}</em>
                      )}
                    </span>
                    <span className="reading-status">{valueLabel(t.values.status, status)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}
    </>
  );
}
