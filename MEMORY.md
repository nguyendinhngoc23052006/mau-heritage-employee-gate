# MEMORY.md — repo-scope facts Claude has learned

## Demo posture (from PR #1 scope + user overrides on Aug 12)
- main-only, Cloudflare Pages Git integration, Supabase Free (no Branching)
- Every Pages preview URL hits prod DB — treat preview writes as prod writes
- Simple magic-link login (no captcha) — user chose spam-risk for simplicity

## Naming decisions (mega-PR)
- `store_id` throughout (not `tenant_id`) — matches boss's vocabulary
- Money: integer cents everywhere; VND rendered via `formatVnd`
- Time: `timestamptz` in DB (UTC); tenant tz stored on `stores.timezone`

## RLS shape
- Every table has RLS enabled
- Two security-definer helpers avoid policy recursion: `is_member_of(store_id)` and `has_role_on(store_id, roles[])`
- `memberships_public` view hides `hourly_rate_cents` from non-managers — direct `memberships` table select still returns rows without pay for anyone in the store; use the view when displaying to employees

## Correctness patterns installed
- `rate_history` table: pay-rate versioning; payroll compute must join to the row valid at shift-start time (not memberships.hourly_rate_cents which is the current rate)
- `wagesCents(minutes, rate_cents) = Math.floor((minutes * rate) / 60)`: integer-only, never floats
- `claim_shift(shiftId)` RPC: atomic FCFS via `UPDATE ... WHERE status='open'`; returns null if lost the race; every attempt logs to `shift_claims` regardless
- Idempotency: `clock_events.idempotency_key = ${userId}-${kind}-${minute-precision-ISO}` unique constraint prevents double-click dupes
- Rule application snapshots the rule state into `rule_events` so past applications explain themselves even after the rule is edited
- CSV export includes UTF-8 BOM so Excel-VN opens Vietnamese characters correctly

## Deferred (call out when picking back up)
- Reviewer agents + Stop hook (guide Step 9) — never installed for this demo
- CI (tests/lint/typecheck workflow) + Dependabot auto-merge + uptime + e2e — never installed
- Branch protection ruleset — never installed
- Auto rule-detection tick (pg_cron or GitHub Actions cron) — schema is ready; the periodic job is not written
- Supabase auto-pause prevention (weekly ping) — not installed
- If the demo grows to real production: turn on Pro + Branching, add per-PR preview DBs, add Cloudflare Access on preview URLs
