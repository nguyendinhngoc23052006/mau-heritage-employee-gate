-- Add the 'disputed' label to the prize_fine_status enum.
--
-- 20260823120000 introduces the dispute flow and assumed status was a text
-- column guarded by a CHECK constraint. It is not — it is the enum
-- public.prize_fine_status (pending, paid, cancelled), so the CHECK it tried
-- to add failed on an unknown enum label:
--   ERROR: invalid input value for enum prize_fine_status: "disputed" (22P02)
--
-- This lives in its own migration on purpose: Postgres allows ALTER TYPE ...
-- ADD VALUE inside a transaction, but the new label cannot be *used* until
-- that transaction commits. Keeping it separate guarantees the label is
-- committed before 20260823120000 creates the functions that reference it.

alter type public.prize_fine_status add value if not exists 'disputed';
