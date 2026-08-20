-- Closes findings from the four-agent critical review of PR #20:
--   1. memberships_manager_update self-branch left `active` unconstrained →
--      a deactivated user could re-activate themselves via REST.
--   2. store_applications had no DELETE policy → dismissDeclinedApplication
--      always errored.
--   3. claim_slot silently returned an all-null row when the FCFS race was
--      lost → client had no way to detect and toast.
--   4. sales_reports.variance_cents collapsed to 0 when expected_cents was
--      NULL → "no expected" always read as "perfect balance" and the
--      large-variance approval guard never fired.
--   5. Manual rule apply had no dedupe_key + no transaction → double-click
--      double-applied the rule.
--   6. auto_clockout_stale sweep window was 48h → forgotten clock-ins older
--      than 2 days silently dropped from payroll forever.
--   7. audit_log had no writers anywhere → the manager audit page was empty.
--      Add triggers that populate it on the most consequential state changes.
--   8. notifications table had no producers → announcement create + sales
--      approve/dispute now fan out notifications.

set check_function_bodies = off;

-- 1. memberships_manager_update: constrain `active` on the self-branch AND
--    preserve the OWNER-vs-MANAGER role ceiling from the aug-14 hardening
--    (a manager can only assign 'manager' or 'employee'; only an owner can
--    make another owner). Reviewer 1 caught that the naive replacement
--    accidentally let managers promote anyone — including themselves — to
--    owner.
drop policy if exists memberships_manager_update on public.memberships;
create policy memberships_manager_update on public.memberships for update
  using (
    public.has_role_on(memberships.store_id, array['owner','manager']::public.role[])
    or user_id = auth.uid()
  )
  with check (
    -- Manager branch: role ceiling — owners may assign any role, managers
    -- may not create owners.
    (
      public.has_role_on(memberships.store_id, array['owner','manager']::public.role[])
      and (
        case
          when public.has_role_on(memberships.store_id, array['owner']::public.role[]) then true
          when public.has_role_on(memberships.store_id, array['manager']::public.role[]) then role in ('manager','employee')
          else false
        end
      )
    )
    -- Self branch: only employment_type may drift; active/role stay pinned.
    or (
      user_id = auth.uid()
      and active = (select active from public.memberships mo where mo.user_id = auth.uid() and mo.store_id = memberships.store_id)
      and role   = (select role   from public.memberships mo where mo.user_id = auth.uid() and mo.store_id = memberships.store_id)
    )
  );

-- 2. store_applications: applicant may DELETE their own DECLINED/WITHDRAWN row
--    only. Never pending (use withdraw_application) and never approved (would
--    destroy audit trail of how membership was granted).
drop policy if exists store_applications_self_delete on public.store_applications;
create policy store_applications_self_delete on public.store_applications for delete
  using (user_id = auth.uid() and status in ('declined','withdrawn'));
grant delete on public.store_applications to authenticated;

-- 3. claim_slot: RAISE on lost race. Returns the winning row on success.
--    Callers now get a distinguishable 42501 with a machine-readable errcode
--    instead of a silent all-null composite.
create or replace function public.claim_slot(p_slot_id uuid)
returns public.shift_slots language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_slot public.shift_slots;
  v_shift public.shifts;
  v_row public.shift_slots;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into v_slot from public.shift_slots where id = p_slot_id;
  if not found then raise exception 'slot not found' using errcode = 'P0002'; end if;
  if not public.is_member_of(v_slot.store_id) then
    raise exception 'not a member of this store' using errcode = '42501';
  end if;
  select * into v_shift from public.shifts where id = v_slot.shift_id;
  if not v_shift.claim_open then
    raise exception 'this shift is not open for claim' using errcode = '42501';
  end if;
  update public.shift_slots
     set claimed_by = v_uid, claimed_at = now()
   where id = p_slot_id and claimed_by is null
  returning * into v_row;
  if not found then
    -- Someone else won the FCFS race, or the slot is no longer null.
    insert into public.shift_claims(shift_id, user_id, slot_id, succeeded)
      values (v_slot.shift_id, v_uid, p_slot_id, false);
    raise exception 'slot already claimed' using errcode = '42501';
  end if;
  insert into public.shift_claims(shift_id, user_id, slot_id, succeeded)
    values (v_slot.shift_id, v_uid, p_slot_id, true);
  return v_row;
end $$;

-- 4. sales_reports.variance_cents: NULL when expected_cents is NULL, not 0.
--    Downstream code (client) now distinguishes "no expected value provided"
--    from "expected matched perfectly".
alter table public.sales_reports drop column if exists variance_cents;
alter table public.sales_reports add column variance_cents integer generated always as (
  case when expected_cents is null
       then null
       else (cash_cents + card_cents + qr_cents) - expected_cents
  end
) stored;

