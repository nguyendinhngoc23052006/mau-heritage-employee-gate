# MEMORY.md — repo-scope facts Claude has learned

## Kwook rebrand + org chart + legacy purge (2026-09-15, PR after #45)
- Màu Heritage era PURGED (user: "purge all legacy mau heritage data"). Migration deletes the 4 sector_id-null stores (cascade: 4 memberships, 42 shifts, 63 slots, 10 claims, 22 clock_events, 60 audit rows) + all client_errors. Verified by full begin/rollback dry run. This was the "explicitly approved deletion PR" the scope block reserved. After it, sysadmin has 0 memberships so the store-switcher dropdown vanishes on its own.
- Org chart: ONE `org_chart()` RPC (security definer) returns the whole company as nested JSON — tier1, sectors[directors, units[managers, employees]], unassigned. No SSR on this stack (static Vite on Pages); the single-snapshot-per-device model gives the same speed. `org_chart_unit()` defined BEFORE `org_chart()` — SQL function bodies parse at CREATE with check_function_bodies on. Cache key ["org","chart"], invalidated after every org/people mutation. Names+positions only, never pay/contact — that is why it may bypass per-branch RLS.
- Chart page = pure-CSS nested-<ul> tree (.org-tree in index.css), no per-node JS. Chart nav link shows for everyone; /org index still tier<=2 only.
- Brand: token NAMES kept (brand-navy etc, ~200 usages) but VALUES swapped to Kwook — navy=#336eb4 (petal blue), ink=#373536 (wordmark charcoal), cream=cool paper; added gold #f9b431 / green #79b84f / red #e4353c (the four petals, sampled from the logo JPEG). Wordmark→"KWOOK VIỆT NAM", LogoMark+favicon→four-petal pinwheel. i18n swept "cửa hàng"→"bộ phận", store→unit.

## Organisation hierarchy (settled 2026-09-15, PR #45)
- Re-scoped from "one store per owner" to Kwook Việt Nam, one organisation: tier 1 sysadmin (`nguyendinhngoc23052006@gmail.com`, bootstrapped by migration) + CEO via `profiles.global_role`; tier 2 directors via `sector_memberships`; tier 3 store managers (`memberships.role` manager/owner); tier 4 employees. `stores` kept its name and every FK — it is the tier-3 unit ("bộ phận"); `stores.sector_id` hangs it under a sector ("khối").
- `is_member_of()` / `has_role_on()` are hierarchy-aware, so all 60 policies grant a director and tier 1 what the store's managers have without a rewrite. `set_role()` is the only role writer; `guard_role_write` / `guard_global_role_write` triggers make any other path raise. Rule everywhere: act only on tiers strictly below yours, inside your branch; the sysadmin removing a CEO is the one exception.
- Directors do not see unassigned accounts (RLS). They bring people in by store invite (lands as employee), then promote. Tier 1 sees everyone and appoints directly.
- Retired (functions dropped): `create_store_with_owner`, `reclaim_store`, `transfer_ownership`, `list_my_orphaned_stores`. Self-service store creation/joining is gone from the UI; the applications/invites tables remain (invites: employee only).
- Verifying a migration before merge: `execute_sql` honours `begin; … ; rollback;` in one call (proved with a temp-table probe first — the rollback leaves no trace). Dry-run every migration this way; it is not a hand edit because nothing commits. The runner is still the only applier.
- Kwook brand (from kwookvietnam.com.vn, 2026-09-15): logo = four-petal pinwheel (gold/orange, green, red, blue) + charcoal "Kw" wordmark; site CSS is Flatsome-default (#446084 / #d26e4b / #7a9c59 / #313131, Lato + Dancing Script) so the app palette is built from the logo, not the CSS. Voice: xanh, làn sóng nhỏ, bền vững, thiên nhiên. Rebrand is its own PR.
- Debt: sector/global role changes are not audited (`audit_log.store_id` is NOT NULL); `IssuePrizeFineModal` still maps options while closed.

## Demo posture (from PR #1 scope + user overrides on Aug 12; superseded by the section above where they differ)
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

## Proving what is actually deployed (settled 2026-09-12)
- The build stamps itself: `dist/version.json` and `__BUILD_SHA__` both carry the 7-char sha. A `_headers` rule is also a fingerprint — `/` answering `no-cache, must-revalidate` proves bcf704d or later is live.
- `client_errors` is the witness. Every `/store/:storeId` route has `RouteErrorFallback` as `errorElement` and it logs with `build <sha>` prefixed to `stack`. No row **and** no build line on the error card = the reporter is running a pre-fix bundle, not a live bug. Check this before re-diagnosing anything.
- This sandbox cannot reach `*.pages.dev` (egress proxy 403 on curl and WebFetch). Use an external fetch tool to read production.
- One cache key written by two different fetches is this repo's recurring defect — `["members", …]` crashed People and Payroll, `["notifications","inbox"]` silently hid read notifications. `src/__tests__/queryKeyShapes.test.ts` now gates every key, not one.

## Deferred (call out when picking back up)
- Reviewer agents + Stop hook (guide Step 9) — never installed; `.claude/agents/` does not exist, so reviewers are dispatched ad hoc and their verdicts written to `.claude/review/`
- Six Biome 2 rules demoted to `warn` in biome.json (see PR #38) — `useIterableCallbackReturn` in SchedulePage is a real bug shape, fix first
- CI (tests/lint/typecheck workflow) + Dependabot auto-merge + uptime + e2e — never installed
- Branch protection ruleset — never installed
- Auto rule-detection tick (pg_cron or GitHub Actions cron) — schema is ready; the periodic job is not written
- Supabase auto-pause prevention (weekly ping) — not installed
- If the demo grows to real production: turn on Pro + Branching, add per-PR preview DBs, add Cloudflare Access on preview URLs
- `IssuePrizeFineModal` maps `memberOptions` even while closed (no `if (!open) return null`) — harmless now, but it is why one cache bug broke both People and Payroll
