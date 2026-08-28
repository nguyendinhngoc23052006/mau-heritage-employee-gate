**Intent:** fix the Payroll page crashing on every client-side navigation. **Impact:** one shared React Query cache key stops being written with two different shapes.

## What was actually wrong

`SchedulePage.tsx:178` ran its own inline query under the cache key `["members", storeId]`, returning `{id, name}[]`. Seven other call sites use that same key with `listMembers(storeId)`, which returns `MemberWithProfile[]` — the shape with `user_id` and `profile` on it.

React Query caches by key, not by call site, so whichever component mounts first wins:

1. Open **Lịch** (Schedule). Its query caches `{id, name}` rows under `["members", storeId]`.
2. Tap **Bảng lương** (Payroll). `NavLink` — client-side, no reload — and both routes live under the same `/store/:storeId` layout, so the cache survives.
3. `StorePrizeFineTable` mounts, reads the same key, and gets Schedule's rows. `listMembers` is never called, because `src/lib/query.ts` sets `staleTime: 30_000` and the entry is still fresh.
4. `m.user_id` is `undefined` → `.substring(0, 8)` throws → error boundary shows **"Something broke"**.

A hard refresh empties the cache, so Payroll's own fetch wins and the page works. That is the whole "always breaks until refreshed" symptom.

TypeScript could not catch this: every `useQuery` infers its own type from its own `queryFn`, and keys are not type-linked across files.

## The fix

- **`SchedulePage.tsx`** now fetches through `listMembers(storeId)` like every other consumer, and derives its local `{id → name}` map from the canonical shape afterwards. One shape in the shared key. This also deletes a duplicated raw Supabase query, so Schedule now shares that cache entry instead of racing it — and it reads `memberships_public` (the view every other page uses) rather than the `memberships` table directly.
- **`StorePrizeFineTable.tsx`, `IssuePrizeFineModal.tsx`, `ApplyRulePage.tsx`** — guarded their `user_id.substring(0, 8)` fallbacks with `?.` and `|| "—"`, matching the pattern already used everywhere else. Defence in depth: these were the only unguarded ones reading this key.

## The regression test

`src/__tests__/queryKeyShapes.test.ts` scans the source and fails if any `useQuery` on `["members", …]` does not go through `listMembers`. Written first — it named `src/pages/SchedulePage.tsx:178` and nothing else, then went green with the fix.

It reads sources via `import.meta.glob` rather than `node:fs`, so it adds no `@types/node` dependency. A second case asserts the scan still finds at least six call sites, so the test cannot pass vacuously if a refactor moves things out of its reach.

## Verified

`lint`, `typecheck`, `test` (44 passing) and `build` all exit clean. Two verification agents were dispatched; verdicts in `.claude/review/verification-agents.md`. One was briefed to falsify the diagnosis and confirmed it, additionally establishing that no other unguarded string operation exists anywhere in the payroll render tree — so this fix resolves the reported crash rather than uncovering the next one.

## Is this the only one?

Yes. All 72 `useQuery` call sites were grouped by normalised cache key and every
shared key was checked for fetcher/shape agreement, twice and independently.
Four groups came back flagged on a first pass — `attendance_flags`, `rules`,
`store` and `members` — but on inspection three were false positives: those
call sites use the `(storeId ? listX(storeId) : Promise.resolve(…))` guard
form, which still routes through the same service function and returns the same
shape.

`SchedulePage:178` was the only site that ran a bespoke raw Supabase query under
a key everyone else populated through a service function, and it was the only
genuine collision in the codebase.

## Noted, not fixed here

- `AuditPage.tsx:188` (`entity_id`) and `EmployeeDetailPage.tsx:310` (`changed_by`) have unguarded `.substring` calls. Different data sources, not this cache key, no known crash — left alone rather than widening this PR.
- `ClockCorrectionsQueue.tsx:37` and `ApplyRulePage.tsx:50` query `["members", storeId]` with no `enabled` guard, unlike the other five. Harmless while `storeId` comes from the route, but inconsistent.
- The `profile?.display_name || user_id?.substring(0,8) || "—"` expression now appears in six places. Past the point where a `memberLabel()` helper is warranted — but that is a behaviour-preserving refactor and the constitution says those stand alone, never inside a fix PR.

## Self-check
- [x] base = main; exactly one PR
- [~] no migration in this PR — client-side only, no schema change
- [x] tests/lint/typecheck green; happy AND unhappy paths exercised (the test asserts both the violation is caught and the scan is not vacuous)
- [~] e2e not yet added — Playwright is not installed in this repo
- [x] scripts named exactly `lint`, `typecheck`, `test`
- [x] key read from `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; nothing hardcoded; no secret in code
- [~] no new migration in this PR
- [~] no irreversible action in this PR — read-path fix only
- [x] no avoidable debt; memory updated and pruned
- [~] no migrations to explain
- [~] reviewers ran, but as ad-hoc agents: this repo has no `.claude/agents/` swarm installed yet. Verdicts recorded in `.claude/review/verification-agents.md`
- [x] every subagent dispatched on a model below the orchestrator's — never inherited

## For you
**What changed:** the Schedule page was storing member data in a shape the Payroll page could not read, under the same cache slot. Payroll then crashed on whatever Schedule had left behind, and refreshing "fixed" it only because that threw the cache away. Schedule now stores the same shape everyone else does.

**What you do next:** review the Cloudflare Pages preview, then merge. To confirm the fix: open **Lịch**, then tap **Bảng lương** without refreshing. It should render. No env or dashboard action needed.

**How to roll it back:** Cloudflare Pages → Deployments → Rollback to the prior deployment. No schema changed, so there is nothing to reverse in the database.
