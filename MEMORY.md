# MEMORY.md — repo-scope facts Claude has learned

## Demo posture (from PR #1 scope + user overrides on Aug 12)
- main-only, Cloudflare Pages Git integration, Supabase Free (no Branching)
- Every Pages preview URL hits prod DB — treat preview writes as prod writes
- Simple email + password login (no captcha) — user chose spam-risk for simplicity
- Auth: password (signInWithPassword). CLAUDE.md scope block updated 20260819 to match shipped code.

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

## Migration flow (settled 2026-08-26)
- `apply-migrations` workflow is the ONLY applier — `supabase db push` on merge to main. Hand-applying via SQL Editor is banned: it never writes to `supabase_migrations.schema_migrations`, so schema runs ahead of recorded history and the next push dies replaying live work (cost 10 days, PRs #28-#33).
- Workflow retries `supabase link` 3x — it intermittently fails with "Failed to get API keys for project" and succeeds on retry with the same token.
- `supabase/config.toml` carries keys no pinned CLI parses; workflow swaps in a `project_id`-only stub at runtime. Don't chase CLI versions.
- A migration must be re-runnable (`if not exists` guards) — an unguarded `add constraint` is what turned a desync into a hard stop.
- Verify schema against the DB, not against a green workflow: `prize_fine_events.status` is an ENUM, and a migration written against an imagined text+CHECK column blocked everything for 10 days.

## Deferred (call out when picking back up)
- Reviewer agents + Stop hook (guide Step 9) — never installed for this demo
- Six Biome 2 rules demoted to `warn` in biome.json (see PR #38) — `useIterableCallbackReturn` in SchedulePage is a real bug shape, fix first
- CI (tests/lint/typecheck workflow) + Dependabot auto-merge + uptime + e2e — never installed
- Branch protection ruleset — never installed
- Auto rule-detection tick (pg_cron or GitHub Actions cron) — schema is ready; the periodic job is not written
- Supabase auto-pause prevention (weekly ping) — not installed
- If the demo grows to real production: turn on Pro + Branching, add per-PR preview DBs, add Cloudflare Access on preview URLs
