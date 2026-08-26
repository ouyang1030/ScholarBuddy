"use client";

import { useState } from "react";
import { clampProgress, shortDate } from "../../lib/format";
import { isOpen, statusDefault, type DataProps } from "../../lib/workbench";
import type { RecordItem } from "../../types";
import { EmptyState, MetaPill } from "../primitives";
import { RecordModule } from "./RecordModule";

const OPEN_STATUS = statusDefault("operations");
// A record written before operations had their own vocabulary still carries a
// generic status, so what closes one is read from the shared list rather than
// named here.
const isFinished = (item: RecordItem) => !isOpen({ ...item, status: item.status || OPEN_STATUS });

function sortOperations(operations: RecordItem[]): RecordItem[] {
  return [...operations].sort((a, b) => {
    const aDone = isFinished(a);
    const bDone = isFinished(b);

    // 1. Planned / In progress / Blocked come before Done / Archived
    if (aDone !== bDone) return aDone ? 1 : -1;

    // 2. Both incomplete: order by dueDate ascending (earlier deadlines first)
    if (!aDone && !bDone) {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
    }

    // 3. Fallback: newest first
    return (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || "");
  });
}

function OperationsBoard({
  state,
  openEditor,
  paper,
}: Pick<DataProps, "state" | "openEditor"> & { paper?: RecordItem }) {
  const [typeFilter, setTypeFilter] = useState("");
  // Only the kinds of work actually on the board, so the filter never offers a
  // row that leads to an empty screen.
  const types = [
    ...new Set(state.operations.map((item) => item.type).filter((type) => Boolean(type))),
  ].sort() as string[];
  // Retyping the last operation of a kind hides the filter bar; without this the
  // dropped filter would keep hiding records with no control left to clear it.
  const active = typeFilter && types.includes(typeFilter) ? typeFilter : "";
  const operations = sortOperations(
    active ? state.operations.filter((item) => item.type === active) : state.operations,
  );

  return (
    <>
      <section className="page-intro compact">
        <div>
          <p className="eyebrow">DEADLINES + COMMITMENTS</p>
          <h1>
            PhD <em>operations.</em>
          </h1>
          <p>Track supervision, teaching, ethics, funding, and administrative deadlines.</p>
        </div>
        <button
          className="primary-button"
          onClick={() =>
            openEditor(
              "operations",
              paper
                ? {
                    manuscriptId: paper.id,
                    manuscriptTitle: paper.title,
                    projectId: paper.projectId || "",
                    projectTitle: paper.projectTitle || "",
                  }
                : undefined,
            )
          }
        >
          New operation <b>+</b>
        </button>
      </section>
      {types.length > 1 && (
        <div className="record-filters" aria-label="Filter operations by type">
          <button className={active ? "" : "active"} onClick={() => setTypeFilter("")}>
            All
          </button>
          {types.map((type) => (
            <button
              key={type}
              className={active === type ? "active" : ""}
              onClick={() => setTypeFilter(type)}
            >
              {type}
            </button>
          ))}
        </div>
      )}
      <section className="record-board">
        {!operations.length ? (
          <EmptyState title="No operations yet" />
        ) : (
          operations.map((item) => {
            const isCompleted = isFinished(item);
            const hasProgress =
              !isCompleted && item.progress !== undefined && Number(item.progress) > 0;

            return (
              <article
                className={`record-card card ${isCompleted ? "is-completed" : ""}`}
                key={item.id}
              >
                <div className="record-card-head">
                  <div className="record-card-tags">
                    <span className="object-id">{item.id}</span>
                    <MetaPill
                      tone={
                        isCompleted
                          ? item.status === "Archived"
                            ? "neutral"
                            : "lime"
                          : item.status === "Blocked"
                            ? "orange"
                            : item.status === "Planned"
                              ? "neutral"
                              : "blue"
                      }
                    >
                      {item.status || OPEN_STATUS}
                    </MetaPill>
                  </div>
                  {hasProgress && (
                    <span className="record-card-progress">{clampProgress(item.progress)}%</span>
                  )}
                </div>

                <h2>{item.title}</h2>
                {item.description && <p>{item.description}</p>}

                {(item.type || item.manuscriptTitle || item.projectTitle) && (
                  <div className="record-meta-vertical">
                    {item.type && (
                      <div className="record-meta-item">
                        <span className="meta-tag">Type</span>
                        <strong>{item.type}</strong>
                      </div>
                    )}
                    {item.manuscriptTitle && (
                      <div className="record-meta-item">
                        <span className="meta-tag">Paper</span>
                        <strong title={item.manuscriptTitle}>{item.manuscriptTitle}</strong>
                      </div>
                    )}
                    {item.projectTitle && (
                      <div className="record-meta-item">
                        <span className="meta-tag">Project</span>
                        <strong title={item.projectTitle}>{item.projectTitle}</strong>
                      </div>
                    )}
                  </div>
                )}

                <div className="record-card-footer">
                  <button className="quiet-button" onClick={() => openEditor("operations", item)}>
                    Edit operation
                  </button>
                  {item.dueDate && (
                    <span className="record-due-date">
                      <small>Due</small>
                      <b>{shortDate(item.dueDate)}</b>
                    </span>
                  )}
                </div>
              </article>
            );
          })
        )}
      </section>
    </>
  );
}

export function OperationsModule({
  state,
  openEditor,
  paper,
}: Pick<DataProps, "state" | "openEditor"> & { paper?: RecordItem }) {
  const [tab, setTab] = useState<"operations" | "journal">("operations");
  return (
    <>
      <div className="module-tabs">
        <button
          className={tab === "operations" ? "active" : ""}
          onClick={() => setTab("operations")}
        >
          Operations
        </button>
        <button className={tab === "journal" ? "active" : ""} onClick={() => setTab("journal")}>
          Research log
        </button>
      </div>
      {tab === "operations" ? (
        <OperationsBoard state={state} openEditor={openEditor} paper={paper} />
      ) : (
        <RecordModule
          collection="journal"
          title={
            <>
              Research <em>log.</em>
            </>
          }
          eyebrow="DAILY RECORD"
          description="Every entry captured on Today, newest first. Nothing here is a task — it is what actually happened."
          state={state}
          openEditor={openEditor}
          showProgress={false}
        />
      )}
    </>
  );
}
