# ts-react — Biome 2 config migration

Verdict: **PASS.**

- Config migrated with `biome migrate`, not by hand.
- Every non-formatting code change inspected individually and confirmed behaviour-preserving:
  `parseInt` radix made explicit; two redundant fragments removed (`git diff -w` shows no other change
  in those files); import ordering. Everything else is formatting.
- Biome's unsafe `useExhaustiveDependencies` fix on `OnboardingPage.tsx` produced a new
  `noInvalidUseBeforeDeclaration` error. Caught and reverted; the file is untouched.
- Newly-surfaced rules demoted to `warn` and enumerated in the PR body rather than disabled,
  so the findings stay visible. `useIterableCallbackReturn` in `SchedulePage` is a real bug shape
  and should be the first follow-up.
- Gates: `biome check` exit 0 (8 warnings, 0 errors), tsc clean, 36/36 tests.
