import { getSupabase } from "./supabaseClient";

// Best-effort: log unhandled errors to client_errors. Never throws.
export async function logClientError(
  err: unknown,
  url?: string,
): Promise<void> {
  try {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getUser();
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? (err.stack ?? null) : null;
    await supabase.from("client_errors").insert({
      user_id: data.user?.id ?? null,
      url: url ?? window.location.href,
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
