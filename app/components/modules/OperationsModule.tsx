"use client";

import { useState } from "react";
import { clampProgress, shortDate } from "../../lib/format";
import { isOpen, statusDefault, type DataProps } from "../../lib/workbench";
import type { RecordItem } from "../../types";
import { EmptyState, MetaPill, ModuleTabs, PageHeader } from "../primitives";
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

function deadlineState(dueDate?: string) {
  if (!dueDate) return { label: "No deadline", tone: "neutral", days: null };
  const [year, month, day] = dueDate.split("-").map(Number);
  const today = new Date();
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const target = Date.UTC(year, month - 1, day);
  const days = Math.round((target - start) / 86_400_000);
  // Records are hand-editable Markdown, so a malformed date reads as no deadline
  // rather than "NaNd left" — the same call the bridge makes when it validates.
  if (!Number.isFinite(days)) return { label: "No deadline", tone: "neutral", days: null };
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, tone: "overdue", days };
  if (days === 0) return { label: "Due today", tone: "overdue", days };
  if (days <= 7) return { label: `${days}d left`, tone: "urgent", days };
  if (days <= 30) return { label: `${days}d left`, tone: "soon", days };
  return { label: `${days}d left`, tone: "neutral", days };
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
      <PageHeader
        eyebrow="DEADLINES + COMMITMENTS"
        title={
          <>
            PhD <em>operations.</em>
          </>
        }
        description="Supervision, teaching, ethics, funding, and administration — ordered by deadline."
        compact
        actions={
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
        }
      />
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
      <section className="record-board operations-board">
        {!operations.length ? (
          <EmptyState title="No operations yet" />
        ) : (
          operations.map((item) => {
            const isCompleted = isFinished(item);
            const hasProgress =
              !isCompleted && item.progress !== undefined && Number(item.progress) > 0;
            const deadline = deadlineState(item.dueDate);

            return (
              <article
                className={`record-card operation-card card ${isCompleted ? "is-completed" : ""}`}
                key={item.id}
              >
                <div className="operation-main">
                  <span className="object-id">{item.type || item.id}</span>
                  <h2>{item.title}</h2>
                  <div className={`operation-deadline ${isCompleted ? "complete" : deadline.tone}`}>
                    <span>{item.dueDate ? shortDate(item.dueDate) : "Not scheduled"}</span>
                    <strong>{isCompleted ? "Completed" : deadline.label}</strong>
                  </div>
                </div>

                <div className="operation-status">
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
                  {hasProgress && (
                    <span className="record-card-progress">{clampProgress(item.progress)}%</span>
                  )}
                </div>

                {(item.description || item.manuscriptTitle || item.projectTitle) && (
                  <details className="operation-details">
                    <summary>Details</summary>
                    {item.description && <p>{item.description}</p>}
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
                  </details>
                )}

                <div className="record-card-footer">
                  <button className="quiet-button" onClick={() => openEditor("operations", item)}>
                    Edit operation
                  </button>
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
      <ModuleTabs
        label="PhD Operations views"
        active={tab}
        onSelect={setTab}
        tabs={[
          { key: "operations", label: "Operations" },
          { key: "journal", label: "Research log" },
        ]}
      />
      <div role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`}>
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
      </div>
    </>
  );
}
