"use client";

import { Component, type ReactNode } from "react";

type Props = { label: string; children: ReactNode };
type State = { failed: boolean };

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
      <article className="card panel-boundary" role="alert">
        <span aria-hidden="true">!</span>
        <div>
          <strong>{this.props.label} could not be displayed</strong>
          <p>
            The rest of the workbench keeps working. Retry once the underlying record or source
            looks right.
          </p>
        </div>
        <button onClick={() => this.setState({ failed: false })}>Retry panel</button>
      </article>
    );
  }
}
