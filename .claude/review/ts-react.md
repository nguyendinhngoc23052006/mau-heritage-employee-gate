# TypeScript / React review — PR #25 (post-sweep close-out)

Reviewed all client-side diffs against the 4-agent sweep findings.

## Verdict: APPROVE for merge

## Findings addressed in this PR
1. **PayrollPage.tsx** — added `isManagerRole(useRoleOn(storeId))` gate matching the pattern in `RulesPage.tsx:101`, `AuditPage.tsx:74`, `AnalyticsPage.tsx:28`. Non-managers see `access_denied` ErrorState. Query is `enabled: isManager`, so no wasteful fetch.
2. **PayrollPage.tsx date range** — was `.toISOString()` on `startOfMonth(date)` (browser local TZ). Now `${format(startDate, "yyyy-MM-dd")}T00:00:00+07:00`, matching `SchedulePage.tsx:131-132`.
3. **payroll.ts empty .in() guard** — `profiles.select(...).in("id", userIds)` now short-circuits when `userIds.length === 0`. Zero-member store no longer throws.
4. **payroll.ts float multiplier** — was `wagesCents(minutes, hourlyRate * multiplier)` (float baked in before Math.floor). Now `Math.floor((minutes × rateCents × mulBps) / 6000)` with `mulBps = Math.round(multiplier × 100)`. Integer-safe. Removed unused `wagesCents` import.
5. **StoreSwitcher.tsx** — removed `data.length < 2` soft-lock. Threshold now `data.length === 0 → null`; Select renders for 1 or N stores.
6. **SchedulePage.tsx** — added `onError` on `releaseSlotMutation` matching claim pattern. `BulkCreateModal.onSuccess` now invalidates `["shift_slots", …]` too.
7. **errorLog.ts** — empty catch now `console.error("[errorLog] failed to log client error", logErr, err)`. Broken logging pipeline visible in devtools.
8. **public/_headers CSP** — added `https://fonts.googleapis.com` to `style-src` and `https://fonts.gstatic.com` to `font-src`. Barlow + Inter now render (were silently falling back to system fonts).
9. **i18n** — removed 2 orphan keys (`schedule.slot_release_window_hint`, `schedule.slot_release_expired`) from vi.json and en.json. Both files 426/426 parity.

## Findings acknowledged but deferred
1. **11 untested services** (`applications`, `attendance`, `audit`, `invites`, `members`, `notifications`, `payMultipliers`, `points`, `profiles`, `heatmap`, half of `shiftSlots`) — tech debt; separate PR.
2. **Existing tests use `as any` for supabase mocks** (`biome.json` disables `noExplicitAny` for `*.test.ts`) — schema drift won't fail typecheck. Retyping to generated row types is a separate mechanical PR.
3. **payroll.test.ts covers money.ts helpers only** — `computePayroll`/`markPrizeFinePaid` untested; separate PR.

## Gates
- `npm run lint` → 0 errors (biome check .)
- `npm run typecheck` → 0 errors (tsc --noEmit)
- `npm test` → 36/36 passing across 10 test files
