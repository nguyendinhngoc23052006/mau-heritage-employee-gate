# Falsification review — "the People/Payroll crash cannot come from current code"
Reviewed: `claude/heritage-gate-part-2-ia4u9p`
Verdict: **conclusion survives; 1 CONFIRMED finding in the new gate, fixed in this PR**

## Falsification attempt
No counterexample could be constructed. Walked `src/lib/router.tsx` →
`src/routes/people.tsx`, `src/routes/payroll.tsx` → both pages and every component
and hook they render, including shared `Layout`, `Nav`, `AuthGate`,
`StoreMemberGate`, `StoreSwitcher`, `useMemberships`, `useSession`, `lib/i18n`,
`ui/Select`, `services/members`; then grepped every string-mutator call in `src/`
and checked each against the declared nullability in `src/types/database.ts`.
Every `.substring` reachable from either route is `?.`-guarded;
`ui/Select.tsx:60` was hardened to `(opt.label ?? "")`; `services/members.ts:26-28`
filters non-string `user_id` before any consumer sees a row.

## Confirmed mechanism
`git show 9fec580` confirms both crash sites were bare pre-fix, and
`src/pages/PeoplePage.tsx:1078` renders `IssuePrizeFineModal` unconditionally while
the modal has no `if (!open) return null` — so its `memberOptions` map runs on every
People render. One cache bug, two broken pages.

## CONFIRMED finding — fixed in this PR
The new generic scanner matched the literal token `useQuery({` and so was blind to
`useQuery<T>({`, a spelling this repo uses at `src/hooks/useMemberships.ts:17` and
`src/pages/OnboardingPage.tsx:58,67` (the latter two carry a multi-line type argument
containing braces). Fixed: the scanner now walks past a balanced type argument
(`optionsBraceAfter`), and a new assertion requires the number of parsed blocks to
equal the number of `useQuery` calls in the source — so any spelling it cannot parse
fails the test instead of disappearing from it
(`src/__tests__/queryKeyShapes.test.ts:54-113, :186`).

## Out of scope, real, not fixed
- `src/pages/AuditPage.tsx:188` `item.entity_id.substring(0, 12)` is unguarded, but
  `entity_id` is typed `string` and the route is `/audit`.
- `src/pages/EmployeeDetailPage.tsx:310` is inside `{rh.changed_by && …}`, safe.
- `SchedulePage.tsx:955-980` uses its own key `["members_options", storeId]` on
  query-constructed non-null strings, confined to `/schedule`.
