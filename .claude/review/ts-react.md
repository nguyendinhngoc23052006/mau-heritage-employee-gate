# TS / React reviewer — verdict

Scope: client-side changes shipped against the PR #20 post-mortem (items A–P).

**A — FIXED, UX caveat.** Race-loss on slot claim now surfaces to the user; still routes through a native `alert()` rather than the app's toast system — cosmetic, not blocking.

**B — FIXED.** Dedupe-key regex matches the server's `YYYY-MM-DDTHH:MI` format exactly; no false-splits on minute boundaries.

**C — FIXED.** Attendance-flags card renders without a loading-to-empty flash on first paint.

**D — FIXED.** Geofence-required check has no false-negative path — a store with `require_geofence=true` and a denied browser permission now blocks rather than silently allowing.

**E — STILL-BROKEN, then patched by the orchestrator.** The manual "close stale clock event" RPC call created a *new* attendance flag on every click and never resolved the original, so the queue only grew. Orchestrator changed the RPC to resolve the source flag and refuse if the in-event is already paired — client now reflects a shrinking queue.

**F — FIXED.** Variance display short-circuits on `null` (no `expected_cents`) instead of coercing to a false "0% variance."

**G — FIXED.** No further issues found in the diff at this item.

**H — FIXED.** Sequential awaits on clock-in/clock-out; no race between the geolocation read and the RPC call.

**I — Discrepancy noted, not a functional bug.** The 3-way gate (loading/error/ready) collapses to 2 live branches in practice — one state is currently unreachable given current props. Flagged for cleanup, not blocking.

**J — FIXED.** 409-status and duplicate-key error paths now use the same identifying key client and server side — no parity gap.

**K — STILL-BROKEN, then patched by Fixer A.** Locale was read from two different sources (a stale context value and a fresh profile fetch) that could disagree after a profile update; Fixer A collapsed to the single profile-fetched source.

**L — FIXED.** Single paint on the attendance-flags list; no double-render flash.

**M — FIXED.** Both the geofence-enforced and geofence-optional branches produce correct enable/disable state.

**N — Tests are meaningful** — assert on behavior (error toast shown, RPC called with right args), not implementation details.

**O — No hook regressions** found in the affected components.

**P — i18n translations read as natural Vietnamese**, not machine-literal.
