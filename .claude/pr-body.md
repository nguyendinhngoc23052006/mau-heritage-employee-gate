**Intent:** Make schema delivery fully autonomous. The `apply-migrations` workflow becomes the only applier, and `CLAUDE.md` stops telling you to paste SQL into the dashboard.

**Impact:** Docs + workflow only. No app code, no migration, no schema change.

## The contradiction being removed

`CLAUDE.md` documented hand-applying migration SQL through the Supabase SQL Editor. The `apply-migrations` workflow pushed the same files. Both were live, neither knew the other existed, and running one corrupted the other's bookkeeping — hand-run SQL never writes to `supabase_migrations.schema_migrations`, so the schema ran ahead of its recorded history and the next `db push` died replaying work that was already applied. That is what cost ten days across PRs #28–#33, and it would have recurred on the next migration.

## What changed

**`CLAUDE.md`** — five places instructed a manual apply; all now point at the workflow:
- Migrations section: "never change a DB by hand or through the dashboard SQL Editor. Merging *is* applying," plus an explicit note on *why* hand-apply desyncs, so the reasoning survives the next reader.
- Added a break-glass path: if the workflow is down, apply by hand **then** reconcile with `supabase migration repair --linked --status applied <version>`. The failure mode was never hand-applying — it was hand-applying without recording.
- Feature-flag rule no longer says "+ manual SQL apply".
- Every-PR rule no longer demands a verbatim SQL block for you to run.
- Self-check swaps that line for one that actually prevents the failure: **new DDL must be re-runnable** (`if not exists` / `drop ... if exists`). An unguarded `add constraint` is what turned the desync into a hard stop.
- "For you" block no longer asks for pasteable SQL.

**`supabase/CLAUDE.md`** — same correction, one line.

**`.github/workflows/apply-migrations.yml`**:
- Deleted both `migration repair` blocks. They hardcoded the specific historical ghost timestamps and hand-applied versions, ran on every future migration, and swallowed failures with `|| true`. Verified they are now no-ops: recorded history is exactly the 16 files in `supabase/migrations/`, byte for byte, so there is nothing left to reconcile.
- **`supabase link` now retries 3× with backoff.** It intermittently fails with `Failed to get API keys for project` and succeeds on retry with the same token — run #18 hit it, attempt 2 sailed through. Without the retry that leaves a migration unapplied until a human notices a red run, which is exactly the non-autonomy being removed.
- Kept the `config.toml` stub, with the comment trimmed to the reason rather than the archaeology.

**`MEMORY.md`** — records the settled flow, the retry, the stub, the re-runnable rule, and the lesson that schema must be verified against the database rather than a green workflow.

## Note on editing the constitution

`CLAUDE.md` is marked read-only to me and I flagged this rather than changing it across three separate PRs. Editing it here is on your explicit instruction to make the app autonomous. The scope block stays untouched — it is still accurate and still `/refresh`-generated.

## Self-check
- [x] base = main; exactly one PR
- [~] no migration file in this PR; no schema change; `src/types` untouched
- [x] tests/lint/typecheck green — 42/42 tests, lint exit 0 (8 pre-existing warnings from #38), 0 tsc across 154 files
- [x] scripts named exactly `lint`, `typecheck`, `test`
- [~] e2e not yet added
- [~] no env/key change
- [~] no new migration to guard
- [~] no irreversible action — the workflow's behaviour is unchanged apart from retrying a transient failure
- [x] no avoidable debt; deleted the hardcoded repair lists rather than leaving them to run forever
- [x] migration flow explained in plain English below
- [x] reviewers ran — `.claude/review/*` refreshed this PR
- [~] no subagent dispatched — docs + one workflow, verified directly

## For you
**What changed:** Migrations now apply themselves on merge, and the rulebook says so. You no longer paste SQL into Supabase for a normal change. The workflow retries the one transient Supabase failure that used to need a manual re-run, and the one-off repair commands from the ten-day incident are gone now that history and the repo match exactly.

**What you do next:** Review and merge. Nothing to do in Supabase or Cloudflare. This PR touches no migrations, so `apply-migrations` will not fire — the next PR that adds one is the real test, and it should apply with no action from you.

**How to roll it back:** Revert the commit. That restores the manual-apply wording and the old workflow; nothing in the database changes either way.
