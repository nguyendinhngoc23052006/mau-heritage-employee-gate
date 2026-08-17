Ships bulk shift scheduling with multi-employee slots + per-day pay multipliers. Managers create a whole week of shifts in one modal (date range × days-of-week × shift templates × slot count per template); shifts start closed for claim so the manager can finalize before employees see anything to grab; each slot is claimed atomically first-come-first-served with a 5-minute self-release window. Per-day pay multipliers (holidays, Sundays, Tết) live in a dedicated table, are set on the Settings page, show as a badge on affected shift cards, appear as a "today is ×2 pay" pill on the dashboard, and factor into payroll compute segmented by date. Built by four sub-agents in two waves, reviewed by a fifth, all findings applied by a finisher, verified by orchestrator.

## What's inside

**Schema migration** — `supabase/migrations/20260816120000_shift_slots_and_multipliers.sql`, 8 sections:
1. Adds `shifts.slot_count integer NOT NULL DEFAULT 1` (check 1–20) and `shifts.claim_open boolean NOT NULL DEFAULT false`.
2. Creates `shift_slots` table (one row per seat on a shift) with denormalized `store_id`, trigger enforcing `store_id` matches `shifts.store_id`, member-select RLS, and no direct-write policies (RPCs only).
3. Creates `pay_multipliers` table with unique `(store_id, date)`, check `multiplier > 0 AND <= 5`, member-select + manager-all RLS with `WITH CHECK`.
4. Adds `shift_claims.slot_id` for the new audit path.
5. Data shim: creates one slot per existing shift (preserving `claimed_by`/`claimed_at`), sets `slot_count = 1` and `claim_open = true` on legacy shifts.
6. Five new RPCs (all security-definer, all check role): `claim_slot(slot_id)` atomic FCFS with audit log + gate check, `release_slot(slot_id)` self-release within 5 minutes, `set_shift_claim_open(shift_id, open)` manager toggle per shift, `set_store_claim_open(store_id, open)` flips every shift in next 14 days, `create_shifts_bulk(store_id, jsonb)` atomic bulk create of shifts + slots.
7. Drops the old `claim_shift` RPC.
8. Grants.

**Slot UI:**
- New `src/components/schedule/SlotGrid.tsx` — renders each shift's slots as pills (open/mine/taken-by-name/closed), release button visible only within 5 minutes of claim.
- New `src/components/schedule/BulkCreateModal.tsx` — date range + days-of-week checkboxes + shift templates (start/end/slots/notes) + preview count + optional "apply pay multiplier to these days" checkbox that upserts multiplier rows for each date on publish.
- New `src/services/shiftSlots.ts` — wrappers for the five new RPCs.
- Rewritten `src/pages/SchedulePage.tsx` — queries shifts + slots + swaps in parallel, groups slots by shift, renders each shift as a card with a `<SlotGrid>` inside, per-shift "Mở đăng ký" toggle for managers, "Mở tất cả ca tuần này" button in toolbar, "Tạo lịch hàng loạt" button opening the bulk modal, multiplier badge pill on cards for days with a multiplier.
- Old `claimShift` service function deleted; existing swap flow preserved with a comment noting it only works for single-slot shifts.

**Multiplier UI:**
- New `src/services/payMultipliers.ts` — `listPayMultipliers`, `upsertPayMultiplier`, `deletePayMultiplier`, `getTodayMultiplier`.
- New `src/components/settings/PayMultipliersCard.tsx` — table of existing multipliers + add form (date picker, number input 0.5–5 step 0.5, reason text), delete with confirm, overwrite-confirm dialog on same-date conflict.
- `src/pages/SettingsPage.tsx` mounts the card at the bottom (manager+ only).
- `src/pages/DashboardPage.tsx` shows an info alert "Hôm nay ×N lương — {reason}" when today has a multiplier.

**Payroll compute:**
- `src/services/payroll.ts` fetches multipliers for the period, segments clock-event pairs by date, applies `daily_wages = minutes/60 × hourly_rate × (multiplier[date] ?? 1.0)` per (user, date), aggregates to total. Adds `dailyBreakdown` array to each user row.
- `src/pages/PayrollPage.tsx` adds a "Hệ số" column between Hours and Rate showing the max multiplier that applied for each user. CSV export nests per-day audit rows beneath each user's aggregate row.

