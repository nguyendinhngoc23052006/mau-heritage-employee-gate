# TS/React review — org-chart page + Kwook rebrand
Verdict: **1 CONFIRMED drift, fixed; no blockers.** tsc clean, 80 tests pass
(incl. orgChart + queryKeyShapes), biome clean in all changed files.

- **OrgChartPage — OK.** loading/error/empty handled; `/org/chart` under AuthGate
  with no tier gate (intended: chart is for everyone); `people.role_ceo` /
  `role_sysadmin` resolve in both dictionaries; every `.map` is fed by
  `normalizeChart`, which coerces null/garbage to `[]` (tested for null, nested
  null, and total garbage).
- **Layout header row — OK.** Renders unconditionally but the `/org/chart` link
  is itself unconditional, so never all-empty; StoreSwitcher/StoreIdentity no-op
  post-purge (zero memberships) — no empty dropdown, no crash.
- **i18n drift — FIXED.** The sweep changed `invite.accept.button`'s `{store}`
  placeholder to `{unit}` in en.json only, leaving vi.json on `{store}` — a
  dead key today (no caller) but a future footgun. Aligned vi to `{unit}`; a
  placeholder-parity check now reports zero mismatches. No substring collateral
  elsewhere; en/vi key sets identical.
- **Cache invalidation — OK.** Every mutation (role, deactivate, rate, approve,
  prize/fine, sector/CEO/director/manager appoint+remove) invalidates
  `["org","chart"]`; key identical at all 9 sites; no collision.
- **Brand tokens — OK.** Names retained, values swapped; the 3 new gold/green/red
  tokens referenced by the chart are defined in `@theme`; SVG/Wordmark valid.
