"use client";

import { useLocale, useT, valueLabel } from "../../i18n";
import { clampProgress, shortDate } from "../../lib/format";
import { isOpen } from "../../lib/workbench";
import type { CollectionKey, RecordItem, WorkbenchState } from "../../types";
import { EmptyState, MetaPill } from "../primitives";

export function RecordModule({
  collection,
  title,
  eyebrow,
  state,
  openEditor,
  // A log entry and an idea have no percentage to report; showing an inert 0%
  // bar on every card would only make them look unfinished.
  showProgress = true,
}: {
  collection: CollectionKey;
  title: React.ReactNode;
  eyebrow: string;
  state: WorkbenchState;
  openEditor: (collection: CollectionKey, record?: Partial<RecordItem>) => void;
  showProgress?: boolean;
}) {
  const t = useT();
  const { locale } = useLocale();
  const label = t.collections[collection];
  const records = state[collection];
  return (
    <>
      <section className="page-intro compact">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
        </div>
        <button className="primary-button" onClick={() => openEditor(collection)}>
          {t.records.new(label)} <b>+</b>
        </button>
      </section>
      <section className="record-board">
        {!records.length ? (
          <EmptyState title={t.records.none(label)} />
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
                    {item.status ? valueLabel(t.values.status, item.status) : t.records.unspecified}
                  </MetaPill>
                )}
              </div>
              <h2>{item.title}</h2>
              {item.description && <p>{item.description}</p>}
              <div className="record-meta">
                {item.manuscriptTitle && (
                  <span>
                    {t.records.paper} <b>{item.manuscriptTitle}</b>
                  </span>
                )}
                {item.projectTitle && (
                  <span>
                    {t.records.project} <b>{item.projectTitle}</b>
                  </span>
                )}
                {item.phase && (
                  <span>
                    {t.records.phase} <b>{item.phase}</b>
                  </span>
                )}
                {item.method && (
                  <span>
                    {t.records.method} <b>{item.method}</b>
                  </span>
                )}
                {item.journal && (
                  <span>
                    {t.records.journal} <b>{item.journal}</b>
                  </span>
                )}
                {item.type && (
                  <span>
                    {t.records.type} <b>{valueLabel(t.values.operationType, item.type)}</b>
                  </span>
                )}
                {item.dueDate && (
                  <span>
                    {t.records.due} <b>{shortDate(item.dueDate, locale)}</b>
                  </span>
                )}
                {item.entryDate && (
                  <span>
                    {t.records.logged} <b>{shortDate(item.entryDate, locale)}</b>
                  </span>
                )}
                {item.promotedTo && (
                  <span>
                    {t.records.promotedTo} <b>{item.promotedTo}</b>
                  </span>
                )}
              </div>
              {showProgress && (
                <div className="manual-progress">
                  <span>{t.records.progress}</span>
                  <b>{clampProgress(item.progress)}%</b>
                  <i>
                    <em style={{ width: `${clampProgress(item.progress)}%` }} />
                  </i>
                </div>
              )}
              <button className="quiet-button" onClick={() => openEditor(collection, item)}>
                {t.records.edit}
              </button>
            </article>
          ))
        )}
      </section>
    </>
  );
}
