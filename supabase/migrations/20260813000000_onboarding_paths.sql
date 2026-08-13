-- Onboarding paths: first-owner RPC + join-code + apply-to-store flow.
-- Fixes the RLS chicken-and-egg on first store creation and adds a second
-- way in for users whose manager gave them a store's join code.

set check_function_bodies = off;

-- =====================================================================
-- 1. stores: opt-in join_code
-- =====================================================================

alter table public.stores add column if not exists join_code text unique;
create index if not exists stores_join_code_idx on public.stores(join_code) where join_code is not null;

-- =====================================================================
-- 2. store_applications: user asks to join, manager approves
-- =====================================================================

do $$ begin
  create type public.application_status as enum ('pending','approved','declined','withdrawn');
exception when duplicate_object then null; end $$;

create table if not exists public.store_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  note text,
  status public.application_status not null default 'pending',
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  decision_reason text
);
create unique index if not exists store_applications_one_pending_idx
  on public.store_applications(user_id, store_id) where status = 'pending';
create index if not exists store_applications_store_status_idx
  on public.store_applications(store_id, status, submitted_at desc);
create index if not exists store_applications_user_idx
  on public.store_applications(user_id, submitted_at desc);

alter table public.store_applications enable row level security;

drop policy if exists store_applications_self_select on public.store_applications;
create policy store_applications_self_select on public.store_applications for select
  using (user_id = auth.uid()
         or public.has_role_on(store_id, array['owner','manager']::public.role[]));

drop policy if exists store_applications_manager_update on public.store_applications;
create policy store_applications_manager_update on public.store_applications for update
  using (public.has_role_on(store_id, array['owner','manager']::public.role[])
         or (user_id = auth.uid() and status = 'pending'));
-- (applicant can withdraw their own pending app; the check on status happens
-- at the app layer since RLS with_check can't compare old vs new state.)

grant select, insert, update on public.store_applications to authenticated;

-- =====================================================================
-- 3. RPCs (all SECURITY DEFINER; do their own permission checks)
-- =====================================================================

-- 3a. Create a store + insert the owner membership atomically.
-- Fixes the mega-PR bug where the owner membership insert was blocked
-- by memberships_manager_insert (which requires an existing role).
create or replace function public.create_store_with_owner(
  p_name text,
  p_timezone text default 'Asia/Ho_Chi_Minh',
  p_currency text default 'VND'
) returns public.stores
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_store public.stores;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'store name required' using errcode = '22023';
  end if;

  insert into public.stores (name, timezone, currency, created_by)
  values (trim(p_name), p_timezone, p_currency, v_uid)
  returning * into v_store;

  insert into public.memberships (user_id, store_id, role, employment_type, active)
  values (v_uid, v_store.id, 'owner', 'full_time', true);

  return v_store;
end $$;

-- 3b. Regenerate the join code. Owner + manager only.
create or replace function public.regenerate_join_code(p_store_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_code text;
begin
  if not public.has_role_on(p_store_id, array['owner','manager']::public.role[]) then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  -- Short human-readable code: 12 hex chars. Retry on the (rare) collision.
  loop
    v_code := lower(substr(encode(gen_random_bytes(6), 'hex'), 1, 12));
    begin
      update public.stores set join_code = v_code where id = p_store_id;
      exit;
    exception when unique_violation then
      -- try again
    end;
  end loop;

  return v_code;
end $$;

-- 3c. Submit an application to join a store, keyed on join_code.
-- Any authed user. Rejects if the code is unknown, if the user already has
-- a membership on that store, or if they already have a pending application.
create or replace function public.submit_application(
  p_join_code text,
  p_note text default null
) returns public.store_applications
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_store_id uuid;
  v_app public.store_applications;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select id into v_store_id
    from public.stores
   where join_code = lower(trim(p_join_code));

  if v_store_id is null then
    raise exception 'unknown join code' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.memberships
     where store_id = v_store_id and user_id = v_uid and active
  ) then
    raise exception 'already a member' using errcode = '23505';
  end if;

  insert into public.store_applications (user_id, store_id, note)
  values (v_uid, v_store_id, nullif(trim(p_note), ''))
  returning * into v_app;

  return v_app;
end $$;

-- 3d. Look up a store by join_code without exposing full row. Returns
-- {id, name} only — used by the onboarding page to preview "you're
-- applying to Mau Heritage District 1" before submitting.
create or replace function public.preview_store_by_code(p_join_code text)
returns table (id uuid, name text)
language sql security definer set search_path = public as $$
  select s.id, s.name
    from public.stores s
   where s.join_code = lower(trim(p_join_code));
$$;

-- 3e. Approve an application: creates membership + optional rate history.
-- Owner + manager only. Atomic — either the app is marked approved and
-- the membership exists, or neither.
create or replace function public.approve_application(
  p_id uuid,
  p_role public.role,
  p_employment_type public.employment_type,
  p_hourly_rate_cents integer default 0
) returns public.memberships
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_app public.store_applications;
  v_member public.memberships;
begin
  select * into v_app
    from public.store_applications
   where id = p_id and status = 'pending'
   for update;

  if not found then
    raise exception 'application not found or already decided' using errcode = 'P0002';
  end if;

  if not public.has_role_on(v_app.store_id, array['owner','manager']::public.role[]) then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  if p_hourly_rate_cents < 0 then
    raise exception 'rate must be >= 0' using errcode = '22023';
  end if;

  insert into public.memberships (user_id, store_id, role, employment_type, active)
  values (v_app.user_id, v_app.store_id, p_role, p_employment_type, true)
  on conflict (user_id, store_id) do update
    set role = excluded.role, employment_type = excluded.employment_type, active = true
  returning * into v_member;

  if p_hourly_rate_cents > 0 then
    insert into public.rate_history (user_id, store_id, hourly_rate_cents, changed_by)
    values (v_app.user_id, v_app.store_id, p_hourly_rate_cents, v_uid);
  end if;

  update public.store_applications
     set status = 'approved', decided_at = now(), decided_by = v_uid
   where id = p_id;

  return v_member;
end $$;

-- 3f. Decline an application. Owner + manager only.
create or replace function public.decline_application(
  p_id uuid,
  p_reason text default null
) returns public.store_applications
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_app public.store_applications;
begin
  select * into v_app
    from public.store_applications
   where id = p_id and status = 'pending'
   for update;

  if not found then
    raise exception 'application not found or already decided' using errcode = 'P0002';
  end if;

  if not public.has_role_on(v_app.store_id, array['owner','manager']::public.role[]) then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  update public.store_applications
     set status = 'declined',
         decided_at = now(),
         decided_by = v_uid,
         decision_reason = nullif(trim(p_reason), '')
   where id = p_id
   returning * into v_app;

  return v_app;
end $$;

-- 3g. Withdraw own pending application. Applicant only.
create or replace function public.withdraw_application(p_id uuid)
returns public.store_applications
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_app public.store_applications;
begin
  update public.store_applications
     set status = 'withdrawn', decided_at = now()
   where id = p_id and user_id = v_uid and status = 'pending'
   returning * into v_app;

  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;

  return v_app;
end $$;

grant execute on function public.create_store_with_owner(text, text, text) to authenticated;
grant execute on function public.regenerate_join_code(uuid) to authenticated;
grant execute on function public.submit_application(text, text) to authenticated;
grant execute on function public.preview_store_by_code(text) to authenticated;
grant execute on function public.approve_application(uuid, public.role, public.employment_type, integer) to authenticated;
grant execute on function public.decline_application(uuid, text) to authenticated;
grant execute on function public.withdraw_application(uuid) to authenticated;
