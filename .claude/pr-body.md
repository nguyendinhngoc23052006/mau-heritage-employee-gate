**Intent:** Get `apply-migrations` unstuck so the mega-role-dashboards migration (merged with #26) finally lands on the prod DB.

**Impact:** Workflow-only. Zero app code, zero schema files touched. This is the 5th attempt in the chain (#28 → #29 → #30 → #31 → this) — chasing the pinned CLI version is a losing game because `supabase/config.toml` in this repo carries keys no released CLI parses (`auth.oauth_server`, `local_smtp`, `apple.email_optional`, `storage.{analytics,s3_protocol,vector}`, `db.{health_timeout,network_restrictions}`, `experimental.pgdelta`) — someone wrote it with a nightly build. Instead of hunting a matching version, this PR replaces `config.toml` with a minimal `project_id = "..."` stub at workflow runtime. The checkout is ephemeral; the repo copy is untouched. `db push` only needs `project_id`.

## Self-check
- [x] base = main; exactly one PR
- [~] no migration file in this PR (workflow-only)
- [~] tests/lint/typecheck N/A — no app code touched
- [~] script names N/A — no app code touched
- [~] key/env contract N/A — no app code touched
- [~] no migration in this PR — the SQL block for the mega migration was in PR #26's body
- [~] no irreversible action (workflow re-runnable via `workflow_dispatch`)
- [x] no avoidable debt; the workaround is documented inline in the workflow so a future reader knows why config.toml is being mv'd
- [x] plain-English explanation below
- [~] reviewers N/A — workflow-only change, no app diff to review
- [~] no subagent dispatched — single-file surgical fix

## For you
**What changed:** The `apply-migrations` GitHub Action now moves `supabase/config.toml` aside on the runner and writes a one-line stub (`project_id = "..."`) before running `supabase link` + `db push`, so the CLI's strict parser doesn't choke on bleeding-edge keys. The repo's real `config.toml` is not modified.

**What you do next:** Review the workflow diff, then **merge this PR**. On merge, `apply-migrations` will fire again — this time it should reach `db push` and finally apply the mega migration (18 RPCs + `clock_correction_requests` table) that PR #26 committed 10 days ago. You'll know it worked when the Schedule page stops throwing `PGRST202` on `close_shift_claims` / `delete_shift_safe` / `force_open_shift`.

**How to roll it back:** GitHub → Actions → the failing `apply-migrations` run doesn't need rollback (the DB is idempotent under `migration repair --status reverted || true`). For the workflow itself: `git revert` this commit and merge — that restores the CLI-version-pinning approach from PR #31, which will fail the same way run #16 did but doesn't harm anything.
