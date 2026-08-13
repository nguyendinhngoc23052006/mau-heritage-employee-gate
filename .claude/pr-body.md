## Intent
Swap magic-link auth for straight email + password sign-in. No email verification round-trip; type email + password, hit Enter, in.

## What changed
- `src/services/auth.ts` — `sendMagicLink` → `signInWithPassword(email, password)` + `signUpWithPassword(email, password)`.
- `src/pages/LoginPage.tsx` — two-field form (email + password) with a toggle between **Sign in** and **Create account**. Preserves the `?return=` param so the invite flow can bounce through login and come back.
- `src/pages/InviteAcceptPage.tsx` — if the invitee isn't signed in, the page now renders an inline sign-up form (defaults to sign-up; toggles to sign-in). Once auth completes, the `useEffect` calls `accept_invite` automatically and redirects to `/store/:id`.
- `src/pages/CallbackPage.tsx` — collapsed to a safe redirect: signed-in users go to `/onboarding`, everyone else to `/login`. Route kept so any stale magic-link URL floating around still lands somewhere sensible.
- `src/services/auth.test.ts` — replaced the magic-link test with two mocked tests: one for `signInWithPassword`, one for `signUpWithPassword`.
- `src/i18n/{en,vi}.json` — added `auth.password_label`, `auth.signin_button`, `auth.signup_button`, `auth.switch_to_signup`, `auth.switch_to_signin`, `auth.signup_title`, `invite.accept.signup_prompt`, `invite.accept.signin_prompt`. Removed the `send_link` / `link_sent` keys that no longer render.

## Nothing else touched
DB schema, RLS, service layer for other tables, all other pages, router shape, i18n keys outside the auth strings.

## Verification
- `npm run typecheck` — 0 errors
- `npm test` — 11 passing (auth tests replaced with the two new ones)
- `npm run build` — succeeds
- `npm run lint` — 0 errors, 4 warnings (same as before — `noExplicitAny` on event handlers)

## For you
**What changed:** login is now email + password. Sign up = pick a password on first visit, sign in = same fields every time after. Invite links land on a sign-up form (or sign-in toggle) then auto-accept once you have a session.

**What you do next:**
1. **One Supabase dashboard toggle:** Authentication → **Providers → Email** → toggle **Confirm email OFF**. (Otherwise sign-up still emails a verification link, and users can't sign in until they click it — defeats the point.)
2. Review the diff / preview.
3. Merge PR. Cloudflare Pages auto-redeploys `main`. No DB migration in this PR, so `apply-migrations` will run and no-op.
4. Sign in fresh with your email + a password you pick.

**How to roll it back:** revert this PR. Old magic-link code returns. You'll also want to flip **Confirm email** back **ON** in the Supabase dashboard if you rely on it in the magic-link flow.

## Known tradeoffs (recorded)
- Sign-up is open (any email can create an account) — same posture as the magic-link version. RLS still blocks non-members from data.
- No password-reset flow. If a user forgets their password: you reset it for them in Supabase Dashboard → Authentication → Users → click the user → Reset password. Fine for a demo; if it becomes annoying, ask me to add a self-service "Forgot password?" flow.
- No rate limiting on sign-in attempts beyond Supabase's built-in defaults. If you see someone hammering, tighten in Supabase Auth settings.
