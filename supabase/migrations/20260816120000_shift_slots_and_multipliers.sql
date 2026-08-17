-- Bulk scheduling: shift_slots table + slot_count/claim_open on shifts +
-- pay_multipliers table + 4 new RPCs + data shim + retire claim_shift.

set check_function_bodies = off;

-- =====================================================================
-- 1. shifts: new columns for bulk + gating
-- =====================================================================
alter table public.shifts
  add column if not exists slot_count integer not null default 1
    check (slot_count between 1 and 20);
alter table public.shifts
  add column if not exists claim_open boolean not null default false;

-- =====================================================================
-- 2. shift_slots table
-- =====================================================================
create table if not exists public.shift_slots (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists shift_slots_shift_idx on public.shift_slots(shift_id);
create index if not exists shift_slots_claimed_by_idx on public.shift_slots(claimed_by, store_id);

-- Trigger: ensure store_id on slot matches store_id on parent shift
create or replace function public.check_shift_slot_store_matches()
returns trigger language plpgsql as $$
declare v_shift_store uuid;
begin
  select store_id into v_shift_store from public.shifts where id = new.shift_id;
  if v_shift_store is null then
    raise exception 'shift not found' using errcode = 'P0002';
  end if;
  if v_shift_store <> new.store_id then
    raise exception 'slot.store_id must match shift.store_id' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists shift_slots_store_matches on public.shift_slots;
create trigger shift_slots_store_matches
  before insert or update on public.shift_slots
  for each row execute function public.check_shift_slot_store_matches();

alter table public.shift_slots enable row level security;

-- Members can read slots for their store
drop policy if exists shift_slots_member_select on public.shift_slots;
create policy shift_slots_member_select on public.shift_slots for select
  using (public.is_member_of(store_id));

-- No direct insert/update/delete policies — RPCs only.

-- =====================================================================
-- 3. pay_multipliers table
-- =====================================================================
create table if not exists public.pay_multipliers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  date date not null,
  multiplier numeric(4,2) not null check (multiplier > 0 and multiplier <= 5),
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, date)
);
create index if not exists pay_multipliers_store_date_idx
  on public.pay_multipliers(store_id, date);

alter table public.pay_multipliers enable row level security;

drop policy if exists pay_multipliers_member_select on public.pay_multipliers;
create policy pay_multipliers_member_select on public.pay_multipliers for select
  using (public.is_member_of(store_id));

drop policy if exists pay_multipliers_manager_all on public.pay_multipliers;
create policy pay_multipliers_manager_all on public.pay_multipliers for all
  using (public.has_role_on(store_id, array['owner','manager']::public.role[]))
  with check (public.has_role_on(store_id, array['owner','manager']::public.role[]));

grant select, insert, update, delete on public.pay_multipliers to authenticated;

-- =====================================================================
-- 4. shift_claims: add slot_id for the new audit path
-- =====================================================================
alter table public.shift_claims
  add column if not exists slot_id uuid references public.shift_slots(id) on delete cascade;
create index if not exists shift_claims_slot_idx on public.shift_claims(slot_id, attempted_at desc);

-- =====================================================================
-- 5. Data shim: create one slot per existing shift, preserving claimed state
-- =====================================================================
insert into public.shift_slots (shift_id, store_id, claimed_by, claimed_at, created_at)
select s.id, s.store_id, s.claimed_by, s.claimed_at, s.created_at
  from public.shifts s
 where not exists (select 1 from public.shift_slots ss where ss.shift_id = s.id);

update public.shifts
   set slot_count = 1, claim_open = true
 where slot_count is null or claim_open is null or claim_open = false;

-- =====================================================================
-- 6. RPCs: claim_slot, release_slot, set_shift_claim_open, set_store_claim_open, create_shifts_bulk
-- =====================================================================

-- 6a. claim_slot — atomic FCFS + gate check
create or replace function public.claim_slot(p_slot_id uuid)
returns public.shift_slots language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_slot public.shift_slots;
  v_shift public.shifts;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_slot from public.shift_slots where id = p_slot_id;
  if not found then
    raise exception 'slot not found' using errcode = 'P0002';
  end if;

  select * into v_shift from public.shifts where id = v_slot.shift_id;
  if not v_shift.claim_open then
    insert into public.shift_claims(shift_id, user_id, slot_id, succeeded)
      values (v_slot.shift_id, v_uid, p_slot_id, false);
    raise exception 'shift is not open for claim' using errcode = '42501';
  end if;

  update public.shift_slots
     set claimed_by = v_uid, claimed_at = now()
   where id = p_slot_id
     and claimed_by is null
     and public.is_member_of(store_id)
  returning * into v_slot;

  insert into public.shift_claims(shift_id, user_id, slot_id, succeeded)
    values ((select shift_id from public.shift_slots where id = p_slot_id), v_uid, p_slot_id, v_slot.id is not null);

  return v_slot;
