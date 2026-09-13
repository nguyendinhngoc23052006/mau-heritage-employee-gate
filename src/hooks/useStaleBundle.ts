import { useEffect, useState } from "react";

const MIN_GAP_MS = 60_000;
const POLL_MS = 5 * 60_000;

// Module scope, not component state: the throttle has to survive Layout
// remounting, or every remount would refetch.
let lastCheckedAt = 0;

// True once the deployed build is known to differ from the one this tab is
// running.
//
// A tab keeps running the bundle it loaded, forever. That is how a shipped fix
// can look un-shipped — the page still throws a bug that `main` no longer
// contains, and only a hard reload picks up the fix.
//
// Two triggers, because they cover different people: `visibilitychange` catches
// a phone tab reopened hours later, and the poll catches a desktop tab that a
// manager leaves open and focused all day, which would otherwise be checked
// exactly once, at mount, and never again.
export function useStaleBundle(): boolean {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (stale) return;
    let cancelled = false;

    const check = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastCheckedAt < MIN_GAP_MS) return;
      lastCheckedAt = now;

      fetch("/version.json", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((body: { build?: string } | null) => {
          if (!cancelled && body?.build && body.build !== __BUILD_SHA__) {
            setStale(true);
          }
        })
        // Offline, or the dev server answering with index.html. Either way
        // there is nothing to tell the user.
        .catch(() => {});
    };

    check();
    document.addEventListener("visibilitychange", check);
    const poll = setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(poll);
      document.removeEventListener("visibilitychange", check);
    };
  }, [stale]);

  return stale;
}
