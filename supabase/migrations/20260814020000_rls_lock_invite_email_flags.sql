set check_function_bodies = off;

-- =====================================================================
-- 1. Memberships RLS: close self-promotion + UPDATE role policy gap
-- =====================================================================

drop policy if exists memberships_manager_update on public.memberships;
create policy memberships_manager_update on public.memberships for update
  using (public.has_role_on(store_id, array['owner','manager']::public.role[]) or user_id = auth.uid())
  with check (
    case
      when public.has_role_on(store_id, array['owner']::public.role[]) then
        role in ('owner', 'manager', 'employee')
      when public.has_role_on(store_id, array['manager']::public.role[]) then
        role in ('manager', 'employee')
      when user_id = auth.uid() then
        role = (select m.role from public.memberships m
                 where m.user_id = memberships.user_id
                   and m.store_id = memberships.store_id)
      else false
    end
  );

-- =====================================================================
-- 2. Invite acceptance: add email-match check to close credential gap
-- =====================================================================

create or replace function public.accept_invite(p_token text)
returns public.memberships language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.invites;
  v_member public.memberships;
  v_caller_email text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_invite
    from public.invites
   where token = p_token
     and accepted_at is null
     and revoked_at is null
     and expires_at > now()
   for update;

  if not found then
    raise exception 'invalid or expired invite' using errcode = 'P0002';
  end if;

  select email into v_caller_email from auth.users where id = v_uid;
  if lower(v_caller_email) != lower(v_invite.email) then
    raise exception 'invite email does not match your account' using errcode = '42501';
  end if;

  insert into public.memberships (user_id, store_id, role, employment_type, active)
  values (v_uid, v_invite.store_id, v_invite.role, v_invite.employment_type, true)
  on conflict (user_id, store_id) do update
    set role = excluded.role, employment_type = excluded.employment_type, active = true
  returning * into v_member;

  if v_invite.hourly_rate_cents > 0 then
    insert into public.rate_history (user_id, store_id, hourly_rate_cents, changed_by)
      values (v_uid, v_invite.store_id, v_invite.hourly_rate_cents, v_invite.created_by);
  end if;

  update public.invites
     set accepted_by = v_uid, accepted_at = now()
   where id = v_invite.id;

  return v_member;
end $$;

grant execute on function public.accept_invite(text) to authenticated;

-- =====================================================================
-- 3. Feature flags table with RLS
-- =====================================================================

create table if not exists public.feature_flags (
  name text primary key,
  enabled boolean not null default false,
  description text,
  updated_at timestamptz not null default now()
);

alter table public.feature_flags enable row level security;

drop policy if exists feature_flags_read_all on public.feature_flags;
create policy feature_flags_read_all on public.feature_flags for select to authenticated using (true);

grant select on public.feature_flags to authenticated;
