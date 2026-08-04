import { Component, type ErrorInfo, type ReactNode } from "react";
import { NEXUS_NAME } from "@/components/brand/NexusLogo";

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Catch render failures — offer reload without white screen. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[nexus] ErrorBoundary", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-4 bg-[var(--bg-deepest)] px-6 text-center text-[var(--text-primary)]">
          <p className="text-[15px] font-medium">{NEXUS_NAME} hit a display error</p>
          <p className="max-w-md text-[13px] text-[var(--text-muted)]">
            Your vault files on disk are safe. Reload the app to continue.
          </p>
          <p className="max-w-lg font-mono text-[11px] text-[var(--danger)]">
            {this.state.error.message}
          </p>
          <button
            type="button"
            className="primary-btn"
            onClick={() => {
              this.setState({ error: null });
              try {
                window.location.reload();
              } catch {
                /* ignore */
              }
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
