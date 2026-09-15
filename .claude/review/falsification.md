# Falsification review — "only strictly below, only inside your branch, nothing bypasses it"
Reviewed: migration, `src/lib/tier.ts`, `services/org.ts`, hooks, PeoplePage, Org/Sector pages
Verdict: **2 CONFIRMED counterexamples, both fixed; 1 regression accepted and documented; 2 notes**

## CONFIRMED — fixed
1. **Deactivate bypassed the tier check.** `deactivateMember` did `update memberships set active=false`;
   the guard only watched `role`, and `memberships_manager_update` has no strictly-below check, so a
   manager could remove a peer manager. Fixed: `guard_role_write` now also watches `active` (a
   true→false without the flag raises; reactivation stays allowed for invites), PeoplePage
   deactivates through `setRole(…,'none')`, and the button is disabled unless `canActOn`.
2. **SectorPage could offer a candidate the RPC refuses.** Fixed: the sector's own directors are
   excluded from the manager list; RLS already hides everyone at or above the caller.

## Accepted regression — documented
- A plain legacy owner (tier 3) can no longer appoint managers (`role_tier('manager') = 3 <= 3`).
  Owner is a manager in this model; the only legacy owner in production is the sysadmin (tier 1).

## Notes
- `approve_application(p_role)` with a crafted non-employee role fails on the guard (safe, not a 403).
- Bootstrap flag uses `is_local=false` and is reset at the end of the file.

## Blocked, traced
A direct writes (`guard_role_write`, no write policy on `sector_memberships`, `guard_global_role_write`) ·
B cross-branch reach (`oversees_store` gates `is_member_of`/`has_role_on`) · C peer/upward moves
(self check, `role_tier <= v_my`, sector scope tier 1 only, global scope literal `sysadmin`) ·
D visibility (`can_act_on` + same-store) · E `enforce_store_has_owner` skips sector stores · F flag
is transaction-local; now also cleared before every return.

## Live scenario (executed against the production schema, rolled back)
`begin; <migration>; <30-step scenario as six synthetic users>; rollback;` — every write path
behaved as specified; see the PR body for the list. It also surfaced two pre-existing bugs in
`write_audit` (NULL `entity_id` on DELETE for `memberships`; FK violation when the store is
mid-deletion) that made every membership delete, `delete_store` and user deletion fail — fixed here.
