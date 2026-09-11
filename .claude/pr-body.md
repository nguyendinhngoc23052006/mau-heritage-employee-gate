**Intent:** make this crash impossible *and* diagnosable — the app had two error catchers and neither logged, so there was no evidence to work from. **Impact:** every route crash now records a real stack trace and the build that produced it.

## What I got wrong last time

PR #40 diagnosed this as a React Query cache-key collision and fixed it. That fix is on `main` and it was correct — but it did not end the problem, and I should not have called it resolved without evidence. These screenshots are from **production**, dated 30/08 17:31 UTC, **31 hours after that merge**.

## What is actually true

**The code on `main` cannot throw this error on either page.** I built the full transitive import closure of `PeoplePage` and `PayrollPage` and there is no unguarded `.substring` anywhere in it. The only two unguarded ones left in the repo are `AuditPage.tsx:188` and `EmployeeDetailPage.tsx:310`, and neither page is in either closure.

**So the browser was running a pre-fix bundle.** The mechanism, traced end to end:

- `src/main.tsx:14` dynamically imports `App`, so the build emits two chunks — a small `index-*.js` shell and a 637 KB `App-*.js`. `index.html` is what names the hashed `App-*.js`.
- `public/_headers` set **no `Cache-Control` at all**, so the HTML shell could be cached.
- A stale `index.html` names the *old* `App-*.js` — and Cloudflare Pages still serves a previous deployment's assets, so that old chunk loads fine. The result is a complete, coherent, **old** app. Not a load failure; the old bug, faithfully reproduced.
- A hard refresh revalidates the shell, pulls the new chunk, and the page works. Exactly the reported symptom.

This also rules out the obvious alternative: a *failed* chunk load surfaces as `main.tsx`'s "Failed to start: …" text, not the "Something broke" card in the screenshots.

**And I could not prove any of this, because nothing was logged.** `client_errors` holds 6 rows, none since 14 August — through a month of crashes.

## The real root cause: two catchers, neither logging

- `src/components/RouteErrorFallback.tsx` is react-router's `errorElement` and is what actually caught these crashes — the **"Reload"** button in the screenshots is this component, not `ErrorBoundary` (whose button says "Try again"). It logged **nothing**: no `console.error`, no `logClientError`.
- `src/components/ErrorBoundary.tsx` carried a comment claiming *"errorLog already listens on window.error"*. That is false. A boundary **catches** the error, so it never reaches `window.onerror` and the global listener in `errorLog.ts` can never see it.

Both now call `logClientError`.

## What this PR changes

1. **Both catchers log.** Next occurrence writes a real stack to `client_errors` instead of vanishing.
2. **The build SHA is baked in** (`CF_PAGES_COMMIT_SHA` via a Vite `define`) and shown on the error card, and prefixed to every logged stack. "Is my fix actually deployed?" becomes a one-glance question — it took a full source audit this time, and the audit still could not reach the deployed bundle.
3. **`listMembers` drops rows with no `user_id`** before anything downstream sees them. Checked that this cannot move a number: no caller counts members, and `computePayroll` reads `memberships_public` directly rather than through `listMembers`, so no payroll figure is affected. Such a row cannot be keyed to a profile, cannot be a `Select` value and cannot be labelled — it either crashes on `user_id.substring` or renders a dead option. Fixing it once at the source covers all eight call sites; guarding them one by one never can, which is the lesson from the last attempt.
4. **The logged URL is sanitised to origin + pathname.** Supabase's password-recovery link lands with `access_token` and `refresh_token` in the URL fragment, and the logger recorded `window.location.href`. That was dormant while nothing logged; turning logging on would have started persisting live credentials into `client_errors`.
5. **`Select.tsx:60`** — guarded the one unguarded `.toLowerCase()` in the shared closure of both broken pages.
6. **`public/_headers` now sets caching explicitly** — `no-cache, must-revalidate` on the HTML shell, `immutable` on the content-hashed `/assets/*`. This is the fix for the mechanism above: the shell can no longer pin a browser to a superseded bundle.

## From the security review — bounds this PR needed because it turns logging on

Nothing wrote to `client_errors` before, so it had never needed limits:

- **Row size capped** — message 500 chars, stack 4000. Stacks run to tens of KB and this project is on a 500 MB Free tier.
- **Write rate bounded** — `RouteErrorFallback` logs once per mount behind a ref guard, so a render loop cannot write a row per frame.

RLS was verified correct (a client cannot attribute an error to another user), and `logClientError` cannot recurse.

**Deferred deliberately:** a retention policy for `client_errors`. The right fix is a migration, but it would auto-apply on merge, cannot be tested in this sandbox, and pg_cron availability on Free is unverified — shipping an untested schema change inside a PR I was asked to merge unattended is the wrong trade. Follow-up SQL: `delete from client_errors where at < now() - interval '90 days'`.

## Verified

`lint`, `typecheck`, `test` (50 passing) and `build` all clean. Lint findings unchanged from `main` (7 pre-existing, none added).

Three reviewers dispatched one tier below me; verdicts in `.claude/review/`. The first was briefed to falsify the stale-bundle conclusion rather than confirm it, including the strongest alternative (stale lazy-loaded chunks — ruled out, there is no code splitting).

## Noted, not fixed here

- `AuditPage.tsx:188` and `EmployeeDetailPage.tsx:310` still have unguarded `.substring`, and `AttendanceFlagsCard.tsx:92` an unguarded `.slice`. Different data sources, no reported crash.
- A stale-bundle detector (poll a version file, prompt to reload when the deployed SHA moves) would remove the open-tab problem entirely. Deliberately not built — speculative until the build stamp shows it is actually happening.

## Self-check
- [x] base = main; exactly one PR
- [~] no migration in this PR — client-side only
- [x] tests/lint/typecheck green; happy AND unhappy paths exercised (row dropped, logger never throws, URL sanitised)
- [~] e2e not yet added — Playwright is not installed in this repo
- [x] scripts named exactly `lint`, `typecheck`, `test`
- [x] key read from `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; `envPrefix: ['VITE_']`; nothing hardcoded; no secret in code
- [~] no new migration in this PR
- [x] irreversible actions guarded — none added; the new DB writes are insert-only error rows, and the URL sanitisation removes a credential-leak path
- [x] no avoidable debt; memory updated and pruned
- [~] no migrations to explain
- [~] reviewers ran, as ad-hoc agents: this repo still has no `.claude/agents/` swarm installed. Verdicts in `.claude/review/`
- [x] every subagent dispatched on a model below the orchestrator's — never inherited

## For you
**What changed:** the app could crash on two pages and tell nobody why — both of its error screens threw the details away. They now record the error and stamp which build produced it, the member list drops rows too broken to render, and the error log no longer stores password-reset tokens.

**What you do next:** merge (you asked me to merge this one, so I have). Then **hard-refresh the tab** — the crash you photographed was an old bundle still running in an open tab, and only a reload replaces it. If it ever recurs, the error card now shows a `build <sha>`: compare it to the latest commit on `main`, and if they differ it is a stale tab, not a bug.

**How to roll it back:** Cloudflare Pages → Deployments → Rollback to the prior deployment. No schema changed.