-- 5. apply_manual_rule: atomic RPC with dedupe_key.
--    Ships as a new function; client will move off the three-step JS path.
create or replace function public.apply_manual_rule(
  p_rule_id uuid,
  p_target_user_id uuid,
  p_reason text default null,
  p_dedupe_key text default null
) returns public.rule_events language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_rule public.rules;
  v_event public.rule_events;
  v_key text := coalesce(p_dedupe_key,
    'apply:' || p_rule_id::text || ':' || p_target_user_id::text || ':' ||
    to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI'));
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into v_rule from public.rules where id = p_rule_id;
  if not found then raise exception 'rule not found' using errcode = 'P0002'; end if;
  if not exists (
    select 1 from public.memberships m
    where m.user_id = v_uid and m.store_id = v_rule.store_id
      and m.active and m.role in ('owner','manager')
  ) then
    raise exception 'not a manager of this store' using errcode = '42501';
  end if;
  if not v_rule.active then raise exception 'rule is inactive' using errcode = '22023'; end if;

  insert into public.rule_events(rule_id, store_id, target_user_id, applied_by,
    snapshot_name, snapshot_trigger, snapshot_params,
    snapshot_points_delta, snapshot_amount_cents, reason, dedupe_key)
  values (p_rule_id, v_rule.store_id, p_target_user_id, v_uid,
    v_rule.name, v_rule.trigger_type, v_rule.trigger_params,
    v_rule.points_delta, v_rule.amount_cents, p_reason, v_key)
  on conflict (dedupe_key) do nothing
  returning * into v_event;

  if v_event.id is null then
    -- Dedupe hit — return the existing event so caller's flow is idempotent.
    select * into v_event from public.rule_events where dedupe_key = v_key;
    return v_event;
  end if;

  if v_rule.points_delta <> 0 then
    insert into public.point_events(store_id, user_id, delta, reason, rule_event_id)
      values (v_rule.store_id, p_target_user_id, v_rule.points_delta, v_rule.name, v_event.id);
  end if;
  if v_rule.amount_cents <> 0 then
    insert into public.prize_fine_events(store_id, user_id, kind, amount_cents, status, rule_event_id, reason)
      values (v_rule.store_id, p_target_user_id,
        case when v_rule.amount_cents > 0 then 'prize' else 'fine' end,
        abs(v_rule.amount_cents), 'pending', v_event.id, v_rule.name);
  end if;

  return v_event;
end $$;
grant execute on function public.apply_manual_rule(uuid, uuid, text, text) to authenticated;

-- 6. auto_clockout_stale: widen window from 48h to 30 days so a manager on
--    vacation can still close forgotten shifts before wages are lost. Also
--    add a targeted close-one RPC so a specific stale event can be closed
--    even if it aged past the batch window.
create or replace function public.auto_clockout_stale(p_store_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_count integer := 0;
  r record;
  v_out_at timestamptz;
  v_key text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
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
      and ce.at >= now() - interval '30 days'
      and not exists (
        select 1 from public.clock_events oe
        where oe.user_id = ce.user_id and oe.store_id = ce.store_id
          and oe.kind = 'out' and oe.at > ce.at and oe.at <= ce.at + interval '30 days'
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

-- 6a. Close one specific stale event by id (manager-only). Useful when the
--     batch window somehow missed it or a manager wants to force-close early.
--     Guards against corrupting a later same-day shift's minutes AND resolves
--     the attendance_flag that triggered the click instead of stacking new ones.
create or replace function public.close_stale_clock_event(p_event_id uuid, p_at timestamptz default null)
returns public.clock_events language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_in public.clock_events;
  v_out public.clock_events;
  v_out_at timestamptz := coalesce(p_at, now());
  v_key text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into v_in from public.clock_events where id = p_event_id;
  if not found then raise exception 'event not found' using errcode = 'P0002'; end if;
  if v_in.kind <> 'in' then raise exception 'event is not an in-event' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.memberships m
    where m.user_id = v_uid and m.store_id = v_in.store_id
      and m.active and m.role in ('owner','manager')
  ) then
    raise exception 'not a manager of this store' using errcode = '42501';
  end if;
  -- Refuse if a matching out already exists — closing again would insert an
  -- auto-out that corrupts a later same-day shift's paired minutes.
  if exists (
    select 1 from public.clock_events oe
    where oe.user_id = v_in.user_id and oe.store_id = v_in.store_id
      and oe.kind = 'out' and oe.at > v_in.at
  ) then
    raise exception 'this in-event is already paired with an out' using errcode = '22023';
  end if;
  v_key := 'auto:' || p_event_id::text;
  insert into public.clock_events(store_id, user_id, shift_id, kind, at, source, idempotency_key)
  values (v_in.store_id, v_in.user_id, v_in.shift_id, 'out', v_out_at, 'auto', v_key)
  on conflict (user_id, idempotency_key) do nothing
  returning * into v_out;
  if v_out.id is null then
    select * into v_out from public.clock_events where user_id = v_in.user_id and idempotency_key = v_key;
  end if;
  -- Resolve any existing unresolved auto_clockout flag for this in-event
  -- instead of stacking a duplicate on every click.
  update public.attendance_flags
     set resolved_at = now(), resolved_by = v_uid,
         resolution_note = coalesce(resolution_note, 'closed via close_stale_clock_event')
   where store_id = v_in.store_id
     and kind = 'auto_clockout'
     and resolved_at is null
     and (detail->>'in_event_id') = v_in.id::text;
  if not found then
    -- No flag existed yet (edge: force-close outside the sweep path). File one
    -- already-resolved so history is complete without being noisy in the queue.
    insert into public.attendance_flags(store_id, user_id, kind, detail, resolved_at, resolved_by, resolution_note)
    values (v_in.store_id, v_in.user_id, 'auto_clockout',
      jsonb_build_object('in_event_id', v_in.id, 'in_at', v_in.at, 'out_at', v_out_at, 'shift_ends_at', null),
      now(), v_uid, 'closed via close_stale_clock_event');
  end if;
  return v_out;
end $$;
grant execute on function public.close_stale_clock_event(uuid, timestamptz) to authenticated;

-- 7. Audit-log triggers on the most consequential tables so the audit page
--    stops being empty. write_audit uses auth.uid() to stamp the actor.
create or replace function public.write_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_store uuid;
  v_action text := lower(tg_op);
begin
  v_store := coalesce(
    case when tg_op = 'DELETE' then (row_to_json(old)->>'store_id')::uuid
         else (row_to_json(new)->>'store_id')::uuid end,
    null
  );
  if v_store is null then return coalesce(new, old); end if;
  insert into public.audit_log(store_id, actor_id, entity_type, entity_id, action, before_json, after_json)
  values (v_store, v_actor, tg_table_name,
    case when tg_op = 'DELETE' then (row_to_json(old)->>'id')
         else coalesce((row_to_json(new)->>'id'), '') end,
    v_action,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end);
  return coalesce(new, old);
end $$;

drop trigger if exists audit_memberships on public.memberships;
create trigger audit_memberships after insert or update or delete on public.memberships
  for each row execute function public.write_audit();

drop trigger if exists audit_sales_reports on public.sales_reports;
create trigger audit_sales_reports after update on public.sales_reports
  for each row execute function public.write_audit();

drop trigger if exists audit_prize_fine_events on public.prize_fine_events;
create trigger audit_prize_fine_events after insert or update on public.prize_fine_events
  for each row execute function public.write_audit();

drop trigger if exists audit_rule_events on public.rule_events;
create trigger audit_rule_events after insert on public.rule_events
  for each row execute function public.write_audit();

drop trigger if exists audit_attendance_flags on public.attendance_flags;
create trigger audit_attendance_flags after update on public.attendance_flags
  for each row execute function public.write_audit();

-- 8. Notifications producers.
--    a) Every new active announcement → insert one notification per member.
create or replace function public.fanout_announcement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.active then
    insert into public.notifications(user_id, store_id, title, body, url)
    select m.user_id, new.store_id, new.title, new.body,
           '/store/' || new.store_id::text || '/announcements'
    from public.memberships m
    where m.store_id = new.store_id and m.active;
  end if;
  return new;
end $$;
drop trigger if exists fanout_announcement_insert on public.announcements;
create trigger fanout_announcement_insert after insert on public.announcements
  for each row execute function public.fanout_announcement();

--    b) Sales approve/dispute → notify the submitter.
create or replace function public.notify_sales_decision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status is distinct from new.status and new.status in ('approved','disputed') then
    insert into public.notifications(user_id, store_id, title, body, url)
    values (new.user_id, new.store_id,
      case when new.status = 'approved' then 'Doanh thu đã được duyệt' else 'Doanh thu bị tranh chấp' end,
      case when new.status = 'disputed' then new.dispute_reason
           else 'Báo cáo doanh thu ngày ' || to_char(new.submitted_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY') || ' đã được duyệt.'
      end,
      '/store/' || new.store_id::text || '/sales');
  end if;
  return new;
end $$;
drop trigger if exists notify_sales_decision on public.sales_reports;
create trigger notify_sales_decision after update on public.sales_reports
  for each row execute function public.notify_sales_decision();
