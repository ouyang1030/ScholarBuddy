"use client";

import { clampProgress } from "../lib/format";

export function ProgressRing({ value }: { value: number }) {
  const normalized = clampProgress(value);
  return (
    <div
      className="progress-ring"
      style={{ "--progress": `${normalized * 3.6}deg` } as React.CSSProperties}
    >
      <div>
        <strong>{normalized}</strong>
        <span>%</span>
      </div>
    </div>
  );
}
export function SourceDot({ tone = "green" }: { tone?: string }) {
  return <span className={`source-dot ${tone}`} aria-hidden="true" />;
}
export function EmptyState({
  title,
  detail,
  action,
  onAction,
}: {
  title: string;
  detail?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="real-empty">
      <span>◇</span>
      <div>
        <strong>{title}</strong>
        {detail && <p>{detail}</p>}
      </div>
      {action && onAction && <button onClick={onAction}>{action} →</button>}
    </div>
  );
}
export function MetaPill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <span className={`status-pill ${tone}`}>
      <i />
      {children}
    </span>
  );
}
