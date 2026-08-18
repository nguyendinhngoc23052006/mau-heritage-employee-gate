-- Ships four things at once because they share the same clock/shift/store surface:
--   1) Geofence stamp on every clock event (opt-in enforcement per store).
--   2) Auto-link clock_events + sales_reports to the caller's active shift.
--   3) Manager-triggered auto-clockout sweep for forgotten shifts, with a review queue.
--   4) Per-store variance threshold for large-variance approval confirms in the UI.
-- All new columns are nullable/default so existing rows keep working.

set check_function_bodies = off;

-- 1. stores: geofence config + variance threshold
alter table public.stores
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists geofence_radius_m integer not null default 150 check (geofence_radius_m > 0),
  add column if not exists require_geofence boolean not null default false,
  add column if not exists variance_threshold_pct integer not null default 5 check (variance_threshold_pct between 0 and 100);

-- 2. clock_events: capture claimed location + server verdict
alter table public.clock_events
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists accuracy_m double precision,
  add column if not exists distance_m double precision,
  add column if not exists location_verified boolean;

-- 3. attendance_flags: manager review queue for auto-outs and geofence misses
create table if not exists public.attendance_flags (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  clock_event_id uuid references public.clock_events(id) on delete set null,
  kind text not null check (kind in ('auto_clockout','geofence_miss')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolution_note text
);
create index if not exists attendance_flags_store_idx on public.attendance_flags(store_id, created_at desc);
create index if not exists attendance_flags_open_idx on public.attendance_flags(store_id, resolved_at) where resolved_at is null;

alter table public.attendance_flags enable row level security;
drop policy if exists attendance_flags_visible on public.attendance_flags;
create policy attendance_flags_visible on public.attendance_flags for select
  using (public.is_member_of(store_id));
drop policy if exists attendance_flags_manager_update on public.attendance_flags;
create policy attendance_flags_manager_update on public.attendance_flags for update
  using (
    exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid() and m.store_id = attendance_flags.store_id
        and m.active and m.role in ('owner','manager')
    )
  )
  with check (
    exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid() and m.store_id = attendance_flags.store_id
        and m.active and m.role in ('owner','manager')
    )
  );

-- 4. Haversine helper (metres). Immutable so PostgREST can call it.
create or replace function public.haversine_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2))
      * power(sin(radians(lng2 - lng1) / 2), 2)
  ))
$$;

-- 5. pick_active_shift: the caller's shift-slot overlapping now ± 30 minutes.
--    Used by clock_in_at, clock_out_at, and submit_sales.
create or replace function public.pick_active_shift(p_uid uuid, p_store_id uuid, p_at timestamptz)
returns uuid language sql stable security definer set search_path = public as $$
  select s.id
  from public.shifts s
  join public.shift_slots sl on sl.shift_id = s.id
  where s.store_id = p_store_id
    and sl.claimed_by = p_uid
    and s.starts_at - interval '30 minutes' <= p_at
    and s.ends_at + interval '30 minutes' >= p_at
  order by s.starts_at asc
  limit 1
$$;

-- 6. clock_in_at: geofence-gated, shift-linked insert.
--    Server re-checks distance — never trust the client's own verdict.
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
    v_verified := (v_store.lat is null); -- no fence configured on store = pass
  end if;

  if v_store.require_geofence and not v_verified then
    raise exception 'outside store geofence (distance %m > radius %m)', round(coalesce(v_dist, -1)::numeric), v_store.geofence_radius_m using errcode = '42501';
  end if;

  v_shift_id := public.pick_active_shift(v_uid, p_store_id, now());

  insert into public.clock_events(store_id, user_id, shift_id, kind, at, source, idempotency_key, lat, lng, accuracy_m, distance_m, location_verified)
  values (p_store_id, v_uid, v_shift_id, 'in', now(), 'app', v_key, p_lat, p_lng, p_accuracy_m, v_dist, v_verified)
  on conflict (user_id, idempotency_key) do update set at = clock_events.at
  returning * into v_event;

  if not v_verified and v_store.lat is not null then
    insert into public.attendance_flags(store_id, user_id, clock_event_id, kind, detail)
    values (p_store_id, v_uid, v_event.id, 'geofence_miss',
      jsonb_build_object('distance_m', v_dist, 'radius_m', v_store.geofence_radius_m, 'clock_kind', 'in'));
  end if;

  return v_event;
end $$;

-- 7. clock_out_at: mirror of clock_in_at with kind='out' and separate idempotency key.
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
  on conflict (user_id, idempotency_key) do update set at = clock_events.at
  returning * into v_event;

  if not v_verified and v_store.lat is not null then
    insert into public.attendance_flags(store_id, user_id, clock_event_id, kind, detail)
    values (p_store_id, v_uid, v_event.id, 'geofence_miss',
      jsonb_build_object('distance_m', v_dist, 'radius_m', v_store.geofence_radius_m, 'clock_kind', 'out'));
  end if;

  return v_event;
