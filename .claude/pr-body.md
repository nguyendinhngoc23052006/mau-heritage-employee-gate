**Intent:** Fix three classes of payroll bug found by auditing the code after the mega migration finally applied. All of them cost real money once a store has more than a couple of employees; none has surfaced yet only because the data volumes are still tiny (14 clock events, 0 rate_history rows).

**Impact:** No schema change, no migration, no env change. Read-path only. Tests 36 → 42.

## The money bugs

**Deactivated employees lost their final wages.** `computePayroll` filtered memberships with `.eq("active", true)`, so deactivating someone erased the hours they had already worked — you could not pay a leaver. Now all members are fetched and a row is dropped only when the member is inactive *and* has no minutes, prizes or fines in the period. Active members with zero hours still appear.

**Shifts crossing a period boundary were paid in neither month.** Clock events were fetched windowed to `[from, to)`, and pairing required both ends inside that window, so a 23:00–02:00 shift across month end vanished from both months. The fetch window is now widened 24h on each side and each pair is attributed to the period containing its clock-in.

**The payroll CSV did not reconcile with its own totals.** Three separate causes: `listStorePrizeFine` ignored the date range while its cache key claimed otherwise, so line items could come from any month; line items printed every status while the totals count only `pending` + `disputed`, so a cancelled fine appeared as a row carrying an amount deliberately absent from the total above it; and the row filter compared browser-local month bounds against `+07:00`-anchored totals, so a non-Vietnam browser disagreed with itself by up to a day at the boundary. The range is now applied server-side, statuses match the aggregate, and the duplicate client-side filter is gone — one definition of the period.

## Also

- `String(error)` rendered a Supabase `PostgrestError` as the literal `[object Object]` on Sales and Analytics — the same bug already fixed on Schedule. Both now use the existing `errorMessage` helper.
- The client-side `deleted_at` filter and `last_active_at` sort go back to the database now that the mega migration has applied.

## A note on how this was built

Two Haiku writers worked disjoint file sets, then two Haiku checkers cross-audited the other's work. That caught real defects, including one the writers' own tests could not:

The period guard was written as a string comparison. PostgREST returns `timestamptz` with a `+00:00` offset while callers pass `+07:00` bounds, so `"2026-07-31T17:30:00+00:00" >= "2026-08-01T00:00:00+07:00"` is `false` — the first seven hours of every month would have gone unpaid, and the next month's first hours would have been pulled in. It reintroduced the exact bug class this PR set out to fix.

It survived the writers' tests because every mocked timestamp used `+07:00`, a format the database never returns. Both writer-authored tests passed against the broken comparison. The mocks now use `+00:00`, and the query builder records and applies range filters instead of handing back rows regardless — without that, no test could cover the fetch widening either.

Each fix was verified by reverting it and confirming a specific test fails:
- revert the epoch comparison → *"counts a shift in the first VN hours of the period"* fails
- revert the 24h widening → *"counts a shift that starts inside the period and ends after it"* fails

## Rule gap for you (not changed here)

`CLAUDE.md` documents hand-applying migration SQL through the Supabase SQL Editor *and* the `apply-migrations` workflow pushes the same files. Both are live and neither knows about the other — that is what desynced the migration history and cost ten days. It will desync again on the next migration. `CLAUDE.md` is read-only to me, so this is a flag, not an edit: pick one path and I will move the docs and workflow together.

## Self-check
- [x] base = main; exactly one PR
- [~] no migration file in this PR; `src/types` already matches (no schema change)
- [x] tests/lint/typecheck green — 42/42 tests, 0 biome errors and 0 warnings, 0 tsc across 152 files; happy and unhappy paths both exercised
- [x] scripts named exactly `lint`, `typecheck`, `test`
- [~] e2e not yet added
- [x] key still read from `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`; nothing hardcoded; no secret in code
- [~] no migration, so no SQL block to paste
- [~] no irreversible action introduced — read-path changes only
- [x] no avoidable debt; ~150 lines of duplicated test mock boilerplate collapsed into one helper
- [~] no migrations to explain
- [x] reviewers ran — `.claude/review/{ts-react,demo-readiness,sql-rls-rpc}.md` refreshed this PR
- [x] every subagent dispatched on Haiku, below the orchestrator's tier

## For you
**What changed:** Deactivated employees are paid for hours they actually worked. Shifts that run past midnight across a month boundary are no longer lost from both months. The payroll CSV now covers exactly the same events its totals do. Two pages that showed `[object Object]` on error now show the real message. Shift and membership filtering moved back into the database now that the migration has landed.

**What you do next:** Review the Cloudflare Pages preview, then merge. Worth spot-checking on the preview: open Payroll, switch months, and download the CSV — the prize/fine line items should now only be ones inside the selected month, and their amounts should add up to the totals in the summary rows. No env or Supabase action needed.

**How to roll it back:** Cloudflare Pages → Deployments → Rollback to the prior deployment. No schema changed, so there is no SQL to reverse.
