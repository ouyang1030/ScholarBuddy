"use client";

import { useEffect } from "react";
import { useT, type Messages } from "../i18n";
import { clampProgress } from "../lib/format";

export type UnsavedWork = keyof Messages["discard"];
export function confirmDiscard(t: Messages, work: UnsavedWork) {
  return window.confirm(t.discard[work]);
}

/**
 * Esc and a click on the backdrop are easy to hit by accident; the close button
 * and Cancel are not. A drawer holding unsaved work asks before the accidental
 * routes discard it, and tells the shell — which owns Esc — that it holds any.
 */
export function useUnsavedWork(
  work: UnsavedWork,
  unsaved: boolean,
  report?: (unsaved: boolean) => void,
) {
  const t = useT();
  useEffect(() => {
    report?.(unsaved);
    return () => report?.(false);
  }, [report, unsaved]);
  return () => !unsaved || confirmDiscard(t, work);
}

export function closeWithTransition(onClose: () => void, backdrop?: Element | null) {
  if (!document.startViewTransition) {
    onClose();
    return;
  }
  // Drawers stack by design (the AI workflow drawer opens Connections without
  // closing itself). A view-transition-name shared by two live elements makes
  // the browser abort the transition, so only the drawer being closed is named.
  const named = backdrop instanceof HTMLElement ? backdrop : null;
  named?.style.setProperty("view-transition-name", "drawer-overlay");
  const transition = document.startViewTransition(onClose);
  // An aborted transition still applies the DOM update, so the drawer closes
  // either way; swallow the rejection instead of surfacing it to the page.
  void transition.ready.catch(() => {});
  void transition.finished
    .catch(() => {})
    .finally(() => named?.style.removeProperty("view-transition-name"));
}

export function DrawerHeader({
  label,
  mark,
  eyebrow,
  title,
  description,
  titleId,
  tone = "mint",
  closeLabel,
  onClose,
}: {
  label: string;
  mark: React.ReactNode;
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  titleId?: string;
  tone?: string;
  /** Defaults to `label`; set it when the eyebrow names the section rather than the drawer. */
  closeLabel?: string;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <>
      <div className="drawer-head">
        <button
          onClick={(event) =>
            closeWithTransition(onClose, event.currentTarget.closest(".drawer-backdrop"))
          }
          aria-label={`${t.common.close} · ${closeLabel || label}`}
        >
          ×
        </button>
        <span className="label">{label}</span>
        <span className={`action-mark ${tone}`} aria-hidden="true">
          {mark}
        </span>
      </div>
      <div className="drawer-title">
        {eyebrow && <span>{eyebrow}</span>}
        <h2 id={titleId}>{title}</h2>
        {description && <p>{description}</p>}
      </div>
    </>
  );
}

/**
 * A WAI-ARIA tablist: arrow keys move between tabs and only the selected tab
 * stays in the Tab sequence, so the group is one stop rather than three.
 */
export function ModuleTabs<Key extends string>({
  label,
  tabs,
  active,
  onSelect,
}: {
  label: string;
  tabs: { key: Key; label: string }[];
  active: Key;
  onSelect: (key: Key) => void;
}) {
  const move = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const index = tabs.findIndex((item) => item.key === active);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    onSelect(tabs[next].key);
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };
  return (
    <div className="module-tabs" role="tablist" aria-label={label} onKeyDown={move}>
      {tabs.map((item) => (
        <button
          key={item.key}
          id={`tab-${item.key}`}
          role="tab"
          aria-selected={item.key === active}
          aria-controls={`tabpanel-${item.key}`}
          tabIndex={item.key === active ? 0 : -1}
          className={item.key === active ? "active" : ""}
          onClick={() => onSelect(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  hideTitle = false,
  description,
  actions,
  compact = false,
}: {
  eyebrow: string;
  title: React.ReactNode;
  /** The eyebrow already names the page; the heading stays for screen readers. */
  hideTitle?: boolean;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section className={`page-header ${compact ? "compact" : ""}`}>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className={hideTitle ? "sr-only" : undefined}>{title}</h1>
        {description && <div className="page-header-description">{description}</div>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </section>
  );
}

export function SettingRow({
  label,
  detail,
  checked,
  disabled,
  featured = false,
  feedback,
  onChange,
}: {
  label: string;
  detail?: string;
  checked: boolean;
  disabled?: boolean;
  featured?: boolean;
  feedback?: React.ReactNode;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`setting-row ${featured ? "featured" : ""}`}>
      <span className="setting-row-copy">
        <strong>{label}</strong>
        {detail && <small>{detail}</small>}
        {feedback}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

export function SaveFeedback({
  state,
  labels,
}: {
  state: "idle" | "saving" | "saved" | "error";
  /** Override when the indicator reports something other than a save. */
  labels?: { saving: string; saved: string; error: string };
}) {
  const t = useT();
  if (state === "idle") return null;
  const copy = labels
    ? labels[state]
    : state === "saving"
      ? t.common.saving
      : state === "saved"
        ? t.common.saved
        : t.common.notSaved;
  return (
    <span className={`save-feedback ${state}`} role={state === "error" ? "alert" : "status"}>
      <i aria-hidden="true">{state === "saved" ? "✓" : state === "error" ? "!" : ""}</i>
      {copy}
    </span>
  );
}

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
