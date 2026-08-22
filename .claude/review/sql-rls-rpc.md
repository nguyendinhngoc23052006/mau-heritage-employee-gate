# SQL / RLS / RPC — verdict for header-cleanup-and-geoguard-ia4u9p

**Scope:** no schema change in this PR — client + `public/_headers` config + i18n only. No migration file added, no RPC signature changed, no RLS policy touched.

Verified via `git diff main..HEAD -- 'supabase/**'` = empty. Nothing under `supabase/migrations/` was modified; no new SQL surface to audit. Existing 8-file migration history from prior PRs (baseline → onboarding → hardening → shift_slots → release-slot → approve-swap → geofence → lock-writes → close-all-gaps) untouched.

Server-side RPCs referenced by the touched client (`clock_in_at`, `clock_out_at`, `set_store_geofence`, `getStore`) still match their post-`close_all_gaps` signatures. No client call was widened past what the server accepts. `set_store_geofence` still refuses `p_require=true` with null coords (client-side `canSave` also blocks that combo — belt-and-braces).

No RLS/RPC finding for this PR. Sign-off: PASS.
