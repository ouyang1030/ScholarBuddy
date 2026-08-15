"use client";

import { useState } from "react";
import { clampProgress, daysSince } from "../../lib/format";
import type { RecordItem, WorkbenchState } from "../../types";

/* ------------------------------------------------------------------ */
/*  Pipeline stage mapping                                             */
/* ------------------------------------------------------------------ */

const PIPELINE_STAGES = [
  "Concept",
  "Developing",
  "Submitted",
  "Under Review",
  "Accepted",
  "Published",
] as const;

type PipelineStage = (typeof PIPELINE_STAGES)[number];

const STAGE_MAP: Record<string, PipelineStage> = {
  Concept: "Concept",
  Developing: "Developing",
  "Internal review": "Developing",
  "Ready to submit": "Submitted",
  Submitted: "Submitted",
  Revision: "Under Review",
  Accepted: "Accepted",
  "Accepted / published": "Accepted",
  Published: "Published",
};

const STAGE_COLORS: Record<PipelineStage, string> = {
  Concept: "#8b9690",
  Developing: "hsl(215 60% 58%)",
  Submitted: "hsl(38 85% 55%)",
  "Under Review": "hsl(25 85% 55%)",
  Accepted: "hsl(152 55% 48%)",
  Published: "hsl(160 65% 42%)",
};

const STAGE_ICONS: Record<PipelineStage, string> = {
  Concept: "◇",
  Developing: "✎",
  Submitted: "↗",
  "Under Review": "◷",
  Accepted: "✓",
  Published: "★",
};

/* ------------------------------------------------------------------ */
/*  Data helpers                                                       */
/* ------------------------------------------------------------------ */

type PipelineRow = {
  stage: PipelineStage;
  count: number;
  manuscripts: RecordItem[];
};

function stageOf(manuscript: RecordItem): PipelineStage {
  return STAGE_MAP[manuscript.stage || manuscript.status || "Concept"] || "Concept";
}

function computePipeline(manuscripts: RecordItem[]): PipelineRow[] {
  const buckets: Record<PipelineStage, RecordItem[]> = {
    Concept: [],
    Developing: [],
    Submitted: [],
    "Under Review": [],
    Accepted: [],
    Published: [],
  };

  for (const ms of manuscripts) buckets[stageOf(ms)].push(ms);

  return PIPELINE_STAGES.map((stage) => ({
    stage,
    count: buckets[stage].length,
    manuscripts: buckets[stage],
  }));
}

function computeKpis(manuscripts: RecordItem[], attempts: RecordItem[]) {
  const terminal = ["Accepted", "Published", "Rejected", "Withdrawn"];
  const active = manuscripts.filter(
    (ms) => !["Published", "Accepted"].includes(stageOf(ms)),
  ).length;

  // Acceptance rate: (Accepted + Published) / total submission-attempts
  const totalAttempts = attempts.length;
  const successAttempts = attempts.filter((a) =>
    ["Accepted", "Published"].includes(a.status || ""),
  ).length;
  const acceptanceRate =
    totalAttempts > 0 ? Math.round((successAttempts / totalAttempts) * 100) : null;

  // Longest wait: active (non-terminal) submission-attempts
  let longestWait = 0;
  let longestAttempt: RecordItem | null = null;
  for (const a of attempts) {
    if (terminal.includes(a.status || "")) continue;
    const days = daysSince(a.stageStartedAt || a.submittedAt);
    if (days > longestWait) {
      longestWait = days;
      longestAttempt = a;
    }
  }

  return { active, acceptanceRate, longestWait, longestAttempt };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ManuscriptSummary({
  state,
  onSelectPaper,
}: {
  state: WorkbenchState;
  onSelectPaper: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<PipelineStage | null>(null);
  const pipeline = computePipeline(state.manuscripts);
  const kpis = computeKpis(state.manuscripts, state["submission-attempts"]);
  const total = state.manuscripts.length;
  const maxCount = Math.max(...pipeline.map((r) => r.count), 1);

  return (
    <section className="manuscript-summary">
      {/* KPI cards */}
      <div className="summary-kpis">
        <article className="summary-kpi card">
          <small>Active papers</small>
          <strong>{kpis.active}</strong>
        </article>
        <article className="summary-kpi card">
          <small>Acceptance rate</small>
          <strong>{kpis.acceptanceRate !== null ? `${kpis.acceptanceRate}%` : "—"}</strong>
        </article>
        <article className="summary-kpi card">
          <small>Longest wait</small>
          <strong>{kpis.longestWait > 0 ? `${kpis.longestWait}d` : "—"}</strong>
          {kpis.longestAttempt && (
            <span>{kpis.longestAttempt.journal || kpis.longestAttempt.title}</span>
          )}
        </article>
      </div>

      {/* Funnel */}
      <article className="summary-pipeline card">
        <div className="section-heading">
          <div>
            <span className="label">MANUSCRIPT PIPELINE</span>
            <p>
              {total} paper{total === 1 ? "" : "s"} across all stages
            </p>
          </div>
        </div>
        <div className="pipeline-funnel">
          {pipeline.map((row) => {
            const fillPct = maxCount > 0 ? (row.count / maxCount) * 100 : 0;
            const isExpanded = expanded === row.stage;
            return (
              <div key={row.stage} className="funnel-row-wrap">
                <button
                  className={`funnel-bar ${isExpanded ? "expanded" : ""} ${row.count === 0 ? "empty" : ""}`}
                  style={
                    {
                      "--bar-color": STAGE_COLORS[row.stage],
                      "--bar-fill": `${fillPct}%`,
                    } as React.CSSProperties
                  }
                  onClick={() => row.count > 0 && setExpanded(isExpanded ? null : row.stage)}
                  aria-expanded={isExpanded}
                >
                  <span className="funnel-accent" />
                  <span className="funnel-icon">{STAGE_ICONS[row.stage]}</span>
                  <span className="funnel-label">{row.stage}</span>
                  <span className="funnel-count">{row.count}</span>
                  {row.count > 0 && (
                    <span className="funnel-chevron">{isExpanded ? "▾" : "▸"}</span>
                  )}
                  <span className="funnel-fill" />
                </button>
                {isExpanded && row.count > 0 && (
                  <div className="funnel-detail">
                    {row.manuscripts.map((ms) => (
                      <button
                        key={ms.id}
                        className="funnel-detail-item"
                        onClick={() => onSelectPaper(ms.id)}
                      >
                        <span className="funnel-detail-left">
                          <span className="funnel-detail-id">{ms.id}</span>
                          <strong>{ms.title}</strong>
                          <small>
                            {ms.journal ? `${ms.journal} · ` : ""}
                            {(ms.wordCount || 0).toLocaleString()} /{" "}
                            {(ms.targetWords || 0).toLocaleString()} words
                          </small>
                        </span>
                        <span className="funnel-detail-right">
                          <span className="funnel-detail-progress">
                            <span
                              className="funnel-detail-progress-fill"
                              style={{ width: `${clampProgress(ms.progress)}%` }}
                            />
                          </span>
                          <small>{clampProgress(ms.progress)}%</small>
                        </span>
                        <span className="funnel-detail-arrow">→</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </article>
    </section>
  );
}
