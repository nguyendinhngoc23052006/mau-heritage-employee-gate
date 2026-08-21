# Anti-cheat + demo readiness reviewer — verdict

## Section 1 — the 22 items from the PR #20 post-mortem

**1–4 — FIXED.** Geofence enforcement, distance re-check, shift auto-linking, and idempotent clock writes all confirmed working.

**5 — STILL-BROKEN.** Auto rule-detection (the pg_cron/scheduled tick that should fire rules automatically) never actually runs anything — schema is ready but no trigger or scheduled job invokes it. Subsequently badged as "not implemented" in the UI by Fixer A rather than silently presented as live.

**6 — STILL-BROKEN.** Analytics cards are stubs with placeholder numbers, not wired to real aggregates. Subsequently marked "coming soon" by Fixer B so the demo doesn't misrepresent data.

**7–11 — FIXED.** Sales approval variance guard, attendance-flags queue, notification fan-out, audit log population, and manual rule apply dedupe all confirmed.

**12 — PARTIAL, deferred.** Five list views (audit log, notifications, rule events, point events, prize/fine events) remain unbounded — no pagination/limit yet. Non-blocking at current row counts for a demo; flagged as tech debt for the scale rule.

**13–14 — FIXED.** Confirmed.

**15 — PARTIAL, then patched.** Several hardcoded-English strings remained outside the i18n table; Fixer B patched the holdouts into the translation set.

**16 — STILL-BROKEN, then patched.** The profile locale-switch button was dead (no handler wired). Fixer A wired it.

**17–21 — FIXED.** Confirmed.

**22 — PARTIAL, deferred.** 58% of `src/services/` remains untested by line count. Acceptable for demo posture; not a merge blocker, tracked as debt.

## Section 2 — new gaps found in this review pass

Stale `.claude/pr-body.md` (still described merged PR #20), empty `.claude/review/`, `ApplyRulePage` not filtering rules by store/active state, `notify_sales_decision`'s dispute-status branch inserting a `null` body when `dispute_reason` is unset, and an `actions/checkout` version mismatch between `apply-migrations.yml` (v4) and `ci.yml` (v7). All five subsequently patched: this PR rewrites `pr-body.md`, populates `.claude/review/`, and pins `apply-migrations.yml` to v7; the `ApplyRulePage` filter and the null-body guard were closed in the orchestrator's follow-up fixer pass.

## Section 3 — production-readiness call

**Yes, after the fixer swarm closes items 5, 6, 15, 16, and the `ApplyRulePage` filter — all now closed.** Remaining open items (12, 22) are logged debt, not blockers, for a demo running on Supabase Free with a single production DB shared by every preview.
