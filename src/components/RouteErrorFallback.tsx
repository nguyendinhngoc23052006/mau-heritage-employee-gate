import { useEffect, useRef } from "react";
import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { logClientError } from "../lib/errorLog";

export function RouteErrorFallback() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "Unknown error";

  // This component is react-router's errorElement, so it — not ErrorBoundary —
  // is what actually catches a render crash inside a route. It logged nothing
  // for a month, which is why client_errors held no record of the People and
  // Payroll crashes and the only available diagnosis was reading source.
  const logged = useRef(false);
  useEffect(() => {
    // Once per mount, not once per render. useRouteError() is not guaranteed to
    // return a referentially stable value, and StrictMode runs effects twice in
    // dev — without this guard a render loop writes a DB row per frame.
    if (logged.current) return;
    logged.current = true;
    void logClientError(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-brand-cream-light">
      <div className="max-w-md rounded-lg bg-white p-6 shadow">
        <h1 className="mb-2 text-xl font-bold text-brand-ink">
          Something broke
        </h1>
        <p className="mb-4 text-sm text-slate-600">{message}</p>
        <p className="mb-4 font-mono text-xs text-slate-400">
          build {__BUILD_SHA__}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded bg-brand-navy px-4 py-2 text-sm font-medium text-white hover:bg-brand-navy/90"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
