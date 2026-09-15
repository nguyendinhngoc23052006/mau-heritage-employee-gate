Kwook Việt Nam identity, an org-chart page, and the purge of the Màu Heritage
demo era you approved.

**Intent.** Three things in one PR because they're one story — the app stops
being Màu Heritage and becomes Kwook. The legacy stores and their data are
deleted; the UI wears Kwook's identity; and there's a single page that draws
the whole company as a tree.

### Legacy purge — IRREVERSIBLE, merging is the approval
The migration deletes every store with `sector_id is null` (the 4 Màu Heritage
stores) and all `client_errors`. On Supabase Free there is no PITR or backup to
undo this. Dry-run against production (rolled back) confirmed the blast radius:
4 stores + by cascade 4 memberships, 42 shifts, 63 shift_slots, 10 shift_claims,
22 clock_events, 60 audit_log rows; plus the 6 old client_errors. The Kwook org
is untouched — 4 sectors (Kho, Kinh doanh, Marketing, Thương Mại Điện Tử), units
Tiep nhan and Xu ly survive. After it your account has zero store memberships,
so the store-picker dropdown that was showing legacy stores disappears on its
own — that was your first question, and this is the fix.

### Org chart — one snapshot, drawn the same on every device
`org_chart()` (one security-definer RPC) returns the entire company as nested
JSON in a single call: leadership on top, each khối a branch with its directors,
each unit below with its managers and employees, plus anyone unassigned. The
page `/org/chart` draws it as a pure-CSS tree — no per-node script, no per-device
recomputation. It auto-updates: every appoint/remove/promote invalidates the
`["org","chart"]` cache. The nav link "Sơ đồ" is visible to everyone.

*On "SSR":* this stack has no server to render on — it's a static Vite build on
Cloudflare Pages, which is the pipeline's fixed shape. The goal behind the ask —
"render once, not per device, don't slow everything down" — is met by the
database assembling the whole tree in one query that every client fetches and
caches identically. A render server would add cost and a moving part, not speed.
The chart deliberately exposes only names and positions — never pay, contact, or
account data — which is why it may read across branches.

### Supporting indexes
Part C of the migration adds three `if not exists` indexes the `org_chart` query
filters on — `memberships(store_id, active, role)`,
`sector_memberships(sector_id, active)`, and a partial
`profiles(global_role) where not null`. Cheap, idempotent, verified to create.

### Kwook rebrand
Palette sampled from the four-petal pinwheel logo (gold #f9b431, green #79b84f,
red #e4353c, blue #336eb4) and its charcoal wordmark #373536. The Tailwind token
*names* are unchanged (≈200 usages) but their *values* now hold Kwook colors, so
the whole app recolors without touching a single component class. Wordmark →
"KWOOK VIỆT NAM"; LogoMark and favicon → the pinwheel; title/theme-color updated.
Vietnamese "cửa hàng" → "bộ phận", English store → unit throughout.

**Verified before opening:** the full migration ran inside one
`begin; … rollback;` against production — purge + both functions + the chart
query — and came back with exactly the Kwook tree, 2 units, 4 sectors, 0
memberships, 0 client_errors, nothing persisted. lint, typecheck, 80 tests and
build are green.

**To reverse:** the purge cannot be reversed (no backup on Free) — the data is
gone on merge. The rest: Cloudflare Pages → Deployments → Rollback restores the
old UI; the two functions are dropped with
`drop function public.org_chart(); drop function public.org_chart_unit(uuid);`.

**Debt I'm leaving:** the chart shows names to every signed-in employee by
design — if that's ever too much, gate the RPC by tier; unchanged. The 36
pre-existing missing i18n keys from before are still not filled.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration file, UTC-timestamped latest (`20260915133000`); functions + 3 supporting indexes, no new table; src/types matches the RPC shape
- [x] tests/lint/typecheck green — 80 tests; `biome check` clean; `tsc --noEmit` clean; `vite build` clean; full migration dry-run green against production and rolled back
- [x] scripts named exactly `lint`, `typecheck`, `test`
- [~] e2e not yet added
- [x] key read from `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY`; `envPrefix: ['VITE_']`; nothing hardcoded; no secret
- [x] migration re-runnable — `create or replace`; the deletes are no-ops on replay
- [x] irreversible action guarded + flagged — the purge is called out here as the approval-on-merge; it is idempotent
- [x] no avoidable debt; memory updated and pruned
- [x] migration explained in plain English
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR
- [x] every subagent dispatched on a model below the orchestrator's — never inherited

## For you
**What changed:** The Màu Heritage demo data is deleted and the leftover store-picker dropdown with it; the app is rebranded to Kwook Việt Nam (colors, logo, wordmark, "bộ phận" wording); and a new "Sơ đồ" page draws the whole company as a live tree that updates after any org change.
**What you do next:** Review the preview — note it still runs against production, so the org pages work now (the schema is already live from #45); only the new `org_chart` function is missing until merge, so the Sơ đồ page will error on the preview and work after merge. Merge. The `apply-migrations` workflow runs the purge and adds the function; confirm by reloading production, opening "Sơ đồ", and seeing your name atop the tree with the 4 sectors, and the store dropdown gone.
**How to roll it back:** The purge is permanent (Supabase Free has no backup). UI: Cloudflare Pages → Deployments → Rollback. Functions: `drop function public.org_chart();` and `drop function public.org_chart_unit(uuid);` in a new migration.
