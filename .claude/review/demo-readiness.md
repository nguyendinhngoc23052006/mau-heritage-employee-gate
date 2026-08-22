# Demo-readiness review — PR #25 (post-sweep close-out)

Reviewed against the "demo-posture tradeoff" in CLAUDE.md: preview URLs share the prod DB, so every write in a preview is a prod write.

## Verdict: APPROVE for merge; safe for demo rollout.

## Destructive-write audit for this PR
- **No new destructive writes.** Everything is either a policy tighten (deny stricter than before), a trigger add (write more audit rows), or a client-side gate/UX fix (no new writes). The migration is idempotent and safe to re-run.
- **audit_log tighten:** existing rows unaffected; only future INSERTs are stricter. Trigger path unchanged (uses `auth.uid()`).
- **clock_events audit trigger:** additive — writes to `audit_log`, no schema change to `clock_events` itself.
- **attendance_flags audit trigger:** additive — extends existing trigger from UPDATE to INSERT+UPDATE.
- **Clock RPC location_verified NULL semantics:** existing rows with `location_verified = false` unchanged (data migration not attempted; new rows going forward correctly use NULL when un-measured).

## User-visible changes on preview
1. Fonts now render (previously fell back to system fonts).
2. Payroll page requires manager role — employees see access_denied instead of the table.
3. StoreSwitcher shows the store name + add option for single-store users (not just an add button).
4. Bulk-create shifts refreshes slot counts immediately.
5. Release slot failures now surface as alerts (were silent).

## Rollback path
- **CSP + client fixes:** Cloudflare Pages → Deployments → Rollback to the prior deployment. Instant.
- **Migration:** reversing SQL is documented in `.claude/pr-body.md → How to roll it back`.

## Gaps still open (documented, not blocking demo)
- GPS layer-2 anti-spoof (rotating store QR / IP allowlist / manager-approval flow). Layer-1 defense in place: RLS + SECURITY DEFINER + haversine re-check + audit trail. A rooted phone with fake-location can still cheat.
- Auto-triggered rule evaluators (missed_shift, late_arrival, till_variance, points_threshold) not wired to pg_cron. Manual review only for now.
- Analytics "missed shifts" + "late arrivals" sections are placeholder "coming soon".

None of these are regressions from PR #25. Merge does not make the demo less safe.
