"use client";

import { useState } from "react";
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
  const [tab, setTab] = useState<"literature" | "queue" | "passages">("literature");
  const queued = state["reading-queue"];
  const description =
    tab === "passages"
      ? paper
        ? `Turn Zotero highlights into evidence for ${paper.title}.`
        : "Search and organize highlighted passages before placing them in a manuscript."
      : tab === "queue"
        ? "Keep the papers worth reading next in one deliberate queue."
        : paper
          ? `Attach evidence to ${paper.title} while you build its argument.`
          : "Find relevant evidence in your live Zotero library.";
  return (
    <>
      <div className="module-tabs library-tabs">
        <button
          className={tab === "literature" ? "active" : ""}
          onClick={() => setTab("literature")}
        >
          Literature
        </button>
        <button className={tab === "queue" ? "active" : ""} onClick={() => setTab("queue")}>
          Reading queue
        </button>
        <button className={tab === "passages" ? "active" : ""} onClick={() => setTab("passages")}>
          Passage Library
        </button>
      </div>
      <section className="page-intro compact">
        <div>
          <p className="eyebrow">ZOTERO + OBSIDIAN</p>
          <h1>
            Research <em>library.</em>
          </h1>
          <p>{description}</p>
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
            Add reading item <b>+</b>
          </button>
        )}
      </section>
      {tab === "literature" && (
        <PanelBoundary label="Zotero library">
          <LiteraturePanel state={state} saveRecord={saveRecord} paper={paper} />
        </PanelBoundary>
      )}
      {tab === "passages" && (
        <PanelBoundary label="Passage Library">
          <PassageLibrary state={state} saveRecord={saveRecord} paper={paper} />
        </PanelBoundary>
      )}
      {tab === "queue" && (
        <section className="editable-section card reading-queue-section">
          <div className="section-heading">
            <div>
              <span className="label">READING QUEUE</span>
              <p>
                {queued.length
                  ? `${queued.length} saved paper${queued.length === 1 ? "" : "s"}`
                  : "Saved papers"}
              </p>
            </div>
          </div>
          {!queued.length ? (
            <EmptyState title="No saved papers yet" />
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
                      <small>{item.creators?.join(", ") || item.doi || "Saved literature"}</small>
                      {item.manuscriptTitle && (
                        <em className="reading-queue-paper">↳ {item.manuscriptTitle}</em>
                      )}
                    </span>
                    <span className="reading-status">{status}</span>
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
