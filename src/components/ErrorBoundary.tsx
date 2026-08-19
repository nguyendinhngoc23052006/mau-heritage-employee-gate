import { Component, type ReactNode } from "react";

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
    // errorLog already listens on window.error; log here too in case a boundary
    // caught something before it bubbled to window.
    console.error("[ErrorBoundary]", error, info);
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
