"use client";

import { Component, type ReactNode } from "react";
import { useT } from "../i18n";

type Props = { label: string; children: ReactNode };
type State = { failed: boolean };

function PanelFailure({ label, onRetry }: { label: string; onRetry: () => void }) {
  const t = useT();
  return (
    <article className="card panel-boundary" role="alert">
      <span aria-hidden="true">!</span>
      <div>
        <strong>{t.shell.panelFailed(label)}</strong>
      </div>
      <button onClick={onRetry}>{t.shell.retryPanel}</button>
    </article>
  );
}

/**
 * A failing panel must not take the whole workbench down: Today's local focus
 * and task tools stay usable even when a live source renders something invalid.
 */
export class PanelBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`ScholarBuddy panel failed: ${this.props.label}`, error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <PanelFailure label={this.props.label} onRetry={() => this.setState({ failed: false })} />
    );
  }
}
