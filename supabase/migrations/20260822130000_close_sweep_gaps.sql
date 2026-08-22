-- Close sweep gaps found by the post-PR-25 read-only agent swarm.
-- 4 fixes, all in existing schema — no new tables, no new columns.
--
-- 1. audit_log INSERT policy currently only checks store membership; a member
--    could POST via direct REST with an arbitrary actor_id/before_json/after_json
--    and forge audit entries attributed to another user. Tighten with
--    actor_id = auth.uid(). Safe for the trigger path — write_audit() already
--    sets v_actor := auth.uid().
-- 2. clock_events had no audit trigger. Every clock in/out wrote zero audit
--    rows. Add one.
-- 3. attendance_flags audit was UPDATE-only, so flag *creation* (geofence
--    miss, auto-clockout) — the moment enforcement actually catches a cheat —
--    was invisible in the audit trail. Only the manager's later dismissal
--    was logged. Extend to INSERT + UPDATE.
-- 4. clock_in_at / clock_out_at wrote location_verified = false when the
--    store had geofence coords set but the client sent none (permission
--    denied / unsupported / require_geofence=off). Semantically wrong:
--    no measurement was performed. Switch to NULL for "not measured", and
--    treat NULL as failed only in the require_geofence enforcement path.

-- 1. Tighten audit_log INSERT.
drop policy if exists audit_log_service_insert on public.audit_log;
create policy audit_log_service_insert on public.audit_log for insert
  with check (public.is_member_of(store_id) and actor_id = auth.uid());

-- 2. Audit clock_events INSERT + UPDATE.
drop trigger if exists audit_clock_events on public.clock_events;
create trigger audit_clock_events after insert or update on public.clock_events
  for each row execute function public.write_audit();

-- 3. Audit attendance_flags INSERT too.
drop trigger if exists audit_attendance_flags on public.attendance_flags;
create trigger audit_attendance_flags after insert or update on public.attendance_flags
  for each row execute function public.write_audit();

-- 4. Clock RPCs: NULL for un-measured location.
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
  v_verified boolean;
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

  if p_lat is not null and p_lng is not null and v_store.lat is not null and v_store.lng is not null then
    v_dist := public.haversine_m(v_store.lat, v_store.lng, p_lat, p_lng);
    v_verified := v_dist <= v_store.geofence_radius_m;
  elsif v_store.lat is null then
    v_verified := true;
  else
    v_verified := null;
  end if;

  if v_store.require_geofence and coalesce(v_verified, false) = false then
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

  if v_is_new and coalesce(v_verified, true) = false and v_dist is not null then
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
  v_verified boolean;
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

  if p_lat is not null and p_lng is not null and v_store.lat is not null and v_store.lng is not null then
    v_dist := public.haversine_m(v_store.lat, v_store.lng, p_lat, p_lng);
    v_verified := v_dist <= v_store.geofence_radius_m;
  elsif v_store.lat is null then
    v_verified := true;
  else
    v_verified := null;
  end if;

  if v_store.require_geofence and coalesce(v_verified, false) = false then
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

  if v_is_new and coalesce(v_verified, true) = false and v_dist is not null then
    insert into public.attendance_flags(store_id, user_id, clock_event_id, kind, detail)
    values (p_store_id, v_uid, v_event.id, 'geofence_miss',
      jsonb_build_object('distance_m', v_dist, 'radius_m', v_store.geofence_radius_m, 'clock_kind', 'out'));
  end if;

  return v_event;
end $$;
