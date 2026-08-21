# SQL / RLS / RPC reviewer — verdict

Scope: `supabase/migrations/20260819120000_close_all_gaps.sql` against the 13 findings from the PR #20 post-mortem.

**1 — FIXED, with a regression caught and patched.** `memberships_manager_update`'s self-branch now pins `active`/`role` so a deactivated user can't self-reactivate. First pass reintroduced privilege escalation (a manager's self-branch could slip past the owner-role ceiling); the orchestrator patched the `with check` to re-derive the ceiling from `has_role_on` before merge.

**2 — FIXED, scope narrowed.** `store_applications_self_delete` originally allowed DELETE on any status; constrained to `declined`/`withdrawn` only so an approved row (audit trail of how membership was granted) and a pending row (must go through `withdraw_application`) can't be deleted.

**3 — Server FIXED, client was misleading.** `claim_slot` now raises a distinguishable `42501` instead of returning an all-null row. Flagged that every RPC failure rendered the same generic toast client-side, masking "lost the race" behind "something went wrong" — Fixer A patched the toast copy to branch on errcode.

**4 — FIXED, ops caveat.** `variance_cents` is now a `NULL`-preserving `GENERATED ALWAYS ... STORED` column. Note for the human: `ADD GENERATED ... STORED` takes `ACCESS EXCLUSIVE` on `sales_reports` — fine at current row counts, will need `pg_repack`-style care at scale.

**5 — FIXED, acceptable tradeoff.** `apply_manual_rule` dedupes on a minute-granularity key; double-click races inside the same minute collapse, coarser-than-request but sufficient for manual application cadence.

**6 — FIXED.** Sweep window widened 48h → 30 days; forgotten clock-ins no longer silently drop from payroll.

**7 — STILL-BROKEN at first pass, then patched.** `close_stale_clock_event` originally had no "already paired with an out" guard, so re-clicking after a real clock-out would insert a corrupting second auto-out; the orchestrator added the guard before merge.

**8–13 — CONFIRMED-FIXED.** Audit-log triggers populate `audit_log` on all consequential tables; notification producers fan out on announcement/sales-decision; remaining items (grants, `search_path` pinning, `security definer` on new functions) verified present.

Minor, non-blocking: `close_stale_clock_event`'s "no flag existed" branch inserts an already-resolved flag rather than skipping — acceptable, keeps history complete without queue noise.
