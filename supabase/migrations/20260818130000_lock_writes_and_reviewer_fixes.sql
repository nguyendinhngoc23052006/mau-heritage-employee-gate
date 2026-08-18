-- Fixer batch from Reviewer Swarm 1 (SQL/RLS + TS/React + anti-cheat/UX):
--   1. Force sales_reports + clock_events writes through the SECURITY DEFINER RPCs
--      by dropping the self-insert policies (revoking direct REST insert bypass).
--   2. Revoke `pick_active_shift` from authenticated (only called internally by
--      the definer RPCs, which run as owner).
--   3. Tighten attendance_flags visibility to owner/manager only.
--   4. Reject `set_store_geofence` when require=true but coords are null; also
--      validate lat/lng ranges.
--   5. Fix duplicate attendance_flags on idempotent-retry AND fix the spurious
--      geofence_miss flag when a store has a fence configured but not enforced
--      and the client omits coords.
--   6. Align submit_sales' shift auto-link tie-break with clock_in_at (prefer
--      currently-active shift, then upcoming, then just-ended — never the wrong
--      end of two adjacent same-day shifts).
-- All changes are backwards-compatible: existing rows keep working, no data loss.

set check_function_bodies = off;

-- 1. Drop direct-insert self policies so REST clients cannot bypass the RPCs.
--    Every writable path now goes through submit_sales / clock_in_at / clock_out_at,
--    which enforce membership, geofence, non-negative amounts, and status='pending'.
drop policy if exists sales_reports_self_insert on public.sales_reports;
drop policy if exists clock_events_self_insert on public.clock_events;

-- 2. pick_active_shift: revoke from authenticated (definer RPCs still call it fine
--    because they run as the function owner). This closes the cross-tenant probe.
revoke execute on function public.pick_active_shift(uuid, uuid, timestamptz) from authenticated;

-- 3. attendance_flags: tighten SELECT to owner/manager only.
drop policy if exists attendance_flags_visible on public.attendance_flags;
create policy attendance_flags_visible on public.attendance_flags for select
  using (
    exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid() and m.store_id = attendance_flags.store_id
        and m.active and m.role in ('owner','manager')
    )
  );

-- 4. set_store_geofence: refuse require=true with null coords; validate ranges.
create or replace function public.set_store_geofence(
  p_store_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer,
  p_require boolean
) returns public.stores language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_store public.stores;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.memberships m
    where m.user_id = v_uid and m.store_id = p_store_id
      and m.active and m.role in ('owner','manager')
  ) then
    raise exception 'not a manager of this store' using errcode = '42501';
  end if;
  if p_radius_m is not null and p_radius_m <= 0 then
    raise exception 'radius must be positive' using errcode = '22023';
  end if;
  if p_lat is not null and (p_lat < -90 or p_lat > 90) then
    raise exception 'lat must be in [-90, 90]' using errcode = '22023';
  end if;
  if p_lng is not null and (p_lng < -180 or p_lng > 180) then
    raise exception 'lng must be in [-180, 180]' using errcode = '22023';
  end if;
  if coalesce(p_require, false) and (p_lat is null or p_lng is null) then
    raise exception 'cannot require geofence without both lat and lng' using errcode = '22023';
  end if;
  update public.stores
    set lat = p_lat,
        lng = p_lng,
        geofence_radius_m = coalesce(p_radius_m, geofence_radius_m),
        require_geofence = coalesce(p_require, require_geofence)
  where id = p_store_id
  returning * into v_store;
  return v_store;
end $$;

-- 5. clock_in_at / clock_out_at: gate the geofence_miss flag on
--    (a) this call actually inserted a fresh row (not an idempotency retry) AND
--    (b) a distance was actually measured (v_dist is not null).
create or replace function public.clock_in_at(
  p_store_id uuid,
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy_m double precision default null
) returns public.clock_events language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_store public.stores;
  v_dist double precision;
  v_verified boolean := true;
  v_event public.clock_events;
  v_shift_id uuid;
  v_key text := 'in:' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI');
  v_is_new boolean := false;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.is_member_of(p_store_id) then
    raise exception 'not a member of this store' using errcode = '42501';
  end if;

  select * into v_store from public.stores where id = p_store_id;

  if v_store.lat is not null and v_store.lng is not null and p_lat is not null and p_lng is not null then
    v_dist := public.haversine_m(v_store.lat, v_store.lng, p_lat, p_lng);
    v_verified := v_dist <= v_store.geofence_radius_m;
  else
    v_verified := (v_store.lat is null);
  end if;

  if v_store.require_geofence and not v_verified then
    raise exception 'outside store geofence (distance %m > radius %m)', round(coalesce(v_dist, -1)::numeric), v_store.geofence_radius_m using errcode = '42501';
  end if;

  v_shift_id := public.pick_active_shift(v_uid, p_store_id, now());

  insert into public.clock_events(store_id, user_id, shift_id, kind, at, source, idempotency_key, lat, lng, accuracy_m, distance_m, location_verified)
  values (p_store_id, v_uid, v_shift_id, 'in', now(), 'app', v_key, p_lat, p_lng, p_accuracy_m, v_dist, v_verified)
  on conflict (user_id, idempotency_key) do nothing
  returning * into v_event;

  v_is_new := (v_event.id is not null);
  if not v_is_new then
    select * into v_event from public.clock_events
    where user_id = v_uid and idempotency_key = v_key;
  end if;

  if v_is_new and not v_verified and v_dist is not null then
    insert into public.attendance_flags(store_id, user_id, clock_event_id, kind, detail)
    values (p_store_id, v_uid, v_event.id, 'geofence_miss',
      jsonb_build_object('distance_m', v_dist, 'radius_m', v_store.geofence_radius_m, 'clock_kind', 'in'));
  end if;

  return v_event;
