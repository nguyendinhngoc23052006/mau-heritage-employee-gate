-- Last-owner guard + reclaim path for stores that got orphaned before
-- the guard existed. Repairs the edge case where an owner demoted or
-- deactivated themselves and left the store with zero manageable users.

set check_function_bodies = off;

-- =====================================================================
-- 1. Enforce: a store must always have at least one active owner.
-- =====================================================================
--
-- Runs AFTER UPDATE on public.memberships. If the operation left the
-- store with zero active owners, raise and roll back. Delete cascades
-- from stores are safe because the stores row is already gone at check
-- time — we skip in that case.

create or replace function public.enforce_store_has_owner()
returns trigger language plpgsql as $$
declare
  v_store_id uuid;
  v_owner_count int;
  v_store_exists boolean;
begin
  v_store_id := coalesce(new.store_id, old.store_id);

  select exists (select 1 from public.stores where id = v_store_id)
    into v_store_exists;
  if not v_store_exists then
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

drop trigger if exists memberships_last_owner_guard on public.memberships;
create trigger memberships_last_owner_guard
  after update or delete on public.memberships
  for each row execute function public.enforce_store_has_owner();

-- =====================================================================
-- 2. Recover: let the store's original creator reclaim ownership
--    if the store has no active owners.
-- =====================================================================

create or replace function public.list_my_orphaned_stores()
returns table (id uuid, name text, created_at timestamptz)
language sql security definer set search_path = public as $$
  select s.id, s.name, s.created_at
    from public.stores s
   where s.created_by = auth.uid()
     and not exists (
       select 1 from public.memberships m
        where m.store_id = s.id and m.role = 'owner' and m.active
     );
$$;

create or replace function public.reclaim_store(p_store_id uuid)
returns public.memberships language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_store public.stores;
  v_active_owners int;
  v_member public.memberships;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_store from public.stores where id = p_store_id;
  if not found then
    raise exception 'store not found' using errcode = 'P0002';
  end if;

  if v_store.created_by is null or v_store.created_by <> v_uid then
    raise exception 'only the original creator can reclaim'
      using errcode = '42501';
  end if;

  select count(*) into v_active_owners
    from public.memberships
   where store_id = p_store_id and role = 'owner' and active;

  if v_active_owners > 0 then
    raise exception 'store already has an active owner'
      using errcode = '23514';
  end if;

  insert into public.memberships (user_id, store_id, role, employment_type, active)
  values (v_uid, p_store_id, 'owner', 'full_time', true)
  on conflict (user_id, store_id) do update
    set role = 'owner', active = true
  returning * into v_member;

  return v_member;
end $$;

grant execute on function public.list_my_orphaned_stores() to authenticated;
grant execute on function public.reclaim_store(uuid) to authenticated;
