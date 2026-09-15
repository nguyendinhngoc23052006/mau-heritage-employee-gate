-- Kwook Việt Nam internal gate: a three-tier organisation above the stores.
--
--   tier 1  sysadmin / ceo        profiles.global_role
--   tier 2  director of a sector  sector_memberships
--   tier 3  manager of a store    memberships.role in (owner, manager)
--   tier 4  employee              memberships.role = employee, or unassigned
--
-- One rule everywhere: you act only on people strictly below you, inside your
-- own branch. set_role() is the single writer of any role; two triggers make
-- every other path fail. Stores keep their name and every table keyed on them:
-- is_member_of() and has_role_on() become hierarchy-aware, so all 60 existing
-- policies grant the director and tier 1 the same access as the store's own
-- managers without rewriting a single one.

-- 1. tier 1 -------------------------------------------------------------------
do $$ begin
  create type public.global_role as enum ('sysadmin', 'ceo');
exception when duplicate_object then null; end $$;

alter table public.profiles
  add column if not exists global_role public.global_role;

-- 2. tier 2: sectors, and directors of sectors ---------------------------------
create table if not exists public.sectors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.sectors enable row level security;

alter table public.stores
  add column if not exists sector_id uuid references public.sectors(id) on delete restrict;
create index if not exists stores_sector_idx on public.stores(sector_id);

create table if not exists public.sector_memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  sector_id uuid not null references public.sectors(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, sector_id)
);
create index if not exists sector_memberships_sector_idx
  on public.sector_memberships(sector_id);
alter table public.sector_memberships enable row level security;

-- 3. tier arithmetic ------------------------------------------------------------
create or replace function public.tier_of(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.profiles p
                  where p.id = p_user and p.global_role is not null) then 1
    when exists (select 1 from public.sector_memberships sm
                  where sm.user_id = p_user and sm.active) then 2
    when exists (select 1 from public.memberships m
                  where m.user_id = p_user and m.active
                    and m.role in ('owner', 'manager')) then 3
    else 4
  end;
$$;

create or replace function public.my_tier()
returns int language sql stable security definer set search_path = public as $$
  select public.tier_of(auth.uid());
$$;

create or replace function public.role_tier(p_role text)
returns int language sql immutable as $$
  select case p_role
    when 'sysadmin' then 1
    when 'ceo'      then 1
    when 'director' then 2
    when 'owner'    then 3
    when 'manager'  then 3
    when 'employee' then 4
  end;
$$;

