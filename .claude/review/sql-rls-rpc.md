# SQL / RLS / RPC review — PR #25 (post-sweep close-out)

Reviewed the migration `20260822130000_close_sweep_gaps.sql` and the 4 pre-sweep migration files it modifies (`20260812010000_baseline.sql`, `20260814020000_rls_lock_invite_email_flags.sql`, `20260818130000_lock_writes_and_reviewer_fixes.sql`, `20260819120000_close_all_gaps.sql`) against the 4-agent sweep findings.

## Verdict: APPROVE for merge

## Findings addressed in this PR
1. **audit_log_service_insert forgeable** — tightened with `actor_id = auth.uid()`. Verified `write_audit()` sets `v_actor := auth.uid()` (line 286 of `20260819120000`), so trigger path unaffected. Direct-REST forgery blocked.
2. **clock_events had no audit trigger** — added `audit_clock_events after insert or update` calling `write_audit()`. Every clock in/out now writes an audit row.
3. **attendance_flags audit was UPDATE-only** — extended to `insert or update`. Flag *creation* (geofence miss, auto-clockout) now audited; not just manager dismissals.
4. **location_verified stored false when un-measured** — clock_in_at/clock_out_at now set NULL when store has geofence coords but client sent none. require_geofence enforcement uses `coalesce(v_verified, false)`, preserving behavior for the blocking path. Flag-insert guard uses `coalesce(v_verified, true) = false`, so NULL doesn't trigger a false flag insert.

## Findings acknowledged but deferred (with reason)
1. **feature_flags_read_all USING (true)** — table has no `store_id` column (global by design). No leak today; forward-looking concern only. Fix if store-scoped flags are ever added.
2. **alter default privileges to authenticated** — flagged as systemic RLS trap. Reverting would force every future migration to explicit GRANT; large convention change out of scope. Reviewer swarm catches missing RLS on incoming PRs.

## Verification method
- Read all 4 modified migration files line-by-line.
- Verified `v_actor := auth.uid()` at `20260819120000_close_all_gaps.sql:286` so tightened policy is compatible.
- Verified `pick_active_shift` and `haversine_m` signatures unchanged (RPC bodies otherwise identical).
- Migration is idempotent: `drop policy if exists`, `drop trigger if exists`, `create or replace function` throughout. Safe to re-run.

## No blockers.
