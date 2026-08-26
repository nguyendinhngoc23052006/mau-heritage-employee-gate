**Intent:** `npm run lint` has been failing on `main` for every PR, and failing *silently* for anyone whose `node_modules` predates the Biome bump. This makes the lint gate real again.

**Impact:** Toolchain only. No behaviour change, no schema, no env. Stands alone per the "refactors never inside a feature PR" rule — it is deliberately not bundled into the payroll PR (#37) it currently blocks.

## What was broken

`package.json` pins `@biomejs/biome: ^2.5.10` but `biome.json` was still a Biome **1.x** config, right down to `"$schema": ".../1.9.4/schema.json"`. Biome 2 renamed `files.ignore` → `files.includes` (with `!` negations) and `overrides[].include` → `includes`, so CI died before linting a single file:

```
× Found an unknown key `include`.
× Biome exited because the configuration resulted in errors.
```

This is a pre-existing break on `main`, not caused by any open PR.

**It also hid itself.** A stale `node_modules` carrying Biome 1.9.4 accepts the old config and reports clean, so local runs passed while CI failed. Anyone who has not run `npm ci` since the bump is getting a false green from their lint gate right now — that is the more dangerous half of this bug.

## What changed

- `biome.json` migrated with `biome migrate` (Biome's own tool, not hand-edited), then extended:
  - `css.parser.tailwindDirectives: true` — `src/index.css` uses Tailwind 4's `@theme`, which Biome 2 otherwise refuses to parse, aborting formatting of the file.
- Safe autofixes applied across 12 files. Every non-formatting change verified behaviour-preserving:
  - `Number.parseInt(x)` → `Number.parseInt(x, 10)` in `RulesPage.tsx` (explicit radix, identical for decimal input)
  - two redundant `<>…</>` wrappers removed in `PayrollPage.tsx` / `MyPayPage.tsx` (`git diff -w` shows nothing else)
  - import ordering in `router.tsx` / `supabaseClient.ts`
  - the rest is pure formatting

## Rules demoted to warnings, not silenced

Biome 2 adds rules that flag genuine pre-existing findings. Fixing them means behaviour-sensitive edits across five files, which does not belong in a toolchain PR. They are set to `warn` — visible on every run, not blocking — and are follow-up work:

| Rule | Where |
| --- | --- |
| `suspicious/useIterableCallbackReturn` | `SchedulePage.tsx:197`, `:989` |
| `correctness/useExhaustiveDependencies` | `OnboardingPage.tsx:195` |
| `suspicious/noArrayIndexKey` | `AttendanceHeatmap.tsx:106` |
| `a11y/noStaticElementInteractions` | `Dialog.tsx:37`, `:45` |
| `a11y/useAriaPropsSupportedByRole` | `Select.tsx:203` |
| `a11y/noSvgWithoutTitle` | `public/logo-mark.svg` |

The two `useIterableCallbackReturn` hits in `SchedulePage` are worth looking at first — that rule catches a callback that returns a value on some paths and not others, which is a real bug shape rather than a style nit.

**One autofix was reverted:** Biome's *unsafe* fix for `useExhaustiveDependencies` on `OnboardingPage.tsx` introduced a fresh `noInvalidUseBeforeDeclaration` error. Reverted; that file is untouched.

## Self-check
- [x] base = main; exactly one PR
- [~] no migration; no schema change; `src/types` untouched
- [x] tests/lint/typecheck green — 36/36 tests, `biome check` exits 0 with 8 warnings and 0 errors, 0 tsc across 154 files
- [x] scripts named exactly `lint`, `typecheck`, `test`
- [~] e2e not yet added
- [~] no env/key change
- [~] no migration, so no SQL block
- [~] no irreversible action
- [x] no avoidable debt; demoted rules are listed above rather than silently disabled
- [~] no migrations to explain
- [x] reviewers ran — `.claude/review/*` refreshed this PR
- [~] no subagent dispatched — verified the diff directly

## For you
**What changed:** The linter config was written for an old version of the linter, so the check was crashing before it looked at any code. Config migrated with the linter's own migration tool, its automatic fixes applied, and six newly-added rules turned into warnings so their existing findings stay visible without blocking anyone.

**What you do next:** Review the Cloudflare Pages preview and merge. **Merge this before #37** — #37 is red purely because of this, and will go green once it picks up this change. Nothing to do in Supabase or Cloudflare.

**How to roll it back:** Cloudflare Pages → Deployments → Rollback to the prior deployment. Reverting the commit restores the old config, which puts CI back to failing on every PR.
