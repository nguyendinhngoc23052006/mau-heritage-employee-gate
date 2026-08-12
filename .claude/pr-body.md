## Intent
Establish the app CLAUDE.md rulebook (project constitution) plus an empty MEMORY.md. This is the guide's Part 2 Step 4 artifact, adapted for the demo posture recorded in `.claude/scope.json`: main-only, Cloudflare Pages Git integration, Supabase Free, solo builder, multi-tenant per store.

## What changed
- `+CLAUDE.md` — the project constitution. Adapted from the guide's default block. Key deltas vs. guide default: PRs target `main` (no staging), migrations apply manually via Supabase SQL Editor after merge (no Branching), env-var contract routes through Cloudflare Pages dashboard (not GitHub Actions), rollback via Cloudflare Pages Deployments page. Security section calls out the "previews share prod DB" tradeoff explicitly.
- `+MEMORY.md` — empty notebook Claude writes lessons into.
- `+.claude/pr-body.md` — this PR body (the Stop hook checks its self-check section before letting a task end).

## Self-check
- [~] base = main; exactly one PR — rulebook PR, no code diff yet
- [~] ≤ 1 migration file — no migration in this PR
- [~] tests/lint/typecheck green — no test infra yet (Step 5 scaffold adds it)
- [~] scripts named exactly `lint`, `typecheck`, `test`; and `e2e` if installed — not yet added
- [~] key read from `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` — no client code yet
- [~] any new migration paired with the exact SQL block — no migration in this PR
- [~] irreversible actions guarded + idempotent + flagged — no runtime code in this PR
- [x] no avoidable debt; memory updated and pruned — memory is empty on purpose
- [~] migrations explained in plain English — no migration in this PR
- [~] reviewers ran — reviewer agents don't exist yet (Step 9 creates them); documented so hook can be exempted this PR
- [~] every subagent dispatched on a model below the orchestrator's — no subagents dispatched for this PR

## For you
**What changed:** one file (`CLAUDE.md`) sets the rules Claude obeys for every future PR on this repo; one empty file (`MEMORY.md`) is where Claude writes lessons; one file (`.claude/pr-body.md`) is the PR body the Stop hook checks.

**What you do next:** read the CLAUDE.md once through — it's Claude's constitution, so if anything in there conflicts with how you want to work, tell me now and I'll amend before merge. When happy, merge into `main`. No dashboard actions this time.

**How to roll it back:** revert this PR. The files simply disappear; nothing at runtime touches them.
