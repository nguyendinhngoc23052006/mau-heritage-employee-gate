# TypeScript / React correctness review — stale-bundle banner + cache-key class
Reviewed: working tree of `claude/heritage-gate-part-2-ia4u9p`
Verdict: **2 CONFIRMED findings, both fixed in this PR; 2 latent, documented**

## CONFIRMED — fixed
1. **`fetchSignature` collapsed different fetches into one signature.** The `as`-cast
   stripper ran *after* whitespace removal and matched the letters "as" inside
   identifiers: `m.lastActive` and `m.lastFired` both normalised to `m.l`. Two call
   sites on one key reading different fields would have compared equal — exactly the
   bug the file exists to catch. Fixed by stripping casts before collapsing
   whitespace and requiring the space a real `as` cast always has
   (`src/__tests__/queryKeyShapes.test.ts:44-52`), plus a case that asserts the two
   signatures differ (`:163`).
2. **`useStaleBundle` checked once per always-foregrounded session.** Mount +
   `visibilitychange` were the only triggers, so a manager who keeps one desktop tab
   open and focused all day would be checked once, at mount, and never again — the
   hook's own comment only claimed the backgrounded-phone case. Fixed by adding a
   5-minute poll alongside the visibility listener
   (`src/hooks/useStaleBundle.ts:4, 45`); it runs through the same visibility check
   and 60s throttle, so it adds at most one 20-byte request per 5 minutes per
   visible tab.

## Latent — accepted, not fixed
3. The brace-balanced block scanner does not model strings, template literals or
   `/* */` comments, so a stray brace inside one would mis-slice the block. No such
   site exists among the 73 real call sites, and a mis-slice yields a garbage
   signature (a noisy failure), not a silent pass.
4. The guarded-ternary normaliser mis-parses `??` in the condition and parens inside
   `Promise.resolve(...)`. Neither pattern appears at any current call site.

## No findings
- **Prefix invalidation.** Verified against installed `@tanstack/query-core@5.102.0`
  (`partialMatchKey`, build/modern/utils.js:65-76): `exact` defaults falsy, so
  `invalidateQueries(["notifications","inbox"])` at `NotificationsInbox.tsx:32,39`
  matches both new keys. No other file reads either key.
- **Vite plugin API.** `PluginContext.emitFile` / `EmittedAsset` checked against the
  installed `rolldown@1.2.5` backing `vite@8.2.2`; `generateBundle` is valid and does
  not run under `vite dev`, so `/version.json` 404s in dev — absorbed by the hook's
  catch.
- **Hook mechanics.** Visibility is checked before the throttle is stamped, so a
  hidden-at-mount tab does not burn the window; the module throttle cannot wedge;
  fetch rejection and non-JSON both land in the catch; listener add/remove use the
  same reference, no leak, no loop.
- **i18n.** `common.new_version` present in both dictionaries, identical spelling.
