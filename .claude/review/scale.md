# Scale review — org-chart feature
Verdict: **not a blocker.** The three suggested indexes were folded into this PR.

- **Query shape — OK.** `org_chart()` calls `org_chart_unit()` once per store —
  bounded by unit count (tens), not employees. One server-side statement, ~low
  hundreds of row scans at Kwook's ceiling. Both functions `stable security
  definer`; names/positions only, no PII/pay.
- **Indexes — added here** (Part C of the migration): `memberships(store_id,
  active, role)`, `sector_memberships(sector_id, active)`, and a partial
  `profiles(global_role) where not null` — the `active`/`global_role` filters the
  new query uses that the existing indexes didn't cover. Verified all three
  create cleanly (rolled back). `stores(sector_id)` was already covered.
- **Client caching — OK.** `["org","chart"]` invalidated on every org mutation +
  `refetchOnWindowFocus`; the RPC is cheap and viewers are few. A `staleTime`
  would trim refocus churn — optional, not added.
- **Payload — OK.** Whole company ≈ 35-45 KB uncompressed at 500 people, low
  single-digit KB gzipped; no unbounded field. Reconsider only at multi-thousand
  scale, well past the stated ceiling.
- **No pagination on the chart — correct by design;** the point is to show
  everyone at once.
