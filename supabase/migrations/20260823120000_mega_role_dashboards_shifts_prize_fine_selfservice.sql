-- Mega migration: role-shaped dashboards + shift CRUD + prize/fine modifications
-- + employee self-service + clock corrections + owner-only actions.
-- Ships Phases 1-6 of the full plan into one PR.
--
-- New columns:
--   shifts.deleted_at (soft-delete; scope selects to deleted_at is null)
--   memberships.last_active_at (switcher sort)
--   prize_fine_events.dispute_reason + disputed_at (dispute flow)
--   prize_fine_events.issued_by (who issued the ad-hoc prize/fine)
--   prize_fine_events.canceled_reason + canceled_by + canceled_at
--
-- New tables:
--   clock_correction_requests (employee → manager)
--
-- Extends PrizeFineStatus enum: 'disputed'
--
-- New RPCs (all SECURITY DEFINER, role-checked, audit-writing):
--   Shifts: delete_shift_safe, update_shift_safe, close_shift_claims,
--           force_open_shift
--   Prize/fine: issue_prize_fine, mark_prize_fine_paid, cancel_prize_fine,
--               dispute_prize_fine, resolve_prize_fine_dispute
--   Clock: edit_clock_event, insert_manual_clock_event,
--          request_clock_correction, resolve_clock_correction
--   People: resend_invite, transfer_ownership, delete_store
--   Membership: set_membership_last_active (called on nav)
--
-- Also: replaces create_shifts_bulk with v2 that guards past-shift + overlap
-- + duplicate.

-- ============================================================
-- 1. Schema changes
-- ============================================================

alter table public.shifts add column if not exists deleted_at timestamptz;
create index if not exists shifts_deleted_at_idx on public.shifts (deleted_at)
  where deleted_at is null;

alter table public.memberships add column if not exists last_active_at timestamptz
  default now();
create index if not exists memberships_last_active_idx
  on public.memberships (user_id, last_active_at desc);

alter table public.prize_fine_events add column if not exists dispute_reason text;
alter table public.prize_fine_events add column if not exists disputed_at timestamptz;
alter table public.prize_fine_events add column if not exists issued_by uuid
  references auth.users(id);
alter table public.prize_fine_events add column if not exists canceled_reason text;
alter table public.prize_fine_events add column if not exists canceled_by uuid
  references auth.users(id);
alter table public.prize_fine_events add column if not exists canceled_at timestamptz;

-- status is the prize_fine_status ENUM, not a text column with a CHECK, so the
-- 'disputed' label is added by 20260823110000 which runs (and commits) first —
-- a new enum label cannot be used in the transaction that created it.

-- ============================================================
-- 2. New table: clock_correction_requests
-- ============================================================

create table if not exists public.clock_correction_requests (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  clock_event_id uuid references public.clock_events(id) on delete set null,
  kind text not null check (kind in ('missing_in', 'missing_out', 'wrong_time')),
  proposed_at timestamptz,
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text
);

create index if not exists clock_correction_requests_store_status_idx
  on public.clock_correction_requests (store_id, status);
create index if not exists clock_correction_requests_user_idx
  on public.clock_correction_requests (user_id, created_at desc);

alter table public.clock_correction_requests enable row level security;

drop policy if exists ccr_select_own on public.clock_correction_requests;
create policy ccr_select_own on public.clock_correction_requests for select
  using (user_id = auth.uid()
    or public.has_role_on(store_id, array['owner','manager']::public.role[]));

drop policy if exists ccr_insert_own on public.clock_correction_requests;
create policy ccr_insert_own on public.clock_correction_requests for insert
  with check (user_id = auth.uid() and public.is_member_of(store_id));

drop policy if exists ccr_update_manager on public.clock_correction_requests;
create policy ccr_update_manager on public.clock_correction_requests for update
  using (public.has_role_on(store_id, array['owner','manager']::public.role[]))
  with check (public.has_role_on(store_id, array['owner','manager']::public.role[]));

