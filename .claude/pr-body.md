## Intent
Scaffold the minimal Vite + React + TypeScript baseline that builds green and is ready to connect to Supabase and Cloudflare Pages. This is the guide's Part 2 Step 5 artifact, adapted for the demo posture: no `wrangler.jsonc` (Pages Git integration handles deploy), no per-branch build workflows.

## What changed
- **App shell** — `index.html`, `src/main.tsx` (dynamic-import App; startup errors render as visible text in `#root` so a deploy never shows a blank page), `src/App.tsx` (one page), `src/vite-env.d.ts`.
- **Supabase client** — `src/lib/supabaseClient.ts` factories `buildSupabaseClient(env)` (throws readable errors when either VITE_ name is missing) and a lazy `getSupabase()` singleton. Mocked unit tests in `src/lib/supabaseClient.test.ts` prove the client builds from the two names and rejects each absent variant.
- **Build config** — `vite.config.ts` with `envPrefix: ['VITE_']` and React plugin. `vitest.config.ts` (split to sidestep a Vite/Vitest duplicate-vite type conflict). `tsconfig.json` (strict, ES2022 module bundler). `biome.json` (replaces ESLint + Prettier).
- **SPA routing on Pages** — `public/_redirects` with `/* /index.html 200` so client-side routes work on hard reload.
- **Supabase project skeleton** — `supabase/config.toml` (from `npx supabase init`; `[db.seed]` on with `sql_paths = ["./seed.sql"]` by default; `project_id` left at its default local label — not the remote ref). `supabase/migrations/20260812000000_init.sql` enables `pgcrypto` only. `supabase/seed.sql` is a placeholder.
- **CI-ready scripts + Dependabot** — `package.json` scripts named exactly `lint` / `typecheck` / `test` (a CI contract for Step 10). Committed `package-lock.json`. `.github/dependabot.yml` (weekly npm + github-actions, grouped).
- **Env + ignore** — `.env.example` with the two VITE_ names as placeholders. `.gitignore` covers node_modules, dist, coverage, .env variants, Playwright artifacts (for later), and Supabase CLI local state. **Deliberately does NOT ignore `.claude/scope.json`** — cloud sessions are ephemeral, so we commit scope for durability (deviation from guide default recorded on PR #1).
- **Folder memories** — `src/CLAUDE.md` (components render; services validate) and `supabase/CLAUDE.md` (migrations append-only, UTC-named, demo posture applies manually).

## Local verification
- `npm run lint` — green (Biome, 11 files checked)
- `npm run typecheck` — green (strict TS)
- `npm test` — green (3/3 tests: builds client from valid env; each missing name throws its own message)
- `npm run build` — green (dist/ ~416 KB uncompressed / ~119 KB gzip; well under any budget we'd set)

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration file, UTC-timestamped latest; only enables pgcrypto (no new tables ⇒ no RLS to add here); src/types not yet needed
- [x] tests/lint/typecheck green; happy AND unhappy paths exercised
- [~] e2e not yet added (Playwright installs in Step 10)
- [x] scripts named exactly `lint`, `typecheck`, `test`
- [~] `e2e` script not yet added
- [x] key read from `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; `envPrefix: ['VITE_']`; nothing hardcoded; no secret in code
- [x] migration paired with the exact SQL block below
- [x] irreversible actions guarded + idempotent + flagged — no runtime writes yet
- [x] no avoidable debt; memory: added `src/CLAUDE.md` and `supabase/CLAUDE.md` folder memories
- [x] migration explained in plain English (see below)
- [~] reviewers ran — reviewer agents don't exist yet (Step 9 creates them); exempted this PR
- [~] every subagent dispatched on a model below the orchestrator's — no subagents dispatched

## For you
**What changed:** the app is now a real Vite + React + TS project that builds, lints, and tests green. It's shaped for Cloudflare Pages Git integration (no wrangler config; Pages will run `npm run build` and serve `dist/`). It has a Supabase client that reads two VITE_ names and throws readable errors if either is missing, plus a first migration that just turns on `pgcrypto`.

**What you do next:**
1. Review the PR and the CI-less checks in your head (I ran them locally: lint, typecheck, tests, build — all green).
2. Merge into `main`.
3. **Paste this SQL into Supabase Dashboard → SQL Editor → Run** (the demo-posture manual migration step):
   ```sql
   create extension if not exists pgcrypto;
   ```
4. After merge, we go to Step 8 (Cloudflare Pages Git integration) — you'll do ~3 dashboard clicks to connect Pages to this repo. I'll give you the exact click-path in the next message.

**How to roll it back:** revert this PR. The migration is idempotent (`if not exists`) so leaving `pgcrypto` enabled costs nothing; if you truly want it gone, `drop extension pgcrypto;` in the SQL Editor.
