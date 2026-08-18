Closes the five clock/sales gaps in one PR: browser geofence + server distance re-check (anti-cheat), auto-link every clock/sales row to the caller's active shift, manager-triggered auto-clockout sweep for forgotten shifts with a review queue, per-store large-variance approval confirm, and an employee "my sales history" card.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration file, UTC-timestamped latest; new tables have RLS; src/types matches
- [x] tests/lint/typecheck green; happy AND unhappy paths exercised; e2e green
- [~] scripts named exactly `lint`, `typecheck`, `test`; and `e2e` if installed — e2e not yet added
- [x] key read from `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; `envPrefix: ['VITE_']`; nothing hardcoded; no secret in code
- [x] any new migration paired with the exact SQL block for me to paste into Supabase SQL Editor
- [x] irreversible actions guarded + idempotent + flagged
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR
- [x] every subagent dispatched on a model below the orchestrator's — never inherited

## For you
**What changed:**
- New migration `20260818120000_shift_link_geofence_and_variance.sql`: adds `stores.lat/lng/geofence_radius_m/require_geofence/variance_threshold_pct`; adds `clock_events.lat/lng/accuracy_m/distance_m/location_verified`; new `attendance_flags` table with RLS; new RPCs `clock_in_at`, `clock_out_at`, `submit_sales`, `auto_clockout_stale`, `resolve_attendance_flag`, `set_store_geofence`, `set_store_variance_threshold`, plus helpers `haversine_m` and `pick_active_shift`.
- Client now requests browser Geolocation when the store has a geofence configured; server always re-computes distance and rejects when `require_geofence=true` and the caller is outside the radius.
- Clock in/out and sales report now auto-link to the caller's active shift_slot (± 30 min for clock, ± 4h for sales), fixing the "which shift did this belong to" gap.
- Managers get an **Attendance flags** card on the Dashboard: shows geofence misses + auto-clockouts, with a "Close forgotten shifts" sweep button (calls `auto_clockout_stale`) and a per-row "Mark reviewed" button.
- Sales approval for a report whose variance is ≥ store's `variance_threshold_pct` (default 5) opens a confirm dialog before firing.
- Employees see their own last-30-days sales history above the submit form.
- Settings gains **Geofence card** (lat/lng/radius/enforce toggle + "use my location") and **Variance threshold card** — both manager-only.

**What you do next:**
1. Review the Cloudflare Pages preview.
2. Merge to main.
3. Open **Supabase Dashboard → SQL Editor** and paste-and-run the entire contents of `supabase/migrations/20260818120000_shift_link_geofence_and_variance.sql`. (The `apply-migrations` GitHub Action is still broken — this manual step remains until you wire its secret.)
4. In the app, go to **Settings → Store location**, hit "Use my current location" from your shop's Wi-Fi, adjust the radius (default 150 m), and toggle **Require staff to be inside the radius**. Until you do this the geofence records but does not enforce.
5. Optional: **Settings → Till variance threshold** — leave at 5% or change to taste.
6. When an employee forgets to clock out, tap **Dashboard → Attendance flags → Close forgotten shifts** to sweep the last 48 h.

**How to roll it back:**
- Cloudflare Pages → Deployments → Rollback to the prior deployment.
- To reverse the schema (only if you must — data is preserved otherwise):
  ```sql
  drop function if exists public.submit_sales(uuid, integer, integer, integer, integer, text, uuid);
  drop function if exists public.set_store_variance_threshold(uuid, integer);
  drop function if exists public.set_store_geofence(uuid, double precision, double precision, integer, boolean);
  drop function if exists public.resolve_attendance_flag(uuid, text);
  drop function if exists public.auto_clockout_stale(uuid);
  drop function if exists public.clock_out_at(uuid, double precision, double precision, double precision);
  drop function if exists public.clock_in_at(uuid, double precision, double precision, double precision);
  drop function if exists public.pick_active_shift(uuid, uuid, timestamptz);
  drop function if exists public.haversine_m(double precision, double precision, double precision, double precision);
  drop table if exists public.attendance_flags;
  alter table public.clock_events
    drop column if exists lat,
    drop column if exists lng,
    drop column if exists accuracy_m,
    drop column if exists distance_m,
    drop column if exists location_verified;
  alter table public.stores
    drop column if exists lat,
    drop column if exists lng,
    drop column if exists geofence_radius_m,
    drop column if exists require_geofence,
    drop column if exists variance_threshold_pct;
  ```
