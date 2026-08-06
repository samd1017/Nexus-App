import { Component, type ErrorInfo, type ReactNode } from "react";
import { NEXUS_NAME } from "@/components/brand/NexusLogo";

type Props = {
  children: ReactNode;
  /**
   * "app" — full-screen reload fallback (default, wraps AppShell).
   * "panel" — compact recoverable fallback (Retry only; does not kill the shell).
   */
  variant?: "app" | "panel";
  /** Shown in panel fallback title */
  label?: string;
  /**
   * When any value changes, clear the error so the child can remount
   * (e.g. vaultId, rightTab, mode).
   */
  resetKeys?: ReadonlyArray<unknown>;
};

type State = { error: Error | null };

/** Catch render failures — app variant reloads; panel variant is recoverable. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[nexus] ErrorBoundary", error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props): void {
    if (!this.state.error || !this.props.resetKeys) return;
    const prev = prevProps.resetKeys ?? [];
    const next = this.props.resetKeys;
    if (
      prev.length !== next.length ||
      prev.some((k, i) => !Object.is(k, next[i]))
    ) {
      this.setState({ error: null });
    }
  }

  private retry = (): void => {
    this.setState({ error: null });
  };

  private reload = (): void => {
    this.setState({ error: null });
    try {
      window.location.reload();
    } catch {
      /* ignore */
    }
  };

  render() {
    if (this.state.error) {
      const variant = this.props.variant ?? "app";
      if (variant === "panel") {
        const label = this.props.label ?? "This panel";
        return (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 bg-[var(--bg-deepest)] px-4 py-6 text-center text-[var(--text-primary)]">
            <p className="text-[13px] font-medium">{label} hit a display error</p>
            <p className="max-w-sm text-[12px] text-[var(--text-muted)]">
              The rest of the app is still running. Your vault files are safe.
            </p>
            <p className="max-w-sm break-words font-mono text-[10px] text-[var(--danger)]">
              {this.state.error.message}
            </p>
            <button type="button" className="primary-btn" onClick={this.retry}>
              Retry
            </button>
          </div>
        );
      }

      return (
        <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-4 bg-[var(--bg-deepest)] px-6 text-center text-[var(--text-primary)]">
          <p className="text-[15px] font-medium">
            {NEXUS_NAME} hit a display error
          </p>
          <p className="max-w-md text-[13px] text-[var(--text-muted)]">
            Your vault files on disk are safe. Reload the app to continue.
          </p>
          <p className="max-w-lg font-mono text-[11px] text-[var(--danger)]">
            {this.state.error.message}
          </p>
          <button type="button" className="primary-btn" onClick={this.reload}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
