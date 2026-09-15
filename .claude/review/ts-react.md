# TypeScript / React review — hierarchy wiring
Reviewed: every changed/new `.ts/.tsx` on `claude/heritage-gate-part-2-ia4u9p`
Verdict: **3 CONFIRMED findings, all fixed in this PR; 1 SUSPECTED, fixed; rest OK**

## CONFIRMED — fixed
1. **Nav offered tabs the pages refused.** `Nav` used `useStoreAccess().canManage` (includes overseers)
   while Rules/Payroll/Analytics/Audit/Settings/Sales/Schedule/Clock/Announcements/ClockCorrections/
   ApplyRule/Dashboard still gated on `isManagerRole(useRoleOn())`. Fixed: all twelve pages now read
   `useStoreAccess(storeId)`; no `isManagerRole(`/`useRoleOn(` remains outside the hooks.
2. **EmployeeDetailPage said "Access denied" while still loading.** Fixed: `isLoading` from
   `useStoreAccess` is checked first.
3. **PeoplePage role Select showed a placeholder for a peer manager.** The row's current role is now
   always present in `options` (disabled when not assignable).

## SUSPECTED — fixed
- A failed `["me"]`/`["memberships","mine"]` fetch read as tier 4 and redirected a real director.
  `useMemberships` now exposes `isError`; `useMe` returns `tier: undefined` on error; OrgPage and
  OnboardingPage render an error state instead of redirecting. OrgPage's wrong-tier redirect goes
  straight to `/onboarding` (was a 3-hop bounce through `/` → `/login`).

## OK
Cache keys (no key written by two fetches; `queryKeyShapes` green) · invalidations reach the lists
that show the result · `useStoreAccess` tier math for legacy owner and tier 1 · DangerZoneCard hides
for a plain manager · i18n: en/vi key sets identical, every new template interpolation resolves ·
`updateMemberRole`/`deactivateMember` removed (dead after `setRole`) · tsc, biome, 77 tests green.

## Pre-existing, not touched
36 `t()` keys (`employee_detail.*`, `delete_store.*`, `danger_zone.*`, `people.resend*`) are absent
from both dictionaries on `main`; `t()` falls back to the key. `.claude/i18n-pending/` holds drafts.
