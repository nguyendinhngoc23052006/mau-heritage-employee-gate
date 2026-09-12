Two pages kept crashing and two correct fixes looked like failures, because
nothing in the app could tell a stale tab from a live bug. This closes the bug
class generically and makes a stale bundle announce itself.

**Intent.** The `/people` and `/payroll` crash (`Cannot read properties of
undefined (reading 'substring')`) was one cache key written by two different
fetches, fixed in 9fec580. Production runs that fix — `/` returns
`Cache-Control: no-cache, must-revalidate`, a rule that exists only as of
bcf704d — and `client_errors` has recorded nothing since 2026-08-14, though
every `/store/:storeId` route has logged through `RouteErrorFallback` since
bcf704d. The reports came from a tab still running a pre-deploy bundle.

**Impact.** A tab that is behind now says so. The same collision class is now a
CI gate over every cache key rather than a grep for the one key that bit us —
which immediately found a second live instance.

### Stale-bundle banner
`vite.config.ts` emits `version.json` holding the same 7-char sha that `define`
bakes into `__BUILD_SHA__`. `src/hooks/useStaleBundle.ts` reads it on mount and
whenever the tab becomes visible (throttled to once a minute, module-scope so a
remount cannot bypass it) and compares. When they differ, `Layout.tsx` shows a
full-width reload bar. `public/_headers` serves `/version.json` no-cache —
a cached copy would report the build the tab is already running.

### Cache-key collision, closed as a class
`src/__tests__/queryKeyShapes.test.ts` was a grep for `["members", …]`. It now
parses all 72 `useQuery` blocks, normalises each `queryFn` into a fetch
signature (null-guard scaffolding and `as` assertions are not differences;
arguments are), groups by the literal key, and fails on any key with more than
one signature. Its second case asserts the scanner still finds ≥60 sites and
≥40 distinct keys, so it cannot pass vacuously.

It found one: `["notifications", "inbox"]` was written by
`listMyNotifications({unreadOnly: true})` on the employee dashboard and
`{unreadOnly: false}` in the inbox. Whichever mounted first decided what the
other showed — open the dashboard, then the inbox within 30s, and the inbox
silently hides every already-read notification. Split into
`["notifications","inbox","unread"]` and `["notifications","inbox","all"]`; the
existing `invalidateQueries(["notifications","inbox"])` calls still match both
by prefix.

### Header contract
`src/__tests__/cacheHeaders.test.ts` asserts `/`, `/index.html` and
`/version.json` are no-cache and `/assets/*` immutable. That file is a
deploy-time contract with Cloudflare that nothing else in the build validated,
and the stale-bundle check is inert if it rots.

**Not changed, deliberately:** the `.substring`/`.slice` fallbacks flagged as
deferred in #43 are not defects. `entity_id` and the attendance-flag `user_id`
are typed `string`, and the one nullable field, `changed_by`, is already inside
a `{rh.changed_by && …}` guard at `src/pages/EmployeeDetailPage.tsx:307`.
Guarding them would be noise.

**Debt I'm leaving:** `IssuePrizeFineModal` computes `memberOptions` even while
closed — harmless now that the shapes agree, but it is why one bug broke two
pages, and it is work done for nothing on every People render.

## Self-check
- [x] base = main; exactly one PR
- [~] no migration in this PR
- [x] tests/lint/typecheck green — 55 tests, 14 files; `biome check` clean; `tsc --noEmit` clean; `vite build` emits `version.json` with the injected sha
- [x] scripts named exactly `lint`, `typecheck`, `test`
- [~] e2e not yet added
- [x] key read from `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; `envPrefix: ['VITE_']`; nothing hardcoded; no secret in code
- [~] no new migration
- [x] irreversible actions guarded + idempotent + flagged — this PR performs no database write
- [x] no avoidable debt; memory updated and pruned
- [~] no migrations to explain
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR
- [x] every subagent dispatched on a model below the orchestrator's — never inherited

## For you
**What changed:** A tab running an out-of-date bundle now shows a reload bar
instead of silently throwing bugs that `main` already fixed. The notifications
inbox no longer hides read notifications when you open the dashboard first. The
cache-key test now covers every key in the app, not just the one that broke
Payroll.

**What you do next:** Review the Cloudflare Pages preview, then merge. No env or
secret action is needed. There is no migration in this PR. To see the banner
work, open the preview, leave the tab, merge, come back to the tab — it should
offer to reload.

**How to roll it back:** Cloudflare Pages → Deployments → Rollback to the prior
deployment. No schema changed, so there is nothing to reverse in the database.
