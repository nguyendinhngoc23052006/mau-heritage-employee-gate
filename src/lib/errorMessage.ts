// Extract a human-readable message from anything the app might throw or
// receive as an error. Supabase's PostgrestError isn't a JS Error instance,
// so the common `err instanceof Error ? err.message : fallback` pattern
// swallows its .message and shows the fallback. This handles both.
export function errorMessage(
  err: unknown,
  fallback = "Something went wrong",
): string {
  if (!err) return fallback;
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    const anyErr = err as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };
    const parts: string[] = [];
    if (typeof anyErr.message === "string") parts.push(anyErr.message);
    if (typeof anyErr.details === "string" && anyErr.details)
      parts.push(anyErr.details);
    if (typeof anyErr.hint === "string" && anyErr.hint)
      parts.push(`(${anyErr.hint})`);
    if (typeof anyErr.code === "string" && anyErr.code)
      parts.push(`[${anyErr.code}]`);
    if (parts.length > 0) return parts.join(" ");
  }
  return fallback;
}
