import { Component, type ReactNode } from "react";

import { reportClientError } from "@/lib/clientErrors";

/** Wraps one dashboard widget so that if it fails to draw, only that widget shows a small notice and the rest of the
 * dashboard (and the app) carries on. The failure is reported like any other client error. */
export class SafeSection extends Component<{ children: ReactNode; label: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    reportClientError({ kind: "render", message: `Dashboard section "${this.props.label}": ${error.message}`, stack: error.stack });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] p-4 text-sm text-[var(--color-text-muted)]">
        <p className="font-medium text-[var(--color-text)]">{this.props.label} couldn&apos;t be shown.</p>
      </div>
    );
  }
}
