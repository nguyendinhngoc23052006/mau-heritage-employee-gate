# Database-security review — org hierarchy migration (20260915090000)
Reviewed: `claude/heritage-gate-part-2-ia4u9p`, migration + baseline/close_all_gaps + invite/application paths
Verdict: **1 CONFIRMED finding, fixed in this PR; 2 flags accepted and documented; rest OK**

## CONFIRMED — fixed
- **Hard delete bypassed `set_role`.** With hierarchy-aware `has_role_on`, `memberships_owner_delete`
  (`baseline.sql:489`) let an overseer — and always let a legacy owner — `DELETE` a membership over
  REST; nothing guarded DELETE. Fixed: `guard_role_write` now fires on DELETE and raises unless the
  `set_role` flag is set or there is no JWT (admin/service call, or a cascade from `auth.users`).
  `delete_store` sets the flag around its cascade. The overseer = owner-level semantics of
  `has_role_on` are kept on purpose (a sector store has no owner; its settings must be editable by
  someone) and now stated in the migration.

## Flags — accepted
- Manager-role invites / application approvals now raise `42501` (guard). The UI offers employee
  only for both; people are promoted afterwards through `set_role`. Documented in the PR.
- Bootstrap has no recovery path if the named account did not exist at merge — it does
  (verified in the DB), and the dry run proved the row lands.

## OK (traced)
1 recursion: none, all helpers security-definer owned by postgres · 2 `guard_role_write` blocks every
direct role write · 3 `guard_global_role_write` covers INSERT and UPDATE · 4a–h `set_role` branches,
including transaction-local flag (now also cleared before each return) · 5 `profiles_self_select`
scopes reads to branch · 6 no write policy on `sector_memberships`, grants consistent · 7 store
insert requires an overseen sector, legacy self-insert dropped · 9 `delete_store` consistent with R1 ·
10 no caller of the four dropped functions remains.
