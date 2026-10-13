"use client";

import { useState } from "react";
import { useLocale, useT, valueLabel, type Messages } from "../../i18n";
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

function deadlineState(t: Messages, dueDate?: string) {
  if (!dueDate) return { label: t.operations.noDeadline, tone: "neutral", days: null };
  const [year, month, day] = dueDate.split("-").map(Number);
  const today = new Date();
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const target = Date.UTC(year, month - 1, day);
  const days = Math.round((target - start) / 86_400_000);
  // Records are hand-editable Markdown, so a malformed date reads as no deadline
  // rather than "NaNd left" — the same call the bridge makes when it validates.
  if (!Number.isFinite(days))
    return { label: t.operations.noDeadline, tone: "neutral", days: null };
  if (days < 0) return { label: t.operations.overdue(Math.abs(days)), tone: "overdue", days };
  if (days === 0) return { label: t.operations.dueToday, tone: "overdue", days };
  if (days <= 7) return { label: t.operations.left(days), tone: "urgent", days };
  if (days <= 30) return { label: t.operations.left(days), tone: "soon", days };
  return { label: t.operations.left(days), tone: "neutral", days };
}

function OperationsBoard({
  state,
  openEditor,
  paper,
}: Pick<DataProps, "state" | "openEditor"> & { paper?: RecordItem }) {
  const t = useT();
  const { locale } = useLocale();
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
        eyebrow={t.operations.eyebrow}
        title={t.nav.operations}
        hideTitle
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
            {t.operations.new} <b>+</b>
          </button>
        }
      />
      {types.length > 1 && (
        <div className="record-filters" aria-label={t.operations.filter}>
          <button className={active ? "" : "active"} onClick={() => setTypeFilter("")}>
            {t.operations.all}
          </button>
          {types.map((type) => (
            <button
              key={type}
              className={active === type ? "active" : ""}
              onClick={() => setTypeFilter(type)}
            >
              {valueLabel(t.values.operationType, type)}
            </button>
          ))}
        </div>
      )}
      <section className="record-board operations-board">
        {!operations.length ? (
          <EmptyState title={t.operations.none} />
        ) : (
          operations.map((item) => {
            const isCompleted = isFinished(item);
            const hasProgress = !isCompleted && item.progress !== undefined;
            const deadline = deadlineState(t, item.dueDate);

            return (
              <article
                className={`record-card operation-card card ${isCompleted ? "is-completed" : ""}`}
                key={item.id}
              >
                <div className="operation-main">
                  <span className="object-id">
                    {item.type ? valueLabel(t.values.operationType, item.type) : item.id}
                  </span>
                  <h2>{item.title}</h2>
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
                      {valueLabel(t.values.status, item.status || OPEN_STATUS)}
                    </MetaPill>
                    {hasProgress && (
                      <span className="record-card-progress">{clampProgress(item.progress)}%</span>
                    )}
                  </div>
                </div>

                <div className={`operation-deadline ${isCompleted ? "complete" : deadline.tone}`}>
                  <span>
                    {item.dueDate ? shortDate(item.dueDate, locale) : t.operations.notScheduled}
                  </span>
                  <strong>{isCompleted ? t.operations.completed : deadline.label}</strong>
                </div>

                <div className="record-card-footer">
                  <button className="quiet-button" onClick={() => openEditor("operations", item)}>
                    {t.operations.edit}
                  </button>
                </div>

                {(item.description || item.manuscriptTitle || item.projectTitle) && (
                  <details className="operation-details">
                    <summary>{t.operations.details}</summary>
                    {item.description && <p>{item.description}</p>}
                    {item.manuscriptTitle && (
                      <div className="record-meta-item">
                        <span className="meta-tag">{t.operations.paper}</span>
                        <strong title={item.manuscriptTitle}>{item.manuscriptTitle}</strong>
                      </div>
                    )}
                    {item.projectTitle && (
                      <div className="record-meta-item">
                        <span className="meta-tag">{t.operations.project}</span>
                        <strong title={item.projectTitle}>{item.projectTitle}</strong>
                      </div>
                    )}
                  </details>
                )}
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
  const t = useT();
  const [tab, setTab] = useState<"operations" | "journal">("operations");
  return (
    <>
      <ModuleTabs
        label={t.operations.views}
        active={tab}
        onSelect={setTab}
        tabs={[
          { key: "operations", label: t.operations.tabOperations },
          { key: "journal", label: t.operations.tabLog },
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
                {t.operations.logLead}
                <em>{t.operations.logEm}</em>
              </>
            }
            eyebrow={t.operations.logEyebrow}
            state={state}
            openEditor={openEditor}
            showProgress={false}
          />
        )}
      </div>
    </>
  );
}
