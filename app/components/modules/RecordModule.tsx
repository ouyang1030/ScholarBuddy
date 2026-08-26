"use client";

import { clampProgress, shortDate } from "../../lib/format";
import { collectionLabels, isOpen } from "../../lib/workbench";
import type { CollectionKey, RecordItem, WorkbenchState } from "../../types";
import { EmptyState, MetaPill } from "../primitives";

export function RecordModule({
  collection,
  title,
  eyebrow,
  description,
  state,
  openEditor,
  // A log entry and an idea have no percentage to report; showing an inert 0%
  // bar on every card would only make them look unfinished.
  showProgress = true,
}: {
  collection: CollectionKey;
  title: React.ReactNode;
  eyebrow: string;
  description: string;
  state: WorkbenchState;
  openEditor: (collection: CollectionKey, record?: Partial<RecordItem>) => void;
  showProgress?: boolean;
}) {
  const records = state[collection];
  return (
    <>
      <section className="page-intro compact">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <button className="primary-button" onClick={() => openEditor(collection)}>
          New {collectionLabels[collection]} <b>+</b>
        </button>
      </section>
      <section className="record-board">
        {!records.length ? (
          <EmptyState title={`No ${collectionLabels[collection].toLowerCase()} yet`} />
        ) : (
          records.map((item) => (
            <article className="record-card card" key={item.id}>
              <div>
                <span className="object-id">{item.id}</span>
                {/* A log entry deliberately has no status; an empty pill reading
                    "Unspecified" would invent one. */}
                {(item.status || collection !== "journal") && (
                  <MetaPill
                    tone={
                      // Read from the shared list rather than named here, so a
                      // collection that gains a finished state does not keep
                      // drawing it as work still in flight.
                      item.status === "Dropped"
                        ? "neutral"
                        : item.status === "Promoted" || (item.status && !isOpen(item))
                          ? "lime"
                          : item.status === "Blocked"
                            ? "orange"
                            : "blue"
                    }
                  >
                    {item.status || "Unspecified"}
                  </MetaPill>
                )}
              </div>
              <h2>{item.title}</h2>
              {item.description && <p>{item.description}</p>}
              <div className="record-meta">
                {item.manuscriptTitle && (
                  <span>
                    Paper <b>{item.manuscriptTitle}</b>
                  </span>
                )}
                {item.projectTitle && (
                  <span>
                    Project <b>{item.projectTitle}</b>
                  </span>
                )}
                {item.phase && (
                  <span>
                    Phase <b>{item.phase}</b>
                  </span>
                )}
                {item.method && (
                  <span>
                    Method <b>{item.method}</b>
                  </span>
                )}
                {item.journal && (
                  <span>
                    Journal <b>{item.journal}</b>
                  </span>
                )}
                {item.type && (
                  <span>
                    Type <b>{item.type}</b>
                  </span>
                )}
                {item.dueDate && (
                  <span>
                    Due <b>{item.dueDate}</b>
                  </span>
                )}
                {item.entryDate && (
                  <span>
                    Logged <b>{shortDate(item.entryDate)}</b>
                  </span>
                )}
                {item.promotedTo && (
                  <span>
                    Promoted to <b>{item.promotedTo}</b>
                  </span>
                )}
              </div>
              {showProgress && (
                <div className="manual-progress">
                  <span>Manual progress</span>
                  <b>{clampProgress(item.progress)}%</b>
                  <i>
                    <em style={{ width: `${clampProgress(item.progress)}%` }} />
                  </i>
                </div>
              )}
              <button className="quiet-button" onClick={() => openEditor(collection, item)}>
                Edit record
              </button>
            </article>
          ))
        )}
      </section>
    </>
  );
}
