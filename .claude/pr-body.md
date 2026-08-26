**Intent:** Fix the actual bug that has blocked the mega migration for ten days. Every prior hotfix (#28–#33) fixed real infrastructure problems stacked on top of it; this is the one underneath.

**Impact:** One new 1-statement migration, one correction to the unapplied mega migration. No app code.

**Root cause:** `20260823120000` extends the prize/fine dispute flow and assumed `prize_fine_events.status` is a text column guarded by a CHECK constraint. It is not — it is the enum `public.prize_fine_status` with labels `pending, paid, cancelled`. So the migration's

```sql
alter table public.prize_fine_events drop constraint if exists prize_fine_events_status_check;  -- no-op, no such constraint
alter table public.prize_fine_events add constraint prize_fine_events_status_check
  check (status in ('pending', 'paid', 'cancelled', 'disputed'));
```

failed comparing the enum against a label that does not exist in it:

```
NOTICE:  constraint "prize_fine_events_status_check" ... does not exist, skipping
ERROR:  invalid input value for enum prize_fine_status: "disputed" (SQLSTATE 22P02)
At statement: 11
```

The migration rolled back cleanly — verified nothing partially applied (`shifts.deleted_at`, `memberships.last_active_at`, `clock_correction_requests`, and all 17 RPCs still absent).

**The fix:** add `'disputed'` to the enum, in its own migration. Postgres permits `ALTER TYPE ... ADD VALUE` inside a transaction but forbids *using* the new label until that transaction commits, so it must not share a transaction with the functions that reference it. `20260823110000` sorts before the mega migration and after the newest applied version (`20260822130000`), so `db push` applies it first, in its own transaction.

**I audited the rest of the file rather than fixing statement 11 and rediscovering this tomorrow.** Cross-checked every table, column, enum, and helper the migration touches against the live schema: `shift_slots.claimed_by` (not `user_id`), `shifts.{slot_count,claim_open,starts_at,ends_at,notes}`, `invites.{accepted_at,revoked_at,expires_at}`, `rate_history.{effective_from,effective_to}`, and the `has_role_on` / `is_member_of` / `write_audit` helpers all match. The enum mismatch was the only schema error. `clock_correction_requests` declares its own `status text ... check (...)` and is self-consistent.

`src/types/database.ts:18` already types `PrizeFineStatus` with `"disputed"`, so no type change is needed.

## Self-check
- [~] base = main; exactly one PR — one PR, but **two migration files touched**: one new file plus the removal of the broken block from the still-unapplied `20260823120000`. Splitting is required by the transaction rule above; editing the mega file is permitted because it has never applied.
- [x] new migration UTC-timestamped after the newest *applied* version (`20260822130000`); no new tables, so no RLS needed; `src/types` already matches
- [x] tests/lint/typecheck green — 36/36 tests, 0 biome, 0 tsc across 152 files
- [x] scripts named `lint`, `typecheck`, `test`
- [~] e2e not yet added
- [~] no env/key change
- [x] migration paired with the exact SQL block below
- [~] no irreversible action — additive enum label; the mega migration is additive and its rollback block is updated
- [x] no avoidable debt
- [x] migrations explained in plain English below
- [~] reviewers N/A — schema-only fix verified directly against the live database
- [~] no subagent dispatched

## For you
**What changed:** Added the missing `disputed` value to the prize/fine status list in the database, as its own small migration that runs first, and removed the broken block from the big migration that was trying to do it the wrong way.

**What you do next:** Merge. `apply-migrations` fires on merge and should finally apply both. If you'd rather not wait on the workflow, paste this into **Supabase Dashboard → SQL Editor** and run it — it is the entire new migration:

```sql
alter type public.prize_fine_status add value if not exists 'disputed';
```

Then re-run **Actions → apply-migrations → Run workflow** to let the mega migration through.

One caveat worth knowing: the workflow intermittently fails at `link` with `Failed to get API keys for project`. Run #18 attempt 1 hit it, attempt 2 sailed past with the same token. It's transient on Supabase's side — if you see it, just re-run, don't go hunting.

**How to roll it back:** The mega migration's own rollback block is at the bottom of its file. The enum label cannot be dropped — Postgres has no `DROP VALUE` — but an unused label costs nothing.
