# Verification — "Something broke: reading 'substring'" on People + Payroll

Date: 2026-09-11. Three agents, each one tier below the orchestrator.
This repo still has no `.claude/agents/` swarm, so these were ad-hoc dispatches.

## Agent 1 — briefed to FALSIFY the stale-bundle conclusion

Verdict: **CONFIRMED.** Independently built both pages' transitive closures and
found every `.substring` guarded on current `main`, and the unguarded
`StorePrizeFineTable.tsx:82` present at the pre-fix base `141b226`. So the code
shipped on `main` cannot produce the reported error, and the screenshots (30/08
17:31 UTC, 31h after the merge) must come from an older bundle.

**Where it was wrong, and how that was caught:** it reported "no lazy loading
exists… no dynamic imports", having grepped only `src/lib/router.tsx`. There IS
one — `src/main.tsx:14` does `await import("./App")` — and the production build
emits two chunks (`index-*.js`, `App-*.js`), which I confirmed by building. That
correction matters: it is the mechanism by which a cached HTML shell keeps
loading a superseded app chunk. Taken at face value, this review would have
buried the actual cause.

## Agent 2 — security review of the new logging

**PASS** on the three that mattered: RLS forces `user_id` to `auth.uid()` or
null so a client cannot attribute an error to someone else; `logClientError`
cannot recurse (it swallows its own failures); and the origin+pathname
sanitisation does correctly strip the fragment carrying Supabase recovery
tokens.

**Two findings, both fixed here** — and both were created by this PR, since
nothing wrote to this table before:
- No bound on row size. Stacks run to tens of KB and the project is on a 500 MB
  Free tier. Message capped at 500 chars, stack at 4000.
- No bound on write rate. A render loop would have written a row per frame.
  `RouteErrorFallback` now logs once per mount behind a ref guard.

**Deferred:** a retention policy for `client_errors`. The right fix is a
migration, but it would auto-apply on merge via `apply-migrations`, it cannot be
tested in this sandbox, and pg_cron availability on Free is unverified. Shipping
an untested schema change inside a PR I was asked to merge unattended is the
wrong trade. Exact follow-up: a scheduled
`delete from client_errors where at < now() - interval '90 days'`.

## Agent 3 — code review of the diff

Confirmed the build stamp is wired correctly end to end (define → type
declaration → vitest mirror), degrades to `"dev"` when unset, and that a bare
global substitutes correctly inside JSX. I also verified this empirically: a
build with `CF_PAGES_COMMIT_SHA=deadbee1234567` puts `deadbee` in the bundle
with zero unsubstituted placeholders.

Confirmed the `listMembers` row filter is safe — **no caller counts members**,
and `computePayroll` reads `memberships_public` directly rather than through
`listMembers`, so no payroll figure can move. That was the one outcome that
would have made this fix worse than the bug.

One finding, fixed: `errorLog.test.ts` mutated `window.history` without
restoring it, leaking `/reset-password` into any later test in the file.
