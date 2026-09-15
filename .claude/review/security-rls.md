# DB-security review — legacy purge + org_chart RPC (20260915133000)
Verdict: **no blockers.** One SUSPECTED item removed by hardening.

- **Purge cascade — OK.** Every FK from a store-child to `stores`, and every
  composite `(user_id, store_id) → memberships`, is `on delete cascade` (agent
  enumerated all 15+ tables with baseline line refs). `client_errors` has no
  store_id and is deleted by its own statement. `stores.sector_id → sectors` is
  `on delete restrict` (reverse direction) — deleting stores never touches
  sectors. Dry-run confirmed: 2 Kwook units, 0 legacy, 0 memberships, 0 audit,
  0 shifts, 4 sectors intact.
- **write_audit during cascade — OK.** The 20260915090000 version (applies
  before this file, 090000 < 133000) carries the `not exists (select 1 from
  stores where id = v_store)` guard, so cascaded audit rows don't hit the FK/NULL
  bugs.
- **Bypass flag — REMOVED.** The reviewer flagged a session-wide
  `set_config('app.set_role','1',false)` that could leak if a delete threw before
  the reset. It was redundant: the runner has no JWT, so `guard_role_write`'s
  DELETE branch (`auth.uid() is null → return old`) already allows the cascade,
  and `client_errors` has no guard. Removed entirely; re-dry-run passes.
- **org_chart exposure — OK.** Both functions select only id, display_name, and
  the global_role label at tier 1. No pay/PII/contact column. `org_chart()` is
  granted to `authenticated`; `org_chart_unit` is revoked from public and never
  granted (reachable only internally under the definer). anon cannot call.
- **Idempotency — OK.** Deletes no-op on replay; `create or replace` ×2 and
  revoke/grant idempotent.
- **Perf — OK at scale.** `org_chart_unit` is called once per store (bounded by
  store count, not employees), `stable`. Non-blocking follow-up: the
  `active`-column is not index-covered on `memberships_store_role_idx` /
  `sector_memberships_sector_idx` / `stores_sector_idx`; add a composite index if
  the chart is hit hard. Noted as debt, not shipped.
