-- Part A — purge the Màu Heritage era. IRREVERSIBLE. Merging this PR is the
-- approval that executes it (Supabase Free: no PITR, no backup to restore).
-- Verified by dry run against production on 2026-09-15 (rolled back):
-- deletes 4 legacy stores and, by cascade, 4 memberships, 42 shifts,
-- 63 shift_slots, 10 shift_claims, 22 clock_events, 60 audit_log rows;
-- plus all 6 Màu-era client_errors. Leaves the Kwook org untouched
-- (4 sectors; units Tiep nhan, Xu ly). Idempotent: re-running deletes nothing.
--
-- No flag needed: the migration runner has no JWT, so guard_role_write's DELETE
-- branch (auth.uid() is null) lets the membership cascade through, and
-- client_errors has no guard trigger. Setting a session-wide bypass flag here
-- would risk leaking it if a delete threw before the reset, for no benefit.
delete from public.client_errors;
delete from public.stores where sector_id is null;

-- Part B — the company as one JSON document, assembled server-side in a
-- single call. Every device fetches the same snapshot instead of walking the
-- hierarchy with per-node queries; the client only draws it. Security definer
-- on purpose: the org chart is the same picture for every signed-in person,
-- so it bypasses per-branch profile RLS — and therefore exposes ONLY display
-- names and positions, never pay, contact or account data.
-- (org_chart_unit is defined first: SQL function bodies are parsed at CREATE.)
create or replace function public.org_chart_unit(p_store_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
select jsonb_build_object(
  'id', st.id,
  'name', st.name,
  'managers', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id,
             'name', coalesce(p.display_name, left(p.id::text, 8)))
           order by p.display_name)
      from public.memberships m
      join public.profiles p on p.id = m.user_id
     where m.store_id = st.id and m.active and m.role in ('owner', 'manager')
  ), '[]'::jsonb),
  'employees', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id,
             'name', coalesce(p.display_name, left(p.id::text, 8)))
           order by p.display_name)
      from public.memberships m
      join public.profiles p on p.id = m.user_id
     where m.store_id = st.id and m.active and m.role = 'employee'
  ), '[]'::jsonb))
from public.stores st where st.id = p_store_id;
$$;

create or replace function public.org_chart()
returns jsonb language sql stable security definer set search_path = public as $$
select jsonb_build_object(
  'tier1', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id,
             'name', coalesce(p.display_name, left(p.id::text, 8)),
             'role', p.global_role)
           order by p.global_role, p.display_name)
      from public.profiles p
     where p.global_role is not null
  ), '[]'::jsonb),
  'sectors', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', s.id,
             'name', s.name,
             'directors', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'id', p.id,
                        'name', coalesce(p.display_name, left(p.id::text, 8)))
                      order by p.display_name)
                 from public.sector_memberships sm
                 join public.profiles p on p.id = sm.user_id
                where sm.sector_id = s.id and sm.active
             ), '[]'::jsonb),
             'units', coalesce((
               select jsonb_agg(public.org_chart_unit(st.id) order by st.name)
                 from public.stores st
                where st.sector_id = s.id
             ), '[]'::jsonb))
           order by s.name)
      from public.sectors s
     where s.active
  ), '[]'::jsonb),
  'unassigned', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id,
             'name', coalesce(p.display_name, left(p.id::text, 8)))
           order by p.display_name)
      from public.profiles p
     where p.global_role is null
       and not exists (select 1 from public.sector_memberships sm
                        where sm.user_id = p.id and sm.active)
       and not exists (select 1 from public.memberships m
                        where m.user_id = p.id and m.active)
  ), '[]'::jsonb)
);
$$;

revoke all on function public.org_chart() from public;
revoke all on function public.org_chart_unit(uuid) from public;
grant execute on function public.org_chart() to authenticated;