end $$;

create or replace function public.clock_out_at(
  p_store_id uuid,
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy_m double precision default null
) returns public.clock_events language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_store public.stores;
  v_dist double precision;
  v_verified boolean := true;
  v_event public.clock_events;
  v_shift_id uuid;
  v_key text := 'out:' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI');
  v_is_new boolean := false;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.is_member_of(p_store_id) then
    raise exception 'not a member of this store' using errcode = '42501';
  end if;

  select * into v_store from public.stores where id = p_store_id;

  if v_store.lat is not null and v_store.lng is not null and p_lat is not null and p_lng is not null then
    v_dist := public.haversine_m(v_store.lat, v_store.lng, p_lat, p_lng);
    v_verified := v_dist <= v_store.geofence_radius_m;
  else
    v_verified := (v_store.lat is null);
  end if;

  if v_store.require_geofence and not v_verified then
    raise exception 'outside store geofence (distance %m > radius %m)', round(coalesce(v_dist, -1)::numeric), v_store.geofence_radius_m using errcode = '42501';
  end if;

  v_shift_id := public.pick_active_shift(v_uid, p_store_id, now());

  insert into public.clock_events(store_id, user_id, shift_id, kind, at, source, idempotency_key, lat, lng, accuracy_m, distance_m, location_verified)
  values (p_store_id, v_uid, v_shift_id, 'out', now(), 'app', v_key, p_lat, p_lng, p_accuracy_m, v_dist, v_verified)
  on conflict (user_id, idempotency_key) do nothing
  returning * into v_event;

  v_is_new := (v_event.id is not null);
  if not v_is_new then
    select * into v_event from public.clock_events
    where user_id = v_uid and idempotency_key = v_key;
  end if;

  if v_is_new and not v_verified and v_dist is not null then
    insert into public.attendance_flags(store_id, user_id, clock_event_id, kind, detail)
    values (p_store_id, v_uid, v_event.id, 'geofence_miss',
      jsonb_build_object('distance_m', v_dist, 'radius_m', v_store.geofence_radius_m, 'clock_kind', 'out'));
  end if;

  return v_event;
end $$;

-- 6. submit_sales: align shift-link tie-break with clock_in_at.
--    Prefer a currently-active shift over an upcoming one over a just-ended one;
--    within same priority, closest by start.
create or replace function public.submit_sales(
  p_store_id uuid,
  p_cash integer,
  p_card integer,
  p_qr integer,
  p_expected integer default null,
  p_note text default null,
  p_shift_id uuid default null
) returns public.sales_reports language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_shift_id uuid := p_shift_id;
  v_row public.sales_reports;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if not public.is_member_of(p_store_id) then raise exception 'not a member of this store' using errcode = '42501'; end if;
  if p_cash < 0 or p_card < 0 or p_qr < 0 then raise exception 'amounts must be non-negative' using errcode = '22023'; end if;

  if v_shift_id is null then
    select s.id into v_shift_id
    from public.shifts s
    join public.shift_slots sl on sl.shift_id = s.id
    where s.store_id = p_store_id and sl.claimed_by = v_uid
      and s.ends_at >= now() - interval '4 hours'
      and s.starts_at <= now() + interval '1 hour'
    order by
      case
        when now() between s.starts_at and s.ends_at then 0
        when now() < s.starts_at then 1
        else 2
      end asc,
      abs(extract(epoch from (now() - s.starts_at))) asc
    limit 1;
  end if;

  insert into public.sales_reports(store_id, user_id, shift_id, cash_cents, card_cents, qr_cents, expected_cents, note, status)
  values (p_store_id, v_uid, v_shift_id, p_cash, p_card, p_qr, p_expected, p_note, 'pending')
  returning * into v_row;
  return v_row;
end $$;

-- 7. Also align pick_active_shift's tie-break for the clock_in/out path.
create or replace function public.pick_active_shift(p_uid uuid, p_store_id uuid, p_at timestamptz)
returns uuid language sql stable security definer set search_path = public as $$
  select s.id
  from public.shifts s
  join public.shift_slots sl on sl.shift_id = s.id
  where s.store_id = p_store_id
    and sl.claimed_by = p_uid
    and s.starts_at - interval '30 minutes' <= p_at
    and s.ends_at + interval '30 minutes' >= p_at
  order by
    case
      when p_at between s.starts_at and s.ends_at then 0
      when p_at < s.starts_at then 1
      else 2
    end asc,
    abs(extract(epoch from (p_at - s.starts_at))) asc
  limit 1
$$;
-- Re-establish revoke (a CREATE OR REPLACE resets grants on some Postgres builds).
revoke execute on function public.pick_active_shift(uuid, uuid, timestamptz) from authenticated;