end $$;

grant execute on function public.claim_slot(uuid) to authenticated;

-- 6b. release_slot — self-release within 5-minute window
create or replace function public.release_slot(p_slot_id uuid)
returns public.shift_slots language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_slot public.shift_slots;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  update public.shift_slots
     set claimed_by = null, claimed_at = null
   where id = p_slot_id
     and claimed_by = v_uid
     and claimed_at > now() - interval '5 minutes'
  returning * into v_slot;

  if not found then
    raise exception 'cannot release this slot (not yours, or release window expired)' using errcode = '42501';
  end if;

  return v_slot;
end $$;

grant execute on function public.release_slot(uuid) to authenticated;

-- 6c. set_shift_claim_open — manager toggles a single shift's gate
create or replace function public.set_shift_claim_open(p_shift_id uuid, p_open boolean)
returns public.shifts language plpgsql security definer set search_path = public as $$
declare
  v_shift public.shifts;
begin
  if not public.has_role_on(
    (select store_id from public.shifts where id = p_shift_id),
    array['owner','manager']::public.role[]
  ) then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  update public.shifts set claim_open = p_open where id = p_shift_id
    returning * into v_shift;

  if not found then
    raise exception 'shift not found' using errcode = 'P0002';
  end if;

  return v_shift;
end $$;

grant execute on function public.set_shift_claim_open(uuid, boolean) to authenticated;

-- 6d. set_store_claim_open — flip all shifts starting in next 14 days
create or replace function public.set_store_claim_open(p_store_id uuid, p_open boolean)
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if not public.has_role_on(p_store_id, array['owner','manager']::public.role[]) then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  update public.shifts
     set claim_open = p_open
   where store_id = p_store_id
     and starts_at between now() and now() + interval '14 days';

  get diagnostics v_count = row_count;
  return v_count;
end $$;

grant execute on function public.set_store_claim_open(uuid, boolean) to authenticated;

-- 6e. create_shifts_bulk — atomic bulk create of shifts + slots
create or replace function public.create_shifts_bulk(p_store_id uuid, p_shifts jsonb)
returns setof public.shifts language plpgsql security definer set search_path = public as $$
declare
  v_shift_input jsonb;
  v_shift public.shifts;
  v_slot_count integer;
  i integer;
begin
  if not public.has_role_on(p_store_id, array['owner','manager']::public.role[]) then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  if jsonb_typeof(p_shifts) <> 'array' then
    raise exception 'p_shifts must be a JSON array' using errcode = '22023';
  end if;

  for v_shift_input in select * from jsonb_array_elements(p_shifts) loop
    v_slot_count := coalesce((v_shift_input->>'slot_count')::integer, 1);
    if v_slot_count < 1 or v_slot_count > 20 then
      raise exception 'slot_count must be between 1 and 20' using errcode = '22023';
    end if;

    insert into public.shifts (store_id, starts_at, ends_at, notes, slot_count, claim_open, created_by, status)
    values (
      p_store_id,
      (v_shift_input->>'starts_at')::timestamptz,
      (v_shift_input->>'ends_at')::timestamptz,
      nullif(v_shift_input->>'notes', ''),
      v_slot_count,
      coalesce((v_shift_input->>'claim_open')::boolean, false),
      auth.uid(),
      'open'
    )
    returning * into v_shift;

    for i in 1..v_slot_count loop
      insert into public.shift_slots (shift_id, store_id) values (v_shift.id, p_store_id);
    end loop;

    return next v_shift;
  end loop;
end $$;

grant execute on function public.create_shifts_bulk(uuid, jsonb) to authenticated;

-- =====================================================================
-- 7. Retire claim_shift RPC — replaced by claim_slot
-- =====================================================================
drop function if exists public.claim_shift(uuid);

-- =====================================================================
-- 8. Grants + audit trail — verify existing store_applications hardening still stands
-- =====================================================================
grant select, insert, update on public.shift_slots to authenticated;
