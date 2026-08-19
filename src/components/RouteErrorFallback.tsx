import { isRouteErrorResponse, useRouteError } from "react-router-dom";

export function RouteErrorFallback() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "Unknown error";

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-brand-cream-light">
      <div className="max-w-md rounded-lg bg-white p-6 shadow">
        <h1 className="mb-2 text-xl font-bold text-brand-ink">
          Something broke
        </h1>
        <p className="mb-4 text-sm text-slate-600">{message}</p>
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