grant select, insert, update on public.clock_correction_requests to authenticated;

drop trigger if exists audit_clock_correction_requests on public.clock_correction_requests;
create trigger audit_clock_correction_requests
  after insert or update on public.clock_correction_requests
  for each row execute function public.write_audit();

-- ============================================================
-- 3. Shift RPCs
-- ============================================================

-- Soft-delete a shift. If any slot is claimed, requires reason + audits.
create or replace function public.delete_shift_safe(
  p_shift_id uuid,
  p_reason text default null
) returns public.shifts language plpgsql security definer set search_path = public as $$
declare
  v_shift public.shifts;
  v_claimed_count int;
begin
  select * into v_shift from public.shifts where id = p_shift_id and deleted_at is null;
  if not found then raise exception 'shift not found' using errcode = 'P0002'; end if;
  if not public.has_role_on(v_shift.store_id, array['owner','manager']::public.role[]) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select count(*) into v_claimed_count from public.shift_slots
    where shift_id = p_shift_id and claimed_by is not null;

  if v_claimed_count > 0 and (p_reason is null or length(trim(p_reason)) = 0) then
    raise exception 'shift has % claimed slot(s); reason required to delete', v_claimed_count
      using errcode = 'P0001';
  end if;

  update public.shifts set deleted_at = now() where id = p_shift_id
    returning * into v_shift;
  return v_shift;
end $$;

grant execute on function public.delete_shift_safe(uuid, text) to authenticated;

-- Edit shift start/end/notes/slot_count. Blocks past-shift edits.
-- Refuses shrinking slot_count below current claimed count.
create or replace function public.update_shift_safe(
  p_shift_id uuid,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_notes text default null,
  p_slot_count int default null
) returns public.shifts language plpgsql security definer set search_path = public as $$
declare
  v_shift public.shifts;
  v_claimed_count int;
  v_new_starts timestamptz;
  v_new_ends timestamptz;
  v_new_slot_count int;
begin
  select * into v_shift from public.shifts where id = p_shift_id and deleted_at is null;
  if not found then raise exception 'shift not found' using errcode = 'P0002'; end if;
  if not public.has_role_on(v_shift.store_id, array['owner','manager']::public.role[]) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_shift.starts_at <= now() then
    raise exception 'cannot edit past shift' using errcode = 'P0001';
  end if;

  v_new_starts := coalesce(p_starts_at, v_shift.starts_at);
  v_new_ends := coalesce(p_ends_at, v_shift.ends_at);
  v_new_slot_count := coalesce(p_slot_count, v_shift.slot_count);

  if v_new_starts >= v_new_ends then
    raise exception 'starts_at must be before ends_at' using errcode = 'P0001';
  end if;
  if v_new_slot_count < 1 or v_new_slot_count > 20 then
    raise exception 'slot_count must be between 1 and 20' using errcode = 'P0001';
  end if;

  select count(*) into v_claimed_count from public.shift_slots
    where shift_id = p_shift_id and claimed_by is not null;
  if v_new_slot_count < v_claimed_count then
    raise exception 'cannot shrink slot_count below % claimed slot(s)', v_claimed_count
      using errcode = 'P0001';
  end if;

  update public.shifts set
    starts_at = v_new_starts,
    ends_at = v_new_ends,
    notes = coalesce(p_notes, notes),
    slot_count = v_new_slot_count
  where id = p_shift_id
  returning * into v_shift;

  -- Add or drop slot rows to match the new slot_count.
  if v_new_slot_count > (select count(*) from public.shift_slots where shift_id = p_shift_id) then
    insert into public.shift_slots (shift_id, store_id)
    select p_shift_id, v_shift.store_id
    from generate_series(1, v_new_slot_count - (select count(*) from public.shift_slots where shift_id = p_shift_id));
  elsif v_new_slot_count < (select count(*) from public.shift_slots where shift_id = p_shift_id) then
    -- Only delete unclaimed slots (we already refused shrinking below claimed count).
    delete from public.shift_slots
    where id in (
      select id from public.shift_slots
      where shift_id = p_shift_id and claimed_by is null
      order by created_at desc
      limit (select count(*) from public.shift_slots where shift_id = p_shift_id) - v_new_slot_count
    );
  end if;

  return v_shift;
