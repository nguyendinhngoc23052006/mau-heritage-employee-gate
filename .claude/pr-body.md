Re-scopes the app from "one store per owner" to Kwook Việt Nam's internal gate:
a three-tier organisation above the stores, enforced in the database, with the
sysadmin bootstrapped and the tier-1 / director consoles to run it.

**Intent.** Tier 1 (sysadmin — `nguyendinhngoc23052006@gmail.com` — and a CEO
the sysadmin appoints) shapes the organisation: sectors ("khối") and their
directors. Tier 2 directors create units ("bộ phận" — the existing `stores`)
under their sector and appoint tier-3 managers. Managers run employees. One
rule holds everywhere: you act only on people strictly below you, inside your
own branch, and assign only roles below your own tier. Everyone edits their own
profile; whoever is above you can read it.

**Impact.** The existing 60 RLS policies are untouched: `is_member_of()` and
`has_role_on()` became hierarchy-aware, so a director or tier 1 gets, on every
store in their branch, exactly what that store's managers have. `set_role()` is
now the only way any role changes; two triggers make every other path fail.
Self-service store creation, join-by-code onboarding and ownership transfer are
gone from the UI and their RPCs dropped — people are placed from above.

### Migration `20260915090000_org_hierarchy.sql` — in plain English
- Adds `profiles.global_role` (sysadmin | ceo), a `sectors` table,
  `stores.sector_id`, and `sector_memberships` (directors). RLS on both new
  tables; nobody can write `sector_memberships` or `global_role` except through
  `set_role()`.
- Adds `tier_of`, `my_tier`, `role_tier`, `oversees_sector`, `oversees_store`,
  `can_act_on`; redefines `is_member_of` / `has_role_on` to include whoever is
  above the store.
- Adds `set_role(target, scope, scope_id, role)` — scope `global` (CEO,
  sysadmin only), `sector` (director, tier 1 only), `store` (manager | employee,
  anyone managing the store, roles below their own tier only). Target must be
  strictly below the caller. Store-level changes are audited by the existing
  `audit_memberships` trigger.
- Guard triggers on `memberships` (role, active, DELETE) and
  `profiles.global_role`; a plain employee insert and a reactivation are still
  allowed so invites and applications keep working. A manager-role invite or
  approval now raises — the UI offers employee only; promote afterwards.
- `write_audit` fixed for tables without `id` and for stores mid-deletion.
- `enforce_store_has_owner` now only guards detached (legacy) stores; a store in
  a sector answers to its director and needs no owner.
- `stores` insert requires a sector the caller oversees. `delete_store` is
  allowed for whoever is above the store.
- Drops `create_store_with_owner`, `reclaim_store`, `transfer_ownership`,
  `list_my_orphaned_stores`.
- Bootstraps the sysadmin by email, idempotently.

**Verified before opening this PR — against the production schema, rolled back.**
The SQL tool honours `begin; … rollback;` in one call (proved first with a
temp-table probe). The whole migration ran inside such a call, followed by a
scenario with six synthetic users acting through `request.jwt.claims`:
sysadmin appoints CEO and a director; director creates a unit and appoints a
manager; manager adds and removes employees; then every forbidden move —
director appointing a director, manager appointing a peer, CEO removing the
sysadmin or appointing a CEO, anyone changing their own role, promoting /
deactivating / hard-deleting over a direct table write, an outsider adding an
employee — each refused with the intended message; reactivation, self
`employment_type` edits, `delete_store` with its cascade, and an admin user
deletion with no JWT all succeed. 24 write steps and 17 read probes (`tier_of`,
`can_act_on`, `is_member_of`, owner-level `has_role_on` for a director) all
matched expectation. A follow-up query confirmed nothing persisted: no synthetic
users, no new column, no new function. Nothing was applied; the
`apply-migrations` workflow applies it on merge, as always.

**What the reviewers and the scenario changed.** Three findings, all fixed
here: (1) a hard `DELETE` of a membership, and (2) a direct `active = false`
update, both skipped every tier check — a manager could remove a peer — so
`guard_role_write` now watches DELETE and `active` too, and PeoplePage
deactivates through `set_role(…, 'none')`; (3) twelve store pages still gated on
the old `isManagerRole(useRoleOn())`, so a director saw tabs that then said
"Access denied" — every page now reads `useStoreAccess`. Smaller: `set_role`
clears its bypass flag before every return; `EmployeeDetailPage` no longer
flashes "Access denied" while loading; a failed `me` fetch is an error, not
tier 4; the role Select always shows the row's current role.

**Two pre-existing bugs fixed because the scenario hit them:** `write_audit`
wrote `NULL` into `audit_log.entity_id` on any DELETE from a table without an
`id` column (`memberships` is keyed `user_id + store_id`) and, when a store was
being deleted, audited cascaded rows against a store already gone (FK
violation). Every membership delete, `delete_store` and deleting an auth user
failed on `main` because of this.