create or replace function public.oversees_sector(p_sector_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_tier() = 1
      or exists (select 1 from public.sector_memberships sm
                  where sm.sector_id = p_sector_id
                    and sm.user_id = auth.uid() and sm.active);
$$;

-- Above the store: tier 1, or a director of its sector. The store's own
-- managers are not "above" it; has_role_on covers them.
create or replace function public.oversees_store(p_store_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_tier() = 1
      or exists (select 1 from public.stores s
                   join public.sector_memberships sm on sm.sector_id = s.sector_id
                  where s.id = p_store_id
                    and sm.user_id = auth.uid() and sm.active);
$$;

-- 4. the two helpers every policy already calls ---------------------------------
create or replace function public.is_member_of(p_store_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m
                  where m.store_id = p_store_id
                    and m.user_id = auth.uid() and m.active)
      or public.oversees_store(p_store_id);
$$;

create or replace function public.has_role_on(p_store_id uuid, p_roles public.role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m
                  where m.store_id = p_store_id
                    and m.user_id = auth.uid() and m.active
                    and m.role = any (p_roles))
      or (p_roles && array['owner', 'manager']::public.role[]
          and public.oversees_store(p_store_id));
$$;

-- May the caller act on p_target: strictly lower tier, inside the caller's
-- branch. Tier 1's branch is everyone.
create or replace function public.can_act_on(p_target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_target is not null
     and p_target <> auth.uid()
     and public.tier_of(p_target) > public.my_tier()
     and (
       public.my_tier() = 1
       or exists (select 1 from public.memberships m
                   where m.user_id = p_target and m.active
                     and public.has_role_on(m.store_id,
                           array['owner', 'manager']::public.role[]))
     );
$$;

-- 5. RLS on the new tables -------------------------------------------------------
drop policy if exists sectors_select on public.sectors;
create policy sectors_select on public.sectors for select
  using (public.oversees_sector(id)
         or exists (select 1 from public.stores s
                     where s.sector_id = sectors.id and public.is_member_of(s.id)));
drop policy if exists sectors_tier1_insert on public.sectors;
create policy sectors_tier1_insert on public.sectors for insert
  with check (public.my_tier() = 1 and created_by = auth.uid());
drop policy if exists sectors_tier1_update on public.sectors;
create policy sectors_tier1_update on public.sectors for update
  using (public.my_tier() = 1) with check (public.my_tier() = 1);
drop policy if exists sectors_tier1_delete on public.sectors;
create policy sectors_tier1_delete on public.sectors for delete
  using (public.my_tier() = 1);
grant select, insert, update, delete on public.sectors to authenticated;

drop policy if exists sector_memberships_select on public.sector_memberships;
create policy sector_memberships_select on public.sector_memberships for select
  using (user_id = auth.uid()
         or public.oversees_sector(sector_id)
         or exists (select 1 from public.stores s
                     where s.sector_id = sector_memberships.sector_id
                       and public.is_member_of(s.id)));
grant select on public.sector_memberships to authenticated;
-- No insert/update/delete policy on purpose: set_role() is the only writer.

-- 6. stores are created under a sector, by whoever oversees that sector ----------
drop policy if exists stores_insert_any_auth on public.stores;
drop policy if exists stores_overseer_insert on public.stores;
create policy stores_overseer_insert on public.stores for insert
  with check (auth.uid() is not null
              and created_by = auth.uid()
              and sector_id is not null
              and public.oversees_sector(sector_id));

-- 7. profiles: you, your store-mates, and everyone below you -------------------------
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles for select
  using (id = auth.uid()
      or public.my_tier() = 1
      or public.can_act_on(id)
      or exists (select 1 from public.memberships me, public.memberships them
                  where me.user_id = auth.uid() and me.active
                    and them.user_id = profiles.id and them.active
                    and me.store_id = them.store_id));

-- 8. a store inside a sector answers to its director; "keep an owner" stays a
--    rule for the detached legacy stores only ----------------------------------------
create or replace function public.enforce_store_has_owner()
returns trigger language plpgsql as $$
declare
  v_store_id uuid;
  v_store public.stores;
  v_owner_count int;
begin
  v_store_id := coalesce(new.store_id, old.store_id);
  select * into v_store from public.stores where id = v_store_id;
  if not found or v_store.sector_id is not null then
    return coalesce(new, old);
  end if;
  select count(*) into v_owner_count
    from public.memberships
   where store_id = v_store_id and role = 'owner' and active;
  if v_owner_count = 0 then
    raise exception 'store must retain at least one active owner'
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

-- 9. roles are written by set_role() and nothing else -------------------------------
create or replace function public.guard_role_write()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('app.set_role', true), '') = '1' then
    return new;
  end if;
  -- Invites and applications still bring people in at the bottom.
  if tg_op = 'INSERT' and new.role = 'employee' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.role = old.role then
    return new;
  end if;
  raise exception 'roles are assigned through set_role()' using errcode = '42501';
end $$;
drop trigger if exists guard_role_write on public.memberships;
create trigger guard_role_write
  before insert or update of role on public.memberships
  for each row execute function public.guard_role_write();

create or replace function public.guard_global_role_write()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('app.set_role', true), '') = '1' then
    return new;
  end if;
  if tg_op = 'INSERT' and new.global_role is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.global_role is not distinct from old.global_role then
    return new;
  end if;
  raise exception 'global roles are assigned through set_role()' using errcode = '42501';
end $$;
drop trigger if exists guard_global_role_write on public.profiles;
create trigger guard_global_role_write
  before insert or update of global_role on public.profiles
  for each row execute function public.guard_global_role_write();

-- 10. set_role(): the single writer --------------------------------------------------
--   scope 'global'  role ceo | none        sysadmin only (the one exception to
--                                          "never touch your own tier": the
--                                          sysadmin appoints and removes the CEO)
--   scope 'sector'  role director | none   tier 1 only
--   scope 'store'   role manager | employee | none
--                                          anyone managing the store, assigning
--                                          only roles below their own tier
create or replace function public.set_role(
  p_target uuid,
  p_scope text,
  p_scope_id uuid,
  p_role text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_my int;
  v_target_tier int;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_target is null or p_target = v_uid then
    raise exception 'cannot change your own role' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_target) then
    raise exception 'unknown user' using errcode = '22023';
  end if;
  v_my := public.my_tier();
  v_target_tier := public.tier_of(p_target);
  perform set_config('app.set_role', '1', true);

  if p_scope = 'global' then
    if not exists (select 1 from public.profiles
                    where id = v_uid and global_role = 'sysadmin') then
      raise exception 'only the sysadmin appoints or removes a CEO' using errcode = '42501';
    end if;
    if p_role = 'ceo' then
      update public.profiles set global_role = 'ceo'
       where id = p_target and global_role is distinct from 'sysadmin';
    elsif p_role = 'none' then
      update public.profiles set global_role = null
       where id = p_target and global_role = 'ceo';
    else
      raise exception 'global role must be ceo or none' using errcode = '22023';
    end if;
    return;
  end if;

  if v_target_tier <= v_my then
    raise exception 'cannot act on someone at or above your own tier' using errcode = '42501';
  end if;

  if p_scope = 'sector' then
    if v_my <> 1 then
      raise exception 'only tier 1 appoints directors' using errcode = '42501';
    end if;
    if not exists (select 1 from public.sectors where id = p_scope_id) then
      raise exception 'unknown sector' using errcode = '22023';
    end if;
    if p_role = 'director' then
      insert into public.sector_memberships (user_id, sector_id, active)
      values (p_target, p_scope_id, true)
      on conflict (user_id, sector_id) do update set active = true;
    elsif p_role = 'none' then
      update public.sector_memberships set active = false
       where user_id = p_target and sector_id = p_scope_id;
    else
      raise exception 'sector role must be director or none' using errcode = '22023';
    end if;
    return;
  end if;

  if p_scope = 'store' then
    if not public.has_role_on(p_scope_id, array['owner', 'manager']::public.role[]) then
      raise exception 'you do not manage this store' using errcode = '42501';
    end if;
    if p_role in ('manager', 'employee') then
      if public.role_tier(p_role) <= v_my then
        raise exception 'you can only assign roles below your own tier' using errcode = '42501';
      end if;
      insert into public.memberships (user_id, store_id, role, employment_type, active)
      values (p_target, p_scope_id, p_role::public.role, 'full_time', true)
      on conflict (user_id, store_id) do update
        set role = excluded.role, active = true;
    elsif p_role = 'none' then
      update public.memberships set active = false
       where user_id = p_target and store_id = p_scope_id;
    else
      raise exception 'store role must be manager, employee or none' using errcode = '22023';
    end if;
    return;
  end if;

  raise exception 'scope must be global, sector or store' using errcode = '22023';
end $$;
revoke all on function public.set_role(uuid, text, uuid, text) from public;
grant execute on function public.set_role(uuid, text, uuid, text) to authenticated;

-- 11. whoever is above a store may delete it ----------------------------------------
create or replace function public.delete_store(p_store_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.has_role_on(p_store_id, array['owner']::public.role[]) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  delete from public.stores where id = p_store_id;
end $$;

-- 12. self-service store creation and ownership transfer are retired: stores
--     are created under a sector by the people above it -----------------------------
drop function if exists public.create_store_with_owner(text, text, text);
drop function if exists public.reclaim_store(uuid);
drop function if exists public.transfer_ownership(uuid, uuid);
drop function if exists public.list_my_orphaned_stores();

-- 13. bootstrap: the sysadmin -----------------------------------------------------------
-- Session-scoped on purpose: if the runner executes statements outside one
-- transaction, a transaction-local flag would already be gone here.
select set_config('app.set_role', '1', false);
update public.profiles p
   set global_role = 'sysadmin'
  from auth.users u
 where u.id = p.id
   and u.email = 'nguyendinhngoc23052006@gmail.com'
   and p.global_role is null;
select set_config('app.set_role', '', false);
