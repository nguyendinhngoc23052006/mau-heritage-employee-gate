-- Schema hardening: close composite-FK gaps + state-machine holes.
-- Assumes fresh demo DB; every part cleans orphans defensively before adding the constraint.

set check_function_bodies = off;

-- =====================================================================
-- 1. clock_events: composite FK to memberships(user_id, store_id)
-- =====================================================================
delete from public.clock_events
 where (user_id, store_id) not in (select user_id, store_id from public.memberships);
alter table public.clock_events
  add constraint clock_events_membership_fk
  foreign key (user_id, store_id) references public.memberships(user_id, store_id)
  on delete cascade;

-- =====================================================================
-- 2. sales_reports: composite FK to memberships
-- =====================================================================
delete from public.sales_reports
 where (user_id, store_id) not in (select user_id, store_id from public.memberships);
alter table public.sales_reports
  add constraint sales_reports_membership_fk
  foreign key (user_id, store_id) references public.memberships(user_id, store_id)
  on delete cascade;

-- =====================================================================
-- 3. point_events: composite FK to memberships
-- =====================================================================
delete from public.point_events
 where (user_id, store_id) not in (select user_id, store_id from public.memberships);
alter table public.point_events
  add constraint point_events_membership_fk
  foreign key (user_id, store_id) references public.memberships(user_id, store_id)
  on delete cascade;

-- =====================================================================
-- 4. prize_fine_events: composite FK to memberships
-- =====================================================================
delete from public.prize_fine_events
 where (user_id, store_id) not in (select user_id, store_id from public.memberships);
alter table public.prize_fine_events
  add constraint prize_fine_events_membership_fk
  foreign key (user_id, store_id) references public.memberships(user_id, store_id)
  on delete cascade;

-- =====================================================================
-- 5. rule_events: composite FK on (target_user_id, store_id)
-- =====================================================================
delete from public.rule_events
 where (target_user_id, store_id) not in (select user_id, store_id from public.memberships);
alter table public.rule_events
  add constraint rule_events_membership_fk
  foreign key (target_user_id, store_id) references public.memberships(user_id, store_id)
  on delete cascade;

-- =====================================================================
-- 6. rule_events: trigger — store_id must match the rule's store_id
-- =====================================================================
create or replace function public.check_rule_event_store_consistency()
returns trigger language plpgsql as $$
declare v_rule_store uuid;
begin
  select store_id into v_rule_store from public.rules where id = new.rule_id;
  if v_rule_store is null then
    raise exception 'rule not found' using errcode = 'P0002';
  end if;
  if v_rule_store <> new.store_id then
    raise exception 'rule_event.store_id (%) must match rule.store_id (%)', new.store_id, v_rule_store using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists rule_events_store_consistency on public.rule_events;
create trigger rule_events_store_consistency
  before insert or update on public.rule_events
  for each row execute function public.check_rule_event_store_consistency();

-- =====================================================================
-- 7. store_applications: WITH CHECK on manager UPDATE (state-machine guard)
-- =====================================================================
drop policy if exists store_applications_manager_update on public.store_applications;
create policy store_applications_manager_update on public.store_applications for update
  using (public.has_role_on(store_id, array['owner','manager']::public.role[])
         or (user_id = auth.uid() and status = 'pending'))
  with check (
    case
      when public.has_role_on(store_id, array['owner','manager']::public.role[]) then
        status in ('approved', 'declined')
      when user_id = auth.uid() then
        status = 'withdrawn'
      else false
    end
  );

-- =====================================================================
-- 8. rate_history: partial unique index — one open row per (user, store)
-- =====================================================================
-- First close any duplicate open rows (keep the newest, close the rest)
with duplicates as (
  select id, row_number() over (partition by user_id, store_id order by effective_from desc) as rn
    from public.rate_history
   where effective_to is null
)
update public.rate_history rh
   set effective_to = now()
  from duplicates d
 where rh.id = d.id and d.rn > 1;

create unique index if not exists rate_history_one_open_idx
  on public.rate_history(user_id, store_id) where effective_to is null;

-- =====================================================================
-- 9. rate_history: RPC that closes prior + inserts new atomically
-- =====================================================================
create or replace function public.set_hourly_rate(
  p_store_id uuid,
  p_user_id uuid,
  p_cents integer
) returns public.rate_history
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_new public.rate_history;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.has_role_on(p_store_id, array['owner','manager']::public.role[]) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_cents < 0 then
    raise exception 'rate must be >= 0' using errcode = '22023';
  end if;

  update public.rate_history
     set effective_to = now()
   where user_id = p_user_id and store_id = p_store_id and effective_to is null;

  insert into public.rate_history (user_id, store_id, hourly_rate_cents, changed_by)
  values (p_user_id, p_store_id, p_cents, v_uid)
  returning * into v_new;

  return v_new;
end $$;

grant execute on function public.set_hourly_rate(uuid, uuid, integer) to authenticated;

-- =====================================================================
-- 10. shift_swaps: trigger — both users must be members of the shift's store
-- =====================================================================
create or replace function public.check_shift_swap_users_in_store()
returns trigger language plpgsql as $$
declare v_store_id uuid;
begin
  select store_id into v_store_id from public.shifts where id = new.shift_id;
  if v_store_id is null then
    raise exception 'shift not found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.memberships
     where user_id = new.from_user_id and store_id = v_store_id and active
  ) then
    raise exception 'from_user is not an active member of the shift store' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.memberships
     where user_id = new.to_user_id and store_id = v_store_id and active
  ) then
    raise exception 'to_user is not an active member of the shift store' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists shift_swaps_users_in_store on public.shift_swaps;
create trigger shift_swaps_users_in_store
  before insert on public.shift_swaps
  for each row execute function public.check_shift_swap_users_in_store();

-- =====================================================================
-- 11. sales_reports.dispute_reason NOT NULL when status='disputed'
--     + point_events.delta range check
-- =====================================================================
alter table public.sales_reports
  drop constraint if exists sales_dispute_reason_check;
alter table public.sales_reports
  add constraint sales_dispute_reason_check
  check (status <> 'disputed' or dispute_reason is not null);

alter table public.point_events
  drop constraint if exists point_events_delta_range;
alter table public.point_events
  add constraint point_events_delta_range
  check (delta between -100000 and 100000);