**To reverse the schema:** drop the two guard triggers and their functions,
`set_role`, `can_act_on`, `oversees_store`, `oversees_sector`, `role_tier`,
`my_tier`, `tier_of`; restore `is_member_of` / `has_role_on` /
`enforce_store_has_owner` / `delete_store` / `profiles_self_select` /
`stores_insert_any_auth` from `20260812010000_baseline.sql` and
`20260819120000_close_all_gaps.sql`; drop `stores.sector_id`,
`sector_memberships`, `sectors`, `profiles.global_role`, type `global_role`.
The four dropped RPCs would need re-creating from
`20260823120000_mega_role_dashboards_shifts_prize_fine_selfservice.sql` and
`20260819120000_close_all_gaps.sql`.

### Client
- `src/lib/tier.ts` mirrors `role_tier` / `tier_of` so the UI never draws a
  button the RPC refuses; tested against the same matrix.
- `src/services/org.ts` — sectors, directors, stores-in-sector, `setRole`,
  directory. `useMe()` derives my tier; `useStoreAccess(storeId)` answers
  "can I enter / manage this store" for members and overseers alike, and
  replaces `isManagerRole(useRoleOn())` in Nav, StoreMemberGate,
  EmployeeDetailPage, PeoplePage, DangerZoneCard.
- `/org` (tier 1 and directors): leadership, sectors, directory.
  `/org/sector/:id`: directors, units, create unit, appoint manager.
- PeoplePage: role changes go through `setRole`; options are filtered by
  `canAssign`, the control is disabled unless `canActOn`; invites and
  application approvals offer employee only. `owner` remains visible on legacy
  rows but is no longer assignable.
- OnboardingPage rewritten: tier ≤ 2 → `/org`; a member → their store; anyone
  else sees "Chờ phân công" and a sign-out button. StoreSwitcher loses "+ add".
- `/reset-scope`: `.claude/scope.json` moved to schema v2 with the new answers;
  the constitution's `## Scope` block regenerated from it. Nothing else in
  `CLAUDE.md` changed.

**Existing data:** you chose "start Kwook clean". The 4 Màu Heritage stores stay
in the DB with `sector_id = null`; you (tier 1) can still open them. Deleting
them is a separate, explicitly approved PR.

**Security — abuse cases and how they are blocked:**
- Privilege escalation via direct table write → guard triggers raise `42501`
  on any role/global_role write without the `set_role` flag; RLS has no insert
  policy on `sector_memberships`.
- Acting across branches or upward → `set_role` checks `tier_of(target) >
  my_tier()` and `has_role_on`/`oversees_*` on the scope; `can_act_on` scopes
  profile reads the same way.
- Self-promotion → `p_target = auth.uid()` raises.
- CEO touching the sysadmin → global scope requires the caller's own row to be
  `sysadmin`; setting CEO skips rows already `sysadmin`.

**Accepted regression:** a plain legacy owner (tier 3) can no longer appoint
managers — owner is a manager in this model. The only legacy owner in
production is you, at tier 1, so nobody is affected.

**Debt I'm leaving:** sector- and global-scope role changes are not audited
(`audit_log.store_id` is NOT NULL) — needs a nullable column or a separate
`org_events` table; directors cannot see unassigned accounts, so they onboard by
invite (employee) then promote — a "request placement" flow may be wanted;
`IssuePrizeFineModal` still maps options while closed. 36 `t()` keys under
`employee_detail.*`, `delete_store.*`, `danger_zone.*`, `people.resend*` were
already missing from both dictionaries on `main` (they render as their key);
not touched here.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration file, UTC-timestamped latest (`20260915090000`); new tables have RLS; src/types matches
- [x] tests/lint/typecheck green — 77 tests, 16 files; `biome check` clean; `tsc --noEmit` clean; `vite build` clean; migration + 41-step scenario green against the production schema and rolled back
- [x] scripts named exactly `lint`, `typecheck`, `test`
- [~] e2e not yet added
- [x] key read from `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; `envPrefix: ['VITE_']`; nothing hardcoded; no secret in code
- [x] any new migration is re-runnable — `if not exists` / `create or replace` / `drop … if exists` throughout; bootstrap is a conditional update
- [x] irreversible actions guarded + idempotent + flagged — no destructive write; the only data change is one conditional update on one profile row
- [x] no avoidable debt; memory updated and pruned (57 lines)
- [x] migrations explained in plain English
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR
- [x] every subagent dispatched on a model below the orchestrator's — never inherited

## For you
**What changed:** Your account becomes sysadmin (tier 1) the moment this merges. A new "Tổ chức" page lets you create sectors, appoint directors and a CEO; directors create units and appoint managers; managers add employees. Role changes are enforced by the database — strictly downward, inside your branch. Self-service store creation and join codes are gone; new people are invited by email or placed from above.

**What you do next:** Open the Cloudflare Pages preview, sign in, and confirm "Tổ chức" appears in the header — that proves the preview reads the new tier from the DB only after merge, so on the preview you will still look like a plain owner (the migration has not applied yet; that is expected). Merge. The `apply-migrations` workflow applies the migration; confirm it landed by reloading production and seeing "Tổ chức" in the header. No env or secret action is needed.

**How to roll it back:** Cloudflare Pages → Deployments → Rollback to the prior deployment for the UI. The schema reversal is spelled out above under "To reverse the schema"; ship it as a new forward migration.
