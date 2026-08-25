**Intent:** Finish what PR #32 started. The config stub worked — run #17 parsed config, linked, and reached `db push`. It then failed for a genuinely different reason, now diagnosed against the live DB rather than guessed.

**Impact:** Workflow-only, one file. This should be the last one in the chain.

**Root cause (verified, not inferred):** Migrations `20260815120000` … `20260822130000` were applied to prod **by hand via the Supabase SQL Editor** — the documented demo flow in `CLAUDE.md`. Hand-run SQL does not write to `supabase_migrations.schema_migrations`, so the schema is ahead of the recorded history. `db push` therefore tried to replay all 10 pending files and died on the first unguarded DDL:

```
ERROR: constraint "clock_events_membership_fk" for relation "clock_events" already exists (SQLSTATE 42710)
```

Checked against prod on 2026-08-25:
- Recorded history stops at `20260814020000`.
- Every RPC through `close_all_gaps` exists (`apply_manual_rule`, `close_stale_clock_event`, `submit_sales`, `clock_in_at`, …), and the `audit_log_service_insert` policy from `close_sweep_gaps` is present → those 8 files are genuinely applied.
- Zero of the mega migration's markers exist — no `shifts.deleted_at`, no `memberships.last_active_at`, no `clock_correction_requests` table, no `prize_fine_events.dispute_reason`, and none of its 18 RPCs → that one file is genuinely pending.

**The fix:** add a second `migration repair --status applied` for the 8 already-applied versions, so `db push` runs exactly one migration — `20260823120000_mega_role_dashboards_shifts_prize_fine_selfservice.sql`. The existing `--status reverted` repair for the 8 ghost timestamps stays as-is.

## Self-check
- [x] base = main; exactly one PR
- [~] no migration file in this PR (workflow-only; the pending migration is already on main from #26)
- [~] tests/lint/typecheck N/A — no app code touched
- [~] script names N/A — no app code touched
- [~] key/env contract N/A — no app code touched
- [~] no new migration — the one being applied shipped with #26
- [~] no irreversible action from the workflow itself; the migration it applies is additive (new columns/table/RPCs), reversing SQL is in #26's body
- [x] no avoidable debt; the *why* is documented inline in the workflow with the verification date
- [x] migrations explained in plain English below
- [~] reviewers N/A — workflow-only change
- [~] no subagent dispatched — single-file fix from a direct DB read

## For you
**What changed:** The `apply-migrations` workflow now tells Supabase that the 8 migrations you already ran by hand in the SQL Editor are in fact applied, before it pushes. Without that, it kept trying to re-run them and crashing on the first line that can't run twice.

**What you do next:** Merge. The workflow fires on merge and should apply the one genuinely-pending migration — the mega one from PR #26 with the 18 RPCs and the `clock_correction_requests` table. You'll know it worked when Schedule stops throwing `PGRST202` on `delete_shift_safe` / `close_shift_claims` / `force_open_shift`, and the ⋯ menu on a shift card actually works.

**How to roll it back:** Nothing to undo in the workflow — re-runnable via Actions → apply-migrations → Run workflow. If the migration itself applies and you want it gone, the reversing SQL is in PR #26's body (drop the 18 functions, the `clock_correction_requests` table, and the added columns).