end $$;

-- 8. auto_clockout_stale: manager-triggered sweep. Closes any unpaired 'in'
--    from the last 48h whose linked shift ended > 30m ago (or ins > 30m ago
--    if there is no linked shift), inserts kind='auto' out at min(now, ends_at),
--    and files an attendance flag for review.
create or replace function public.auto_clockout_stale(p_store_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_count integer := 0;
  r record;
  v_out_at timestamptz;
  v_key text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.memberships m
    where m.user_id = v_uid and m.store_id = p_store_id
      and m.active and m.role in ('owner','manager')
  ) then
    raise exception 'not a manager of this store' using errcode = '42501';
  end if;

  for r in
    select ce.id as in_event_id, ce.user_id, ce.shift_id, ce.at as in_at, s.ends_at
    from public.clock_events ce
    left join public.shifts s on s.id = ce.shift_id
    where ce.store_id = p_store_id
      and ce.kind = 'in'
      and ce.at >= now() - interval '48 hours'
      and not exists (
        select 1 from public.clock_events oe
        where oe.user_id = ce.user_id
          and oe.store_id = ce.store_id
          and oe.kind = 'out'
          and oe.at > ce.at
          and oe.at <= ce.at + interval '48 hours'
      )
      and (s.ends_at is null or s.ends_at < now() - interval '30 minutes')
      and ce.at < now() - interval '30 minutes'
  loop
    v_out_at := least(now(), coalesce(r.ends_at, now()));
    v_key := 'auto:' || r.in_event_id::text;

    insert into public.clock_events(store_id, user_id, shift_id, kind, at, source, idempotency_key)
    values (p_store_id, r.user_id, r.shift_id, 'out', v_out_at, 'auto', v_key)
    on conflict (user_id, idempotency_key) do nothing;

    if found then
      insert into public.attendance_flags(store_id, user_id, kind, detail)
      values (p_store_id, r.user_id, 'auto_clockout',
        jsonb_build_object('in_event_id', r.in_event_id, 'in_at', r.in_at, 'out_at', v_out_at, 'shift_ends_at', r.ends_at));
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end $$;

-- 9. resolve_attendance_flag: manager marks a flag reviewed.
create or replace function public.resolve_attendance_flag(p_flag_id uuid, p_note text default null)
returns public.attendance_flags language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_flag public.attendance_flags;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into v_flag from public.attendance_flags where id = p_flag_id;
  if not found then raise exception 'flag not found' using errcode = 'P0002'; end if;
  if not exists (
    select 1 from public.memberships m
    where m.user_id = v_uid and m.store_id = v_flag.store_id
      and m.active and m.role in ('owner','manager')
  ) then
    raise exception 'not a manager of this store' using errcode = '42501';
  end if;
  update public.attendance_flags
    set resolved_at = now(), resolved_by = v_uid, resolution_note = p_note
  where id = p_flag_id
  returning * into v_flag;
  return v_flag;
end $$;

-- 10. Store-config setters (manager-only)
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
  update public.stores
    set lat = p_lat,
        lng = p_lng,
        geofence_radius_m = coalesce(p_radius_m, geofence_radius_m),
        require_geofence = coalesce(p_require, require_geofence)
  where id = p_store_id
  returning * into v_store;
  return v_store;
end $$;

create or replace function public.set_store_variance_threshold(
  p_store_id uuid,
  p_pct integer
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
  if p_pct is null or p_pct < 0 or p_pct > 100 then
    raise exception 'threshold must be 0..100' using errcode = '22023';
  end if;
  update public.stores set variance_threshold_pct = p_pct where id = p_store_id returning * into v_store;
  return v_store;
end $$;

-- 11. submit_sales: auto-links shift_id when the employee has an active shift.
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
    order by s.starts_at desc
    limit 1;
  end if;

  insert into public.sales_reports(store_id, user_id, shift_id, cash_cents, card_cents, qr_cents, expected_cents, note, status)
  values (p_store_id, v_uid, v_shift_id, p_cash, p_card, p_qr, p_expected, p_note, 'pending')
  returning * into v_row;
  return v_row;
end $$;

-- 12. Grants
grant execute on function public.haversine_m(double precision, double precision, double precision, double precision) to authenticated;
grant execute on function public.pick_active_shift(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.clock_in_at(uuid, double precision, double precision, double precision) to authenticated;
grant execute on function public.clock_out_at(uuid, double precision, double precision, double precision) to authenticated;
grant execute on function public.auto_clockout_stale(uuid) to authenticated;
grant execute on function public.resolve_attendance_flag(uuid, text) to authenticated;
grant execute on function public.set_store_geofence(uuid, double precision, double precision, integer, boolean) to authenticated;
grant execute on function public.set_store_variance_threshold(uuid, integer) to authenticated;
grant execute on function public.submit_sales(uuid, integer, integer, integer, integer, text, uuid) to authenticated;
