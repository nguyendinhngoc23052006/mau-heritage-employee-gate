# Verification verdicts — payroll cache-shape crash

Date: 2026-08-27
Note: this repo has no `.claude/agents/` swarm installed yet (the guide added
`templates/agents/` in cloud-pipeline-guide#40; this repo has not adopted them).
Two ad-hoc verification agents were dispatched instead, one tier below the
orchestrator, and their briefs are recorded here.

## Agent 1 — independent root-cause check, briefed to FALSIFY

Verdict: **CONFIRMED.** It reproduced the chain independently and added two
facts the original diagnosis lacked:

- `src/lib/query.ts` sets `staleTime: 30_000` with no `refetchOnMount` override.
  That is why the crash is reliable rather than intermittent: within 30s of
  visiting Schedule, the payroll query is served from cache and `listMembers`
  is never called.
- `Nav.tsx` uses react-router `NavLink`, and both routes are children of the
  same `/store/:storeId` layout — so the transition is client-side, and the
  poisoned cache survives it. A full reload empties it, which is exactly the
  reported "works after refresh".

It also swept the whole payroll render tree (`PayrollPage.tsx`,
`src/components/payroll/**`, `src/services/payroll.ts`) for other unguarded
string operations on possibly-undefined values — `.substring`, `.slice`,
`.charAt`, `.split`, `.toFixed` — and found none. So fixing the shape collision
fixes the reported crash; there is no second fault hiding behind it.

## Agent 2 — sweep for the same bug class elsewhere

Briefed to enumerate every `useQuery` in `src/`, group by normalised queryKey,
and report every group whose call sites return different shapes — plus
`setQueryData`/`getQueryData` writes and `enabled:` disagreements that could
cache under an `undefined` id.

Result recorded in the PR body.
