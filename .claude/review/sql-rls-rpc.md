# sql-rls-rpc — autonomous migration flow

Verdict: **PASS.**

- No migration, no schema, no RLS, no RPC, no grant touched.
- The deleted `migration repair` blocks were verified inert before removal: recorded
  history in `supabase_migrations.schema_migrations` is exactly the 16 files in
  `supabase/migrations/`, same versions in the same order. Nothing to reconcile.
- The break-glass path is the important addition — it permits a hand-apply under
  outage but requires `migration repair --status applied` immediately after, which
  is precisely the step whose absence caused the original desync.
- Re-runnable-DDL check added to the self-check closes the second half: an unguarded
  `add constraint` is what escalated a desync into a hard failure.
