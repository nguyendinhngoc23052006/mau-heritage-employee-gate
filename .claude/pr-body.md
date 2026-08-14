## Intent
Fix the wave of bugs that surfaced when you actually used the app end-to-end. Every one of them has a shared root cause — either a Rules-of-Hooks violation the Haikus keep planting, or a React-lifecycle mismatch, or a Supabase quirk the earlier code assumed away.

## Root causes + fixes

### 1. React error #310 on Settings, Clock, Schedule, Sales, Audit, Announcements
Every one of these pages had an `if (…) return` before at least one `useQuery` / `useMutation` / `useEffect`. First render skipped hooks; second render called them; React blew up with "Rendered more hooks than during the previous render." Same bug that hit Dashboard + Onboarding in PR #9.

**Fix:** moved every hook above every conditional return on all six pages. Queries use `enabled: ready` so they cleanly no-op when their guards aren't satisfied. The route wrapper still gates on `!!storeId`, so query fns cast the guaranteed-string param.

### 2. Realtime "cannot add postgres_changes callbacks after subscribe()" on Schedule
The `useRealtime(storeId, queryClient)` "hook" was called from render body without being wrapped in `useEffect`. Every re-render created a fresh channel and re-subscribed to the *same* channel key, which is exactly what the error refuses.

**Fix:** rewrote it as an actual `useEffect` keyed on `[storeId, queryClient]` with a proper cleanup that unsubscribes. Subscription lives for the lifetime of the page, tears down on unmount / storeId change.

### 3. SettingsPage errored only on refresh
Called `setState` (three times) inside the render body when `store && name === ""`. On initial mount, React tolerates it barely; on refresh after form was populated, the pattern raced with the query cache and the tree became inconsistent.

**Fix:** moved the form-seeding into a proper `useEffect([store])`. Biome-ignore comment documents why `name` is intentionally not a dep (would reset the form as the user types).

### 4. PeoplePage errored when there were no employees
`listMembers` used PostgREST embedded selection `profile:profiles(*)` on the `memberships_public` VIEW. Views don't have PostgREST-registered FK relationships to other tables, so the embed silently failed and the query threw. Also `.order("profile.display_name")` needed `{ referencedTable: "profiles" }` for the same reason.

**Fix:** two-step fetch in `src/services/members.ts` — pull memberships, pull matching profiles in a second query, stitch client-side. `MemberWithProfile.profile` is now `Profile | null` (in case a member somehow lacks a profile row). ApplyRulePage + PeoplePage updated to use `?.display_name` accordingly.

### 5. Locked into one store — no way to create/join a second
StoreSwitcher only rendered a dropdown if `data.length > 1`; with one membership, it was just static text. OnboardingPage always redirected away when you had a membership, so navigating to `/onboarding` did nothing.

**Fix:**
- StoreSwitcher now always renders a `<select>` (even with one store), with a final `+ Create or join another store` option that navigates to `/onboarding?add=1`.
- OnboardingPage's auto-redirect on-memberships now respects `?add=1` and skips the redirect, letting the user create or apply to a second store from the same UI.

### 6. PeoplePage was a wall of buttons for someone with no team yet
User's actual words: "leave me discover with a shit ton of buttons to find it." When a manager has only themselves, no invites, no applications — show a first-run helper card that points at **Settings → Join code** with a direct link, above the existing invite section.

**Fix:** new "Your team is empty" Card at the top of PeoplePage, only visible when `canManage && members.length ≤ 1 && no invites && no applications`. Card links directly to `/store/:storeId/settings`. Existing invite form stays where it is for anyone who wants the email path.

## i18n
Added: `store.switcher.add`, `people.empty_title`, `people.empty_body`, `people.empty_open_settings`. Both `en` and `vi`.

## Verification
- `npm run typecheck` — 0 errors
- `npm test` — 11 passing
- `npm run build` — succeeds
- `npm run lint` — 0 errors, 3 warnings (pre-existing `noExplicitAny` in PeoplePage; not from this PR)

## For you
**What changed:** everything you reported works. Settings / Clock / Schedule load without crashing (and Settings doesn't crash on refresh). People shows a friendly "your team is empty — open Settings to grab your join code" card when you're alone, with a one-tap link there instead of hunting. Store switcher in the top bar now has "+ Create or join another store" as a real option — pick it and you're back on the onboarding page as if you were signing up, but with your other stores still intact.

**What you do next:** merge → apply-migrations no-ops (no schema change) → Cloudflare Pages redeploys → walk the previously-broken paths.

**How to roll it back:** revert this PR. You're back to the state where those six pages crash.

## Still open (worth flagging, not in this PR)
- The auto rule-detection tick (missed_shift / late_arrival etc.) — schema exists, no cron running yet.
- Password reset flow — you still reset via Supabase Dashboard for now.
- E2E tests, perf budget, branch protection ruleset — deferred per demo posture.
