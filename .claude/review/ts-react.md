# ts-react — payroll correctness PR

Verdict: **PASS after orchestrator fixes.**

Reviewed the two Haiku writers' diffs across services, hooks, pages and tests.

## Blocking findings (fixed before commit)

1. **`src/services/payroll.ts` period guard compared ISO strings across different
   UTC offsets.** `inTime` arrives from PostgREST with a `+00:00` offset; `from`/`to`
   are `+07:00`. Lexicographic `>=` / `<` between them is not chronological.
   - VN `2026-08-01 00:30` → `2026-07-31T17:30:00+00:00`, which sorts before
     `2026-08-01T00:00:00+07:00` → the first ~7 hours of every month went unpaid.
   - VN `2026-09-01 00:30` → `2026-08-31T17:30:00+00:00`, which sorts before
     `2026-08-31T23:59:59+07:00` → next month's shift paid in this one.
   Fixed by comparing epoch milliseconds.

2. **The new tests could not catch offset bugs.** Every mocked `at` used `+07:00`,
   a format PostgREST never returns, so both writer-authored tests passed against
   the buggy comparison. Mock timestamps converted to `+00:00`.

3. **The mock ignored query filters**, so no test could cover the 24h fetch
   widening — the mock returned rows regardless of `.gte`/`.lt`. The builder now
   records and applies range bounds.

## Verified by reverting each fix
- Revert the epoch comparison → "counts a shift in the first VN hours of the period" fails.
- Revert the 24h widening → "counts a shift that starts inside the period and ends after it" fails.
Both regressions are genuinely covered; neither test passes vacuously.

## Non-blocking, addressed
- `rateAt` used the same string comparison. Both sides are DB-sourced today so it is
  not a live bug, but it is money code and one edit away from the same class of failure.
  Converted to epoch comparison.

## Checked and correct
- Inactive-member drop keeps active members with zero hours.
- 24h widening applied only to `clock_events`, not prize/fine, multipliers or rate_history.
- `.or()` not reintroduced on `rate_history`; plain `.lte` is correctly encoded.
- `memberships_public` genuinely exposes `active` and `hourly_rate_cents` (verified against prod).
- Test-file duplication removed: ~150 lines of per-test mock boilerplate collapsed into one helper.
