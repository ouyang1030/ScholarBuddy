"use client";

import { useState } from "react";
import { clampProgress, shortDate } from "../../lib/format";
import type { DataProps } from "../../lib/workbench";
import type { RecordItem } from "../../types";
import { EmptyState, MetaPill } from "../primitives";
import { RecordModule } from "./RecordModule";

const FINISHED_STATUSES = new Set(["completed", "resolved", "archived"]);

function sortOperations(operations: RecordItem[]): RecordItem[] {
  return [...operations].sort((a, b) => {
    const aStatus = (a.status || "Active").toLowerCase();
    const bStatus = (b.status || "Active").toLowerCase();
    const aDone = FINISHED_STATUSES.has(aStatus);
    const bDone = FINISHED_STATUSES.has(bStatus);

    // 1. Active / In progress / Blocked / Planned come before Completed / Resolved / Archived
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
  const operations = sortOperations(state.operations);

  return (
    <>
      <section className="page-intro compact">
        <div>
          <p className="eyebrow">DEADLINES + COMMITMENTS</p>
          <h1>
            PhD <em>operations.</em>
          </h1>
          <p>Track supervision, meetings, submissions, and administrative deadlines.</p>
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
      <section className="record-board">
        {!operations.length ? (
          <EmptyState title="No operations yet" />
        ) : (
          operations.map((item) => {
            const statusKey = (item.status || "Active").toLowerCase();
            const isCompleted = FINISHED_STATUSES.has(statusKey);
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
                      {item.status || "Active"}
                    </MetaPill>
                  </div>
                  {hasProgress && (
                    <span className="record-card-progress">{clampProgress(item.progress)}%</span>
                  )}
                </div>

                <h2>{item.title}</h2>
                {item.description && <p>{item.description}</p>}

                {(item.manuscriptTitle || item.projectTitle) && (
                  <div className="record-meta-vertical">
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
