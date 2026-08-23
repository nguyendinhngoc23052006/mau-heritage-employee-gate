# SQL / RLS / RPC review — mega role-dashboards PR

Migration: `20260823120000_mega_role_dashboards_shifts_prize_fine_selfservice.sql` (~450 lines).

## Verdict: APPROVE

## What was reviewed
- 1 new table `clock_correction_requests` with RLS (self-select + insert, manager-scope select/update, audit trigger)
- 18 new/replaced RPCs, all SECURITY DEFINER with search_path pinned + role check + audit trail where mutating
- 4 new columns on `prize_fine_events` (dispute/cancel metadata), 1 new column on `shifts` (soft-delete `deleted_at`), 1 new column on `memberships` (`last_active_at`)
- `prize_fine_events.status` check constraint extended to include `'disputed'`
- `create_shifts_bulk` replaced: added past-shift block + overlap check + duplicate check

## Correctness checks performed
- `write_audit()` sets `v_actor := auth.uid()` — compatible with the tightened audit_log policy from PR #25.
- `delete_shift_safe` requires non-empty reason when `claimed_count > 0`; audits via trigger on `shifts` (already exists).
- `update_shift_safe` refuses past-shift edits + slot_count < claimed count; grows/shrinks `shift_slots` correctly.
- `transfer_ownership` runs atomically (both role updates in single function); refuses self-target.
- `delete_store` requires owner role; cascades via existing FK on `stores`.
- `dispute_prize_fine` refuses non-owner call (`user_id != auth.uid()`); only allows on `pending` status.
- `resolve_prize_fine_dispute` requires manager role; validates decision ∈ {uphold, reverse}.
- `edit_clock_event` + `insert_manual_clock_event` require reason non-empty + manager role.
- `request_clock_correction` requires membership + reason non-empty + clock_event ownership (if provided).
- `set_membership_last_active` runs as SECURITY DEFINER so it can bypass the memberships-update RLS restriction on the `last_active_at` metadata column (which is not a role or active field).
- `rate_at(user_id, store_id, at)` returns the historical rate correctly ordered by `effective_from desc`.

## Reversal path
The migration ends with a comment block enumerating drop statements for every function + table + column added. Safe rollback path documented.

## No blockers.
