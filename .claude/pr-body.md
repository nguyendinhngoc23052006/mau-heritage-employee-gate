## Intent
Fix the onboarding infinite loop and add real paths in.

Three problems reported: (1) sign-in stuck on onboarding forever — turns out the mega-PR shipped an RLS chicken-and-egg where the first user could never actually become owner of the store they created (only existing managers can insert memberships, but the first user has no membership to insert one with); (2) no password field could be shown to double-check what you typed; (3) the onboarding "waiting for invite" card was a dead-end for anyone opening the app first.

## What changed

### Schema (`supabase/migrations/20260813000000_onboarding_paths.sql`)
- `stores.join_code` — opt-in short random slug; owners regenerate to invalidate.
- New `store_applications` table + `application_status` enum. Applicant-side RLS lets you insert own + select own + withdraw own; manager-side RLS lets owners/managers see + update apps for their store.
- Seven SECURITY DEFINER RPCs (each does its own permission check; RLS stays strict):
  - `create_store_with_owner(name, timezone?, currency?)` — **the fix**. Atomically inserts store + owner membership so the first user can actually onboard.
  - `regenerate_join_code(store_id)` — owner/manager only. 12-char hex slug, unique.
  - `submit_application(join_code, note?)` — any authed user. Rejects unknown codes, existing memberships, and duplicate pending apps.
  - `preview_store_by_code(join_code)` — returns `{id, name}` only. Lets the onboarding page show "you're applying to X" before submit without opening the whole `stores` table to non-members.
  - `approve_application(id, role, employment_type, hourly_rate_cents)` — owner/manager only. Atomic: membership + rate_history + app status.
  - `decline_application(id, reason?)`, `withdraw_application(id)` — same as they sound.
- `set check_function_bodies = off;` at the top for the same reason as the baseline (forward references).

### Types + services
- `Store.join_code`, `StoreApplication`, `ApplicationStatus` added to `src/types/database.ts`.
- `src/services/stores.ts` — `createStore` now calls the RPC. Also `regenerateJoinCode(storeId)`.
- `src/services/applications.ts` (new) — 7 client wrappers for the RPCs above + `listMyApplications` / `listPendingApplications`.

### UI

**`src/components/ui/PasswordInput.tsx` (new)** — reusable Input variant with an eye/eye-off toggle via lucide-react. Aria-labeled `Show password` / `Hide password` (both languages).

**`src/pages/LoginPage.tsx` + `src/pages/InviteAcceptPage.tsx`** — swap `<Input type="password">` for `<PasswordInput>`. Zero other logic change.

**`src/pages/OnboardingPage.tsx` (rewritten)** — one card with two clear sections:
- **Create your own store** (owner path): name input → button → `createStore` RPC → navigate straight into `/store/:id`.
- **Join an existing store** (employee path): paste join code → debounce 400ms → `previewStoreByCode` fetches `{id, name}` and shows "you're applying to: X" → optional message → **Send application** → `submitApplication`. Card then swaps to a "waiting for approval" state that polls every 5s; when the manager approves, the memberships query invalidates and the user lands in the app.
- Small hint at bottom: "have an invite link? open it — you don't need to be here."
- Pending-app state includes a "Withdraw application" button.

**`src/pages/SettingsPage.tsx`** — new "Join code" section, managers only:
- If none set: `Generate join code` button.
- If set: monospace pill + `Copy` (with 2-sec "Copied!" swap) + `Regenerate` (with `window.confirm` since it invalidates the old code).

**`src/pages/PeoplePage.tsx`** — new "Pending applications" section at the top, managers only:
- One row per pending app: applicant short id, submitted time, optional message.
- Inline approve form: role select / employment_type select / hourly_rate input (in VND, parsed via `parseVndToCents`) → **Approve** calls `approveApplication`.
- **Decline** button toggles an inline reason input, then calls `declineApplication`.
- Both invalidate the pending-apps query and the members list.

### i18n
New keys under `onboarding.*` (three sections + pending state + section_or), `store.settings.join_code_*`, `people.applications.*`, `auth.show_password` / `auth.hide_password`. Dropped `onboarding.waiting_invite` and `onboarding.create_store` (superseded). Both `en.json` and `vi.json`.

## Verification
- `npm run typecheck` — 0 errors
- `npm test` — 11 passing
- `npm run build` — succeeds
- `npm run lint` — 0 errors, 4 warnings (pre-existing `noExplicitAny` on event handlers)

## For you
**What changed:** the sign-up flow actually works now — you can create your store as the first user and land straight in the app. If you're not the boss, you can paste a join code your manager gave you and wait for approval. Password fields have an eye toggle so you can see what you typed.

**What you do next:**
1. Review the diff / preview URL (Cloudflare Pages will attach it to this PR).
2. Merge. The apply-migrations workflow will auto-apply the migration (adds the join_code column, applications table, and 7 RPCs to your prod DB). No manual SQL paste this time.
3. Sign in fresh, create your store, land in the dashboard. To test the join flow: **Settings → Generate join code**, copy it, open an incognito window, sign up with a different email, paste the code. Back in the first window, **People → Pending applications** should show it; approve with role=employee, employment_type=hourly, some rate.

**How to roll it back:** revert this PR. The migration only adds — nothing pre-existing is dropped. If you want the schema cleaned too, ask me and I'll draft the reversing SQL (drop applications table, drop the 7 RPCs, drop join_code column).

## Known tradeoffs
- Join code exposes the store's name to anyone who guesses the code. 12 hex chars ≈ 10^14 possibilities; guessing is impractical, but you can regenerate any time.
- Applicant sees their own `store_id` short form in the pending card (couldn't fetch the store name post-submit because non-members can't read `stores`). Not a big deal — the user just came from a page that showed the store name.
- No email to the manager when an application arrives; they see it next time they open the People page. If it becomes annoying we add a `notifications` row on submit — cheap follow-up.
