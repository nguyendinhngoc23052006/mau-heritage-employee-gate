import { getSupabase } from "./supabaseClient";

// Best-effort: log unhandled errors to client_errors. Never throws.
export async function logClientError(
  err: unknown,
  url?: string,
): Promise<void> {
  try {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getUser();
    // Cap both fields. A stack can run to tens of KB, and this table had no
    // writer at all until now — turning logging on without a bound is how a
    // 500 MB Free-tier project fills up during one crash loop.
    const cap = (v: string, max: number) =>
      v.length > max ? `${v.slice(0, max)}… [truncated]` : v;
    const message = cap(err instanceof Error ? err.message : String(err), 500);
    const rawStack = err instanceof Error ? (err.stack ?? null) : null;
    // Prefix the build SHA: a stack trace is only actionable if you know which
    // bundle produced it. Without this, a fixed bug and a stale deploy look
    // exactly alike in the logs.
    const stack = cap(
      `build ${__BUILD_SHA__}\n${rawStack ?? "(no stack)"}`,
      4000,
    );
    await supabase.from("client_errors").insert({
      user_id: data.user?.id ?? null,
      // origin + pathname ONLY. Supabase's password-recovery link lands with
      // access_token and refresh_token in the URL fragment, so logging href
      // would persist live credentials into client_errors. The route is the
      // diagnostic value; the query and hash are not.
      url: url ?? `${window.location.origin}${window.location.pathname}`,
      message,
      stack,
      ua: navigator.userAgent,
    });
  } catch (logErr) {
    console.error("[errorLog] failed to log client error", logErr, err);
  }
}

export function installGlobalErrorLogging(): void {
  window.addEventListener("error", (ev) => {
    void logClientError(ev.error ?? ev.message);
  });
  window.addEventListener("unhandledrejection", (ev) => {
    void logClientError(ev.reason);
  });
}