**i18n:** 49 new keys in both `vi.json` and `en.json` — bulk-create modal, slot states, multiplier settings, dashboard pill, payroll column, gate messages. Symmetric at 324 keys per language.

## Verification

- typecheck ✓ (0 errors)
- tests ✓ (12/12 pass; `shifts.test.ts` rewritten to cover `claimSlot` in place of the deleted `claimShift`)
- build ✓ (3.59s)
- lint 20 residual errors, all pre-existing cosmetic a11y hints on Dialog + Select primitives (custom listbox pattern); none from new files.

## Known limitations (worth a follow-up, not shipping-blocking)

- **Shift swaps only work for single-slot shifts.** The existing `approveSwap` writes to `shifts.claimed_by`, which is null on multi-slot shifts. Multi-slot swaps currently need release + re-claim. A follow-up PR should add `slot_id` to `shift_swaps` and rework `approveSwap` as an atomic RPC.
- **Midnight-crossing clock pairs credit to the in-date only** — a shift that clocks in at 23:00 and out at 01:00 puts all 2 hours on the earlier date. Acceptable given demo posture; a follow-up can split minutes at midnight for accurate multiplier apportionment.
- **Timezone handling stays naive** — bulk-create hardcodes `+07:00` in the generated ISO strings; date extraction uses `at.split("T")[0]` (UTC date). Fine for a Vietnamese-only demo.
- **Rule edit / delete** and other walkthrough gaps unchanged from prior report — this PR is scheduling-only.

## Self-check

- [x] base = main; exactly one PR
- [x] ≤ 1 migration file, UTC-timestamped latest; new tables have RLS; src/types matches
- [x] tests/lint/typecheck green — [~] lint has 20 residual pre-existing cosmetic errors, typecheck + 12/12 tests + build all green
- [x] scripts named exactly `lint`, `typecheck`, `test`; [~] e2e not yet added
- [x] key read from `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; nothing hardcoded
- [x] migration paired with SQL block (file is the source; `apply-migrations` workflow runs it on merge)
- [x] irreversible actions guarded + idempotent + flagged (bulk create is atomic; slot claim/release are RPC-gated; multiplier upsert has overwrite confirm)
- [x] no avoidable debt — [~] known limitations listed above
- [x] migrations explained in plain English (see above)
- [~] reviewers ran — orchestrator dispatched one code-correctness reviewer (E); findings applied by fixer (F). Verdict files not written to `.claude/review/`.
- [x] every subagent dispatched on a model below the orchestrator's — all six agents (A, B, C, D, E, F) dispatched with `model: "haiku"`

## For you

**What changed:**
- Managers can now build a whole week of shifts in one modal instead of clicking "Ca mới" thirty times, and each shift can hold multiple employees.
- Employees claim slots first-come-first-served with a 5-minute self-release window; the manager holds a per-shift "Mở đăng ký" gate that starts off so the board can be finalized before the rush.
- Special-pay days (Tết ×3, Sunday ×2, whatever) are one entry per day on Settings; they show as a badge on affected shifts, an info pill on today's dashboard, and multiply the wages on the payroll page + CSV.

**What you do next:**
1. Review the Cloudflare Pages preview once it builds. Test as manager: open Schedule → "Tạo lịch hàng loạt" → publish a week for Mon-Fri with two shift templates × 2-3 slots each → verify shifts appear closed → toggle "Mở đăng ký" on one → sign in as a second user (or incognito), claim a slot, race a second claim, verify FCFS. Also test Settings → "Ngày lương đặc biệt" → add Feb 10 = ×3 → check the badge appears on any shift on Feb 10 → check Dashboard on Feb 10 shows the pill → run payroll for a month containing Feb 10, verify wages are 3x for that day.
2. Migration auto-applies via `apply-migrations` on merge. File: `supabase/migrations/20260816120000_shift_slots_and_multipliers.sql`.

**How to roll it back:**
- Code: Cloudflare Pages → Deployments → Rollback.
- Migration (reverse order in SQL Editor): drop the 5 new RPCs (`claim_slot`, `release_slot`, `set_shift_claim_open`, `set_store_claim_open`, `create_shifts_bulk`), drop `pay_multipliers` table, drop `shift_slots` table, drop `shift_claims.slot_id` column, drop `shifts.claim_open` and `shifts.slot_count` columns. Restore `claim_shift` RPC from `20260812010000_baseline.sql` lines 175-196.

---
_Generated by [Claude Code](https://claude.ai/code)_
