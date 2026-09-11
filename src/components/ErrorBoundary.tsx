import { Component, type ReactNode } from "react";
import { logClientError } from "../lib/errorLog";

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // A boundary CATCHES the error, so it never reaches window.onerror — the
    // global listener in errorLog.ts cannot see anything that lands here. The
    // previous comment claimed the opposite, which is why client_errors logged
    // nothing for a month of boundary crashes and the only diagnosis available
    // was reading source. Log explicitly.
    console.error("[ErrorBoundary]", error, info);
    void logClientError(error);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback)
      return this.props.fallback(this.state.error, this.reset);
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-brand-cream-light">
        <div className="max-w-md rounded-lg bg-white p-6 shadow">
          <h1 className="mb-2 text-xl font-bold text-brand-ink">
            Something broke
          </h1>
          <p className="mb-4 text-sm text-slate-600">
            {this.state.error.message || "Unknown error"}
          </p>
          <p className="mb-4 font-mono text-xs text-slate-400">
            build {__BUILD_SHA__}
          </p>
          <button
            type="button"
            onClick={this.reset}
            className="rounded bg-brand-navy px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy/90"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
