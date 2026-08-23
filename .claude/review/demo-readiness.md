# Demo-readiness review — mega role-dashboards PR

Reviewed against the "demo-posture tradeoff" in CLAUDE.md: preview URLs share the prod DB, so every write in a preview is a prod write.

## Verdict: APPROVE with cautions

## Destructive-write audit
- **`delete_shift_safe`**: soft-delete only (sets `deleted_at`); reversible via `UPDATE shifts SET deleted_at = NULL`. Refuses if slots claimed without a reason. Audit-logged.
- **`update_shift_safe`**: mutates `starts_at`/`ends_at`/`notes`/`slot_count`. Refuses past-shift edits + slot shrink below claimed count. Audit-logged.
- **`delete_store`**: `DELETE FROM stores` cascades to memberships, shifts, clock_events, sales_reports, prize_fine_events, etc. **THIS IS IRREVERSIBLE** at the DB level. Guarded by: owner-only role check + type-store-name confirmation on the client. Reviewers should be careful not to click through on the demo.
- **`transfer_ownership`**: atomic role swap; caller becomes manager, target becomes owner. Reversible only by the new owner doing another transfer. Guarded by: eligible-manager dropdown + explicit warning.
- **`issue_prize_fine`**, **`cancel_prize_fine`**, **`dispute_prize_fine`**: monetary state changes. Reversible via cancel_prize_fine + resolve_prize_fine_dispute. All audit-logged.
- **`edit_clock_event`**, **`insert_manual_clock_event`**: change wage-computation source data. Audit-logged. Manager-only.

## Demo cautions (add to PR review comment)
- **Do not click "Delete Store" in the preview** unless you actually want the store gone from production. Type-name confirmation is the only guard.
- **Transfer Ownership is a real prod state change** — the demoted owner cannot self-restore.
- **Editing a clock event mutates the payroll compute** for the affected employee.

## User-visible changes
1. Dashboard reshapes by role — same URL, three views.
2. Shift `⋯` menu appears on every card for managers.
3. Payroll page has a Store Prize/Fine table underneath the payroll table.
4. `/me/pay`, `/me/history`, `/me/fines`, `/store/:id/people/:userId`, `/store/:id/clock/corrections` are new routes.
5. Settings has a Danger Zone at the bottom (owner-only visible).
6. Google Fonts still render (PR #25 fix intact).

## Rollback path
- Client: Cloudflare Pages → Deployments → Rollback.
- Migration: drop statements documented at the bottom of the migration file. Some drops (like DELETE from stores if `delete_store` was called during preview) are NOT reversible.

## No blockers for merge; note the demo cautions above.