end $$;

grant execute on function public.update_shift_safe(uuid, timestamptz, timestamptz, text, int) to authenticated;

-- Close all slot claims on a shift (revert to open).
create or replace function public.close_shift_claims(p_shift_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_shift public.shifts;
  v_released int;
begin
  select * into v_shift from public.shifts where id = p_shift_id and deleted_at is null;
  if not found then raise exception 'shift not found' using errcode = 'P0002'; end if;
  if not public.has_role_on(v_shift.store_id, array['owner','manager']::public.role[]) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  with released as (
    update public.shift_slots
    set claimed_by = null, claimed_at = null
    where shift_id = p_shift_id and claimed_by is not null
    returning 1
  )
  select count(*) into v_released from released;
  return v_released;
end $$;

grant execute on function public.close_shift_claims(uuid) to authenticated;

-- Force-open claim on a shift regardless of any cutoff.
create or replace function public.force_open_shift(p_shift_id uuid)
returns public.shifts language plpgsql security definer set search_path = public as $$
declare
  v_shift public.shifts;
begin
  select * into v_shift from public.shifts where id = p_shift_id and deleted_at is null;
  if not found then raise exception 'shift not found' using errcode = 'P0002'; end if;
  if not public.has_role_on(v_shift.store_id, array['owner','manager']::public.role[]) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.shifts set claim_open = true where id = p_shift_id returning * into v_shift;
  return v_shift;
end $$;

grant execute on function public.force_open_shift(uuid) to authenticated;

-- Replace create_shifts_bulk with a v2 that guards past-shift + overlap +
-- duplicate. Keeps the same signature so existing callers work.
create or replace function public.create_shifts_bulk(
  p_store_id uuid,
  p_shifts jsonb
) returns setof public.shifts language plpgsql security definer set search_path = public as $$
declare
  v_shift jsonb;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_slot_count int;
  v_notes text;
  v_claim_open boolean;
  v_new_shift public.shifts;
  v_overlap_count int;
  v_duplicate_count int;
begin
  if not public.has_role_on(p_store_id, array['owner','manager']::public.role[]) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  for v_shift in select * from jsonb_array_elements(p_shifts) loop
    v_starts_at := (v_shift->>'starts_at')::timestamptz;
    v_ends_at := (v_shift->>'ends_at')::timestamptz;
    v_slot_count := coalesce((v_shift->>'slot_count')::int, 1);
    v_notes := v_shift->>'notes';
    v_claim_open := coalesce((v_shift->>'claim_open')::boolean, false);

    if v_starts_at is null or v_ends_at is null then
      raise exception 'starts_at and ends_at required' using errcode = 'P0001';
    end if;
    if v_starts_at >= v_ends_at then
      raise exception 'starts_at must be before ends_at' using errcode = 'P0001';
    end if;
    if v_starts_at < now() then
      raise exception 'cannot create shift in the past (% before now)', v_starts_at using errcode = 'P0001';
    end if;
    if v_slot_count < 1 or v_slot_count > 20 then
      raise exception 'slot_count must be between 1 and 20' using errcode = 'P0001';
    end if;

    -- Duplicate check: exact same store+starts_at+ends_at already exists.
    select count(*) into v_duplicate_count
      from public.shifts
      where store_id = p_store_id
        and starts_at = v_starts_at
        and ends_at = v_ends_at
        and deleted_at is null;
    if v_duplicate_count > 0 then
      raise exception 'duplicate shift for % → %', v_starts_at, v_ends_at using errcode = 'P0001';
    end if;

    -- Overlap check: any other shift in this store whose window overlaps.
    select count(*) into v_overlap_count
      from public.shifts
      where store_id = p_store_id
        and deleted_at is null
        and starts_at < v_ends_at
        and ends_at > v_starts_at;
    if v_overlap_count > 0 then
      raise exception 'overlapping shift exists in window % → %', v_starts_at, v_ends_at using errcode = 'P0001';
    end if;

    insert into public.shifts (store_id, starts_at, ends_at, notes, slot_count, claim_open, created_by)
    values (p_store_id, v_starts_at, v_ends_at, v_notes, v_slot_count, v_claim_open, auth.uid())
    returning * into v_new_shift;

    -- Create slot rows.
    insert into public.shift_slots (shift_id, store_id)
    select v_new_shift.id, p_store_id from generate_series(1, v_slot_count);

    return next v_new_shift;
  end loop;
end $$;

grant execute on function public.create_shifts_bulk(uuid, jsonb) to authenticated;

-- ============================================================
-- 4. Prize/fine RPCs
-- ============================================================

create or replace function public.issue_prize_fine(
  p_store_id uuid,
  p_user_id uuid,
  p_kind text,
  p_amount_cents int,
  p_reason text
) returns public.prize_fine_events language plpgsql security definer set search_path = public as $$
declare
  v_event public.prize_fine_events;
begin
  if not public.has_role_on(p_store_id, array['owner','manager']::public.role[]) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_kind not in ('prize', 'fine') then
    raise exception 'kind must be prize or fine' using errcode = 'P0001';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'amount_cents must be positive' using errcode = 'P0001';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason required' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.memberships where user_id = p_user_id and store_id = p_store_id and active = true) then
    raise exception 'target user is not an active member of this store' using errcode = 'P0001';
  end if;

  insert into public.prize_fine_events (store_id, user_id, kind, amount_cents, reason, status, issued_by)
  values (p_store_id, p_user_id, p_kind, p_amount_cents, p_reason, 'pending', auth.uid())
  returning * into v_event;
  return v_event;
end $$;

grant execute on function public.issue_prize_fine(uuid, uuid, text, int, text) to authenticated;

create or replace function public.mark_prize_fine_paid(p_event_id uuid)
returns public.prize_fine_events language plpgsql security definer set search_path = public as $$
declare
  v_event public.prize_fine_events;
begin
  select * into v_event from public.prize_fine_events where id = p_event_id;
  if not found then raise exception 'event not found' using errcode = 'P0002'; end if;
  if not public.has_role_on(v_event.store_id, array['owner','manager']::public.role[]) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_event.status = 'paid' then
    return v_event;
  end if;
  if v_event.status = 'cancelled' then
    raise exception 'cannot mark cancelled event as paid' using errcode = 'P0001';
  end if;

  update public.prize_fine_events set
    status = 'paid',
    paid_at = now(),
    paid_by = auth.uid()
  where id = p_event_id
  returning * into v_event;
  return v_event;
end $$;

grant execute on function public.mark_prize_fine_paid(uuid) to authenticated;

create or replace function public.cancel_prize_fine(p_event_id uuid, p_reason text)
returns public.prize_fine_events language plpgsql security definer set search_path = public as $$
declare
  v_event public.prize_fine_events;
begin
  select * into v_event from public.prize_fine_events where id = p_event_id;
  if not found then raise exception 'event not found' using errcode = 'P0002'; end if;
  if not public.has_role_on(v_event.store_id, array['owner','manager']::public.role[]) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_event.status = 'paid' then
    raise exception 'cannot cancel paid event' using errcode = 'P0001';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason required' using errcode = 'P0001';
  end if;

  update public.prize_fine_events set
    status = 'cancelled',
    canceled_reason = p_reason,
    canceled_by = auth.uid(),
    canceled_at = now()
  where id = p_event_id
  returning * into v_event;
  return v_event;
end $$;

grant execute on function public.cancel_prize_fine(uuid, text) to authenticated;

create or replace function public.dispute_prize_fine(p_event_id uuid, p_reason text)
returns public.prize_fine_events language plpgsql security definer set search_path = public as $$
declare
  v_event public.prize_fine_events;
begin
  select * into v_event from public.prize_fine_events where id = p_event_id;
  if not found then raise exception 'event not found' using errcode = 'P0002'; end if;
  if v_event.user_id != auth.uid() then
    raise exception 'can only dispute your own events' using errcode = '42501';
  end if;
  if v_event.status not in ('pending') then
    raise exception 'can only dispute pending events' using errcode = 'P0001';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason required' using errcode = 'P0001';
  end if;

  update public.prize_fine_events set
    status = 'disputed',
    dispute_reason = p_reason,
    disputed_at = now()
  where id = p_event_id
  returning * into v_event;
  return v_event;
end $$;

grant execute on function public.dispute_prize_fine(uuid, text) to authenticated;

create or replace function public.resolve_prize_fine_dispute(
  p_event_id uuid,
  p_decision text,
  p_note text default null
) returns public.prize_fine_events language plpgsql security definer set search_path = public as $$
declare
  v_event public.prize_fine_events;
begin
  select * into v_event from public.prize_fine_events where id = p_event_id;
  if not found then raise exception 'event not found' using errcode = 'P0002'; end if;
  if not public.has_role_on(v_event.store_id, array['owner','manager']::public.role[]) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_event.status != 'disputed' then
    raise exception 'event is not disputed' using errcode = 'P0001';
  end if;
  if p_decision not in ('uphold', 'reverse') then
    raise exception 'decision must be uphold or reverse' using errcode = 'P0001';
  end if;

  if p_decision = 'uphold' then
    update public.prize_fine_events set status = 'pending' where id = p_event_id returning * into v_event;
  else
    update public.prize_fine_events set
      status = 'cancelled',
      canceled_reason = coalesce(p_note, 'dispute upheld'),
      canceled_by = auth.uid(),
      canceled_at = now()
    where id = p_event_id returning * into v_event;
  end if;
  return v_event;
end $$;

grant execute on function public.resolve_prize_fine_dispute(uuid, text, text) to authenticated;

-- ============================================================
-- 5. Clock correction RPCs
-- ============================================================

create or replace function public.request_clock_correction(
  p_store_id uuid,
  p_clock_event_id uuid,
  p_kind text,
  p_reason text,
  p_proposed_at timestamptz default null
) returns public.clock_correction_requests language plpgsql security definer set search_path = public as $$
declare
  v_req public.clock_correction_requests;
begin
  if not public.is_member_of(p_store_id) then
    raise exception 'not a member of this store' using errcode = '42501';
  end if;
  if p_kind not in ('missing_in', 'missing_out', 'wrong_time') then
    raise exception 'invalid kind' using errcode = 'P0001';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason required' using errcode = 'P0001';
  end if;
  if p_clock_event_id is not null then
    if not exists (select 1 from public.clock_events where id = p_clock_event_id and user_id = auth.uid()) then
      raise exception 'clock event not yours' using errcode = '42501';
    end if;
  end if;

  insert into public.clock_correction_requests
    (store_id, user_id, clock_event_id, kind, proposed_at, reason)
  values (p_store_id, auth.uid(), p_clock_event_id, p_kind, p_proposed_at, p_reason)
  returning * into v_req;
  return v_req;
end $$;

grant execute on function public.request_clock_correction(uuid, uuid, text, text, timestamptz) to authenticated;

create or replace function public.resolve_clock_correction(
  p_request_id uuid,
  p_decision text,
  p_note text default null
) returns public.clock_correction_requests language plpgsql security definer set search_path = public as $$
declare
  v_req public.clock_correction_requests;
begin
  select * into v_req from public.clock_correction_requests where id = p_request_id;
  if not found then raise exception 'request not found' using errcode = 'P0002'; end if;
  if not public.has_role_on(v_req.store_id, array['owner','manager']::public.role[]) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_req.status != 'pending' then
    raise exception 'request already resolved' using errcode = 'P0001';
  end if;
  if p_decision not in ('approved', 'denied') then
    raise exception 'decision must be approved or denied' using errcode = 'P0001';
  end if;

  update public.clock_correction_requests set
    status = p_decision,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = p_note
  where id = p_request_id
  returning * into v_req;
  return v_req;
end $$;

grant execute on function public.resolve_clock_correction(uuid, text, text) to authenticated;

create or replace function public.edit_clock_event(
  p_event_id uuid,
  p_new_at timestamptz,
  p_reason text
) returns public.clock_events language plpgsql security definer set search_path = public as $$
declare
  v_event public.clock_events;
begin
  select * into v_event from public.clock_events where id = p_event_id;
  if not found then raise exception 'clock event not found' using errcode = 'P0002'; end if;
  if not public.has_role_on(v_event.store_id, array['owner','manager']::public.role[]) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason required' using errcode = 'P0001';
  end if;

  update public.clock_events set at = p_new_at where id = p_event_id returning * into v_event;
  return v_event;
end $$;

grant execute on function public.edit_clock_event(uuid, timestamptz, text) to authenticated;

create or replace function public.insert_manual_clock_event(
  p_store_id uuid,
  p_user_id uuid,
  p_kind text,
  p_at timestamptz,
  p_reason text
) returns public.clock_events language plpgsql security definer set search_path = public as $$
declare
  v_event public.clock_events;
  v_key text;
begin
  if not public.has_role_on(p_store_id, array['owner','manager']::public.role[]) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_kind not in ('in', 'out') then
    raise exception 'kind must be in or out' using errcode = 'P0001';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason required' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.memberships where user_id = p_user_id and store_id = p_store_id and active = true) then
    raise exception 'target user is not an active member of this store' using errcode = 'P0001';
  end if;

  v_key := 'manual:' || p_kind || ':' || to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS');

  insert into public.clock_events
    (store_id, user_id, kind, at, source, idempotency_key, created_by, location_verified)
  values
    (p_store_id, p_user_id, p_kind, p_at, 'manual', v_key, auth.uid(), null)
  returning * into v_event;

  return v_event;
end $$;

grant execute on function public.insert_manual_clock_event(uuid, uuid, text, timestamptz, text) to authenticated;

-- ============================================================
-- 6. People / owner RPCs
-- ============================================================

create or replace function public.resend_invite(p_invite_id uuid)
returns public.invites language plpgsql security definer set search_path = public as $$
declare
  v_invite public.invites;
begin
  select * into v_invite from public.invites where id = p_invite_id;
  if not found then raise exception 'invite not found' using errcode = 'P0002'; end if;
  if not public.has_role_on(v_invite.store_id, array['owner','manager']::public.role[]) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_invite.accepted_at is not null then
    raise exception 'invite already accepted' using errcode = 'P0001';
  end if;
  if v_invite.revoked_at is not null then
    raise exception 'invite revoked' using errcode = 'P0001';
  end if;

  update public.invites set expires_at = now() + interval '14 days'
    where id = p_invite_id returning * into v_invite;
  return v_invite;
end $$;

grant execute on function public.resend_invite(uuid) to authenticated;

create or replace function public.transfer_ownership(
  p_to_user_id uuid,
  p_store_id uuid
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller_role public.role;
  v_target_membership public.memberships;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select role into v_caller_role from public.memberships
    where user_id = auth.uid() and store_id = p_store_id and active = true;
  if v_caller_role != 'owner' then
    raise exception 'only owner can transfer ownership' using errcode = '42501';
  end if;
  if p_to_user_id = auth.uid() then
    raise exception 'cannot transfer to yourself' using errcode = 'P0001';
  end if;
  select * into v_target_membership from public.memberships
    where user_id = p_to_user_id and store_id = p_store_id and active = true;
  if not found then
    raise exception 'target is not an active member of this store' using errcode = 'P0001';
  end if;

  -- Promote target to owner, demote self to manager. Atomic.
  update public.memberships set role = 'owner'
    where user_id = p_to_user_id and store_id = p_store_id;
  update public.memberships set role = 'manager'
    where user_id = auth.uid() and store_id = p_store_id;
end $$;

grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;

create or replace function public.delete_store(p_store_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller_role public.role;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select role into v_caller_role from public.memberships
    where user_id = auth.uid() and store_id = p_store_id and active = true;
  if v_caller_role != 'owner' then
    raise exception 'only owner can delete store' using errcode = '42501';
  end if;
  delete from public.stores where id = p_store_id;
end $$;

grant execute on function public.delete_store(uuid) to authenticated;

-- ============================================================
-- 7. Membership last-active updater (called on nav)
-- ============================================================

create or replace function public.set_membership_last_active(p_store_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  update public.memberships set last_active_at = now()
    where user_id = auth.uid() and store_id = p_store_id;
end $$;

grant execute on function public.set_membership_last_active(uuid) to authenticated;

-- ============================================================
-- 8. Historical payroll: rate_history at clock-event time
-- ============================================================
-- A view + RPC that computes wages using the rate that was in effect at the
-- clock-in time, not the current rate. Client can call this or continue to
-- read from clock_events + rate_history via join.

create or replace function public.rate_at(
  p_user_id uuid,
  p_store_id uuid,
  p_at timestamptz
) returns int language sql stable security definer set search_path = public as $$
  select hourly_rate_cents
  from public.rate_history
  where user_id = p_user_id
    and store_id = p_store_id
    and effective_from <= p_at
    and (effective_to is null or effective_to > p_at)
  order by effective_from desc
  limit 1;
$$;

grant execute on function public.rate_at(uuid, uuid, timestamptz) to authenticated;

-- ============================================================
-- Reversal notes (for the PR body):
--   drop function public.rate_at(uuid,uuid,timestamptz);
--   drop function public.set_membership_last_active(uuid);
--   drop function public.delete_store(uuid);
--   drop function public.transfer_ownership(uuid,uuid);
--   drop function public.resend_invite(uuid);
--   drop function public.insert_manual_clock_event(uuid,uuid,text,timestamptz,text);
--   drop function public.edit_clock_event(uuid,timestamptz,text);
--   drop function public.resolve_clock_correction(uuid,text,text);
--   drop function public.request_clock_correction(uuid,uuid,text,text,timestamptz);
--   drop function public.resolve_prize_fine_dispute(uuid,text,text);
--   drop function public.dispute_prize_fine(uuid,text);
--   drop function public.cancel_prize_fine(uuid,text);
--   drop function public.mark_prize_fine_paid(uuid);
--   drop function public.issue_prize_fine(uuid,uuid,text,int,text);
--   drop function public.force_open_shift(uuid);
--   drop function public.close_shift_claims(uuid);
--   drop function public.update_shift_safe(uuid,timestamptz,timestamptz,text,int);
--   drop function public.delete_shift_safe(uuid,text);
--   drop table public.clock_correction_requests;
--   alter table public.prize_fine_events drop column dispute_reason, drop column disputed_at,
--     drop column issued_by, drop column canceled_reason, drop column canceled_by, drop column canceled_at;
--   (The 'disputed' enum label added by 20260823110000 cannot be removed —
--    Postgres has no DROP VALUE. Leaving it costs nothing once no row uses it.)
--   alter table public.memberships drop column last_active_at;
--   alter table public.shifts drop column deleted_at;
--   (Reverting create_shifts_bulk to prior definition requires re-running the
--   prior migration's version.)
