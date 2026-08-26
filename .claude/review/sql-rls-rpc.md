# sql-rls-rpc — payroll correctness PR

Verdict: **PASS — no SQL, RLS or RPC surface touched.**

- No migration file. No policy, function, grant or table change.
- Query-shape changes only, all within existing RLS:
  - `memberships_public` — dropped `.eq("active", true)`; the view already exposes
    `active` and `hourly_rate_cents` (verified against the live schema). Reading
    inactive members of a store the caller belongs to is already permitted by the
    view's policy; no new rows become reachable.
  - `clock_events` — fetch window widened ±24h. Same store scope, same policy.
  - `rate_history` — added `.lte("effective_from", to)`, strictly narrowing.
  - `prize_fine_events` — `listStorePrizeFine` gained `from`/`to`, strictly narrowing.
  - `shifts` — `.is("deleted_at", null)` moved server-side, strictly narrowing.
  - `memberships` — ordering moved server-side; no change to row visibility.
- Multi-tenancy intact: every touched query still keys off `store_id`.
- No client-side authorization decisions added; nothing trusts the client.
