-- Baseline for all 6 phases of the internal-gate demo.
-- Naming: store_id (matches the domain), not tenant_id.
-- Money: integer cents. Time: timestamptz (UTC).
-- pgcrypto is already enabled by the init migration.

-- =====================================================================
-- 0. profiles (mirrors auth.users so we can join without RLS gymnastics)
-- =====================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,
  avatar_url text,
  locale text not null default 'vi',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-insert a profile row on new signup so client code never has to check.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, locale)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)), 'vi')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- 1. stores + memberships + rate_history + invites + audit_log
-- =====================================================================

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'Asia/Ho_Chi_Minh',
  currency text not null default 'VND',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

do $$ begin
  create type public.role as enum ('owner','manager','employee');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.employment_type as enum ('full_time','part_time','hourly');
exception when duplicate_object then null; end $$;

create table if not exists public.memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  role public.role not null default 'employee',
  employment_type public.employment_type not null default 'hourly',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, store_id)
);
create index if not exists memberships_store_role_idx on public.memberships(store_id, role);
create index if not exists memberships_user_idx on public.memberships(user_id);

-- Pay-rate history. Payroll compute joins to the row valid at shift-start time.
create table if not exists public.rate_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  store_id uuid not null,
  hourly_rate_cents integer not null check (hourly_rate_cents >= 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  foreign key (user_id, store_id) references public.memberships(user_id, store_id) on delete cascade
);
create index if not exists rate_history_lookup_idx on public.rate_history(user_id, store_id, effective_from desc);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  email text not null,
  role public.role not null default 'employee',
  employment_type public.employment_type not null default 'hourly',
  hourly_rate_cents integer not null default 0 check (hourly_rate_cents >= 0),
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz
);
create index if not exists invites_store_idx on public.invites(store_id);
create index if not exists invites_email_idx on public.invites(lower(email));

create table if not exists public.audit_log (
  id bigserial primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  before_json jsonb,
  after_json jsonb,
  at timestamptz not null default now()
);
create index if not exists audit_log_store_at_idx on public.audit_log(store_id, at desc);
create index if not exists audit_log_actor_at_idx on public.audit_log(actor_id, at desc);

-- =====================================================================
-- 2. shifts + shift_claims + shift_swaps
-- =====================================================================

do $$ begin
  create type public.shift_status as enum ('open','claimed','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  notes text,
  status public.shift_status not null default 'open',
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists shifts_store_starts_idx on public.shifts(store_id, starts_at);
create index if not exists shifts_status_idx on public.shifts(store_id, status);
create index if not exists shifts_claimed_by_idx on public.shifts(claimed_by, starts_at);

-- Claim attempts audit — every attempt lands here regardless of success.
create table if not exists public.shift_claims (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  succeeded boolean not null
);
create index if not exists shift_claims_shift_idx on public.shift_claims(shift_id, attempted_at desc);

do $$ begin
  create type public.swap_status as enum ('requested','approved','declined','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.shift_swaps (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id) on delete cascade,
  from_user_id uuid not null references auth.users(id) on delete cascade,
  to_user_id uuid not null references auth.users(id) on delete cascade,
  status public.swap_status not null default 'requested',
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null
);
create index if not exists shift_swaps_shift_idx on public.shift_swaps(shift_id);

-- Atomic claim function: sets claimed_by to the caller if the shift is still open.
-- Returns the shift row when won, null when lost. Every attempt logs to shift_claims.
create or replace function public.claim_shift(p_shift_id uuid)
returns public.shifts language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.shifts;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  update public.shifts
     set claimed_by = v_uid, claimed_at = now(), status = 'claimed'
   where id = p_shift_id
     and status = 'open'
     and public.is_member_of(store_id)
  returning * into v_row;

  insert into public.shift_claims(shift_id, user_id, succeeded)
    values (p_shift_id, v_uid, v_row.id is not null);

  return v_row;
end $$;

-- =====================================================================
-- 3. clock_events + sales_reports
-- =====================================================================

do $$ begin
  create type public.clock_kind as enum ('in','out');
exception when duplicate_object then null; end $$;

create table if not exists public.clock_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  shift_id uuid references public.shifts(id) on delete set null,
  kind public.clock_kind not null,
  at timestamptz not null default now(),
  source text not null default 'app',
  idempotency_key text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index if not exists clock_events_store_at_idx on public.clock_events(store_id, at desc);
create index if not exists clock_events_user_at_idx on public.clock_events(user_id, at desc);

do $$ begin
  create type public.sales_status as enum ('pending','approved','disputed');
exception when duplicate_object then null; end $$;

create table if not exists public.sales_reports (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  shift_id uuid references public.shifts(id) on delete set null,
  cash_cents integer not null default 0 check (cash_cents >= 0),
  card_cents integer not null default 0 check (card_cents >= 0),
  qr_cents integer not null default 0 check (qr_cents >= 0),
  expected_cents integer,
  variance_cents integer generated always as (
    (cash_cents + card_cents + qr_cents) - coalesce(expected_cents, cash_cents + card_cents + qr_cents)
  ) stored,
  note text,
  status public.sales_status not null default 'pending',
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  dispute_reason text
);
create index if not exists sales_reports_store_status_idx on public.sales_reports(store_id, status, submitted_at desc);
create index if not exists sales_reports_user_idx on public.sales_reports(user_id, submitted_at desc);

-- =====================================================================
-- 4. rules + rule_events + point_events + prize_fine_events
-- =====================================================================

do $$ begin
  create type public.rule_kind as enum ('auto','manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.rule_trigger as enum (
    'missed_shift','late_arrival','till_variance','points_threshold','manager_manual'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.rules (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  kind public.rule_kind not null default 'manual',
  trigger_type public.rule_trigger not null default 'manager_manual',
  trigger_params jsonb not null default '{}'::jsonb,
  points_delta integer not null default 0,
  amount_cents integer not null default 0,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rules_store_active_idx on public.rules(store_id, active);

-- Every rule application snapshots the rule so past events explain themselves.
create table if not exists public.rule_events (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.rules(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  applied_by uuid references auth.users(id) on delete set null,
  applied_at timestamptz not null default now(),
  snapshot_name text not null,
  snapshot_trigger public.rule_trigger not null,
  snapshot_params jsonb not null,
  snapshot_points_delta integer not null,
  snapshot_amount_cents integer not null,
  reason text,
  dedupe_key text unique
);
create index if not exists rule_events_store_at_idx on public.rule_events(store_id, applied_at desc);
create index if not exists rule_events_target_idx on public.rule_events(target_user_id, applied_at desc);

create table if not exists public.point_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null,
  reason text,
  rule_event_id uuid references public.rule_events(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists point_events_user_at_idx on public.point_events(user_id, store_id, created_at desc);
create index if not exists point_events_store_at_idx on public.point_events(store_id, created_at desc);

do $$ begin
  create type public.prize_fine_kind as enum ('prize','fine');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.prize_fine_status as enum ('pending','paid','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.prize_fine_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.prize_fine_kind not null,
  amount_cents integer not null check (amount_cents >= 0),
  reason text,
  rule_event_id uuid references public.rule_events(id) on delete set null,
  status public.prize_fine_status not null default 'pending',
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  paid_by uuid references auth.users(id) on delete set null
);
create index if not exists prize_fine_store_status_idx on public.prize_fine_events(store_id, status, created_at desc);
create index if not exists prize_fine_user_idx on public.prize_fine_events(user_id, created_at desc);

-- =====================================================================
-- 5. announcements + notifications + client_errors
-- =====================================================================

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  title text not null,
  body text not null,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists announcements_store_active_idx on public.announcements(store_id, active, created_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  title text not null,
  body text,
  url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_read_idx on public.notifications(user_id, read_at nulls first, created_at desc);

create table if not exists public.client_errors (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  url text,
  message text not null,
  stack text,
  ua text,
  at timestamptz not null default now()
);
create index if not exists client_errors_at_idx on public.client_errors(at desc);

-- =====================================================================
-- 6. RLS helper functions (security definer to avoid policy recursion)
-- =====================================================================

create or replace function public.is_member_of(p_store_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
     where m.store_id = p_store_id and m.user_id = auth.uid() and m.active
  );
$$;

create or replace function public.has_role_on(p_store_id uuid, p_roles public.role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
     where m.store_id = p_store_id and m.user_id = auth.uid() and m.active
       and m.role = any (p_roles)
  );
$$;

create or replace function public.current_memberships()
returns table (store_id uuid, role public.role) language sql stable security definer set search_path = public as $$
  select m.store_id, m.role
    from public.memberships m
   where m.user_id = auth.uid() and m.active;
$$;

-- =====================================================================
-- 7. Views
-- =====================================================================

-- Members-only view: hides hourly_rate_cents from non-managers.
-- Employees can still see who works with them, without seeing pay.
create or replace view public.memberships_public with (security_invoker = true) as
select
  m.user_id,
  m.store_id,
  m.role,
  m.employment_type,
  m.active,
  m.created_at,
  case when public.has_role_on(m.store_id, array['owner','manager']::public.role[])
       then (select rh.hourly_rate_cents
               from public.rate_history rh
              where rh.user_id = m.user_id and rh.store_id = m.store_id
                and rh.effective_to is null
              order by rh.effective_from desc limit 1)
       else null end as hourly_rate_cents
from public.memberships m;

-- Points balance per user per store, computed from point_events (no denorm).
create or replace view public.point_balances with (security_invoker = true) as
select store_id, user_id, coalesce(sum(delta), 0)::bigint as balance
  from public.point_events
 group by store_id, user_id;

-- =====================================================================
-- 8. RLS enable + policies
-- =====================================================================

alter table public.profiles enable row level security;
alter table public.stores enable row level security;
alter table public.memberships enable row level security;
alter table public.rate_history enable row level security;
alter table public.invites enable row level security;
alter table public.audit_log enable row level security;
alter table public.shifts enable row level security;
alter table public.shift_claims enable row level security;
alter table public.shift_swaps enable row level security;
alter table public.clock_events enable row level security;
alter table public.sales_reports enable row level security;
alter table public.rules enable row level security;
alter table public.rule_events enable row level security;
alter table public.point_events enable row level security;
alter table public.prize_fine_events enable row level security;
alter table public.announcements enable row level security;
alter table public.notifications enable row level security;
alter table public.client_errors enable row level security;

-- profiles ------------------------------------------------------------
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles for select
  using (id = auth.uid() or exists (
    select 1 from public.memberships me, public.memberships them
     where me.user_id = auth.uid() and me.active
       and them.user_id = profiles.id and them.active
       and me.store_id = them.store_id
  ));
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert on public.profiles for insert
  with check (id = auth.uid());

-- stores --------------------------------------------------------------
drop policy if exists stores_member_select on public.stores;
create policy stores_member_select on public.stores for select
  using (public.is_member_of(id));
drop policy if exists stores_insert_any_auth on public.stores;
create policy stores_insert_any_auth on public.stores for insert
  with check (auth.uid() is not null and created_by = auth.uid());
drop policy if exists stores_owner_update on public.stores;
create policy stores_owner_update on public.stores for update
  using (public.has_role_on(id, array['owner']::public.role[]));

-- memberships ---------------------------------------------------------
drop policy if exists memberships_member_select on public.memberships;
create policy memberships_member_select on public.memberships for select
  using (public.is_member_of(store_id));
drop policy if exists memberships_manager_insert on public.memberships;
create policy memberships_manager_insert on public.memberships for insert
  with check (public.has_role_on(store_id, array['owner','manager']::public.role[]));
drop policy if exists memberships_manager_update on public.memberships;
create policy memberships_manager_update on public.memberships for update
  using (public.has_role_on(store_id, array['owner','manager']::public.role[]) or user_id = auth.uid());
drop policy if exists memberships_owner_delete on public.memberships;
create policy memberships_owner_delete on public.memberships for delete
  using (public.has_role_on(store_id, array['owner']::public.role[]));

-- rate_history --------------------------------------------------------
drop policy if exists rate_history_manager_select on public.rate_history;
create policy rate_history_manager_select on public.rate_history for select
  using (public.has_role_on(store_id, array['owner','manager']::public.role[]) or user_id = auth.uid());
drop policy if exists rate_history_owner_insert on public.rate_history;
create policy rate_history_owner_insert on public.rate_history for insert
  with check (public.has_role_on(store_id, array['owner','manager']::public.role[]));

-- invites -------------------------------------------------------------
drop policy if exists invites_manager_all on public.invites;
create policy invites_manager_all on public.invites for all
  using (public.has_role_on(store_id, array['owner','manager']::public.role[]))
  with check (public.has_role_on(store_id, array['owner','manager']::public.role[]));
-- Invite acceptance flow uses a security-definer RPC; no direct RLS path for invitee.

-- audit_log -----------------------------------------------------------
drop policy if exists audit_log_manager_select on public.audit_log;
create policy audit_log_manager_select on public.audit_log for select
  using (public.has_role_on(store_id, array['owner','manager']::public.role[]));
drop policy if exists audit_log_service_insert on public.audit_log;
create policy audit_log_service_insert on public.audit_log for insert
  with check (public.is_member_of(store_id));

-- shifts --------------------------------------------------------------
drop policy if exists shifts_member_select on public.shifts;
create policy shifts_member_select on public.shifts for select
  using (public.is_member_of(store_id));
drop policy if exists shifts_manager_insert on public.shifts;
create policy shifts_manager_insert on public.shifts for insert
  with check (public.has_role_on(store_id, array['owner','manager']::public.role[]));
drop policy if exists shifts_manager_update on public.shifts;
create policy shifts_manager_update on public.shifts for update
  using (public.has_role_on(store_id, array['owner','manager']::public.role[]));
drop policy if exists shifts_manager_delete on public.shifts;
create policy shifts_manager_delete on public.shifts for delete
  using (public.has_role_on(store_id, array['owner','manager']::public.role[]));

-- shift_claims --------------------------------------------------------
drop policy if exists shift_claims_manager_select on public.shift_claims;
create policy shift_claims_manager_select on public.shift_claims for select
  using (exists (select 1 from public.shifts s
                  where s.id = shift_claims.shift_id
                    and public.has_role_on(s.store_id, array['owner','manager']::public.role[]))
         or user_id = auth.uid());
-- Inserts happen via claim_shift() SECURITY DEFINER; no direct insert path.

-- shift_swaps ---------------------------------------------------------
drop policy if exists shift_swaps_involved_select on public.shift_swaps;
create policy shift_swaps_involved_select on public.shift_swaps for select
  using (from_user_id = auth.uid() or to_user_id = auth.uid()
         or exists (select 1 from public.shifts s
                     where s.id = shift_swaps.shift_id
                       and public.has_role_on(s.store_id, array['owner','manager']::public.role[])));
drop policy if exists shift_swaps_requester_insert on public.shift_swaps;
create policy shift_swaps_requester_insert on public.shift_swaps for insert
  with check (from_user_id = auth.uid());
drop policy if exists shift_swaps_manager_update on public.shift_swaps;
create policy shift_swaps_manager_update on public.shift_swaps for update
  using (exists (select 1 from public.shifts s
                  where s.id = shift_swaps.shift_id
                    and public.has_role_on(s.store_id, array['owner','manager']::public.role[])));

-- clock_events --------------------------------------------------------
drop policy if exists clock_events_visible on public.clock_events;
create policy clock_events_visible on public.clock_events for select
  using (user_id = auth.uid()
         or public.has_role_on(store_id, array['owner','manager']::public.role[]));
drop policy if exists clock_events_self_insert on public.clock_events;
create policy clock_events_self_insert on public.clock_events for insert
  with check (user_id = auth.uid() and public.is_member_of(store_id));

-- sales_reports -------------------------------------------------------
drop policy if exists sales_reports_visible on public.sales_reports;
create policy sales_reports_visible on public.sales_reports for select
  using (user_id = auth.uid()
         or public.has_role_on(store_id, array['owner','manager']::public.role[]));
drop policy if exists sales_reports_self_insert on public.sales_reports;
create policy sales_reports_self_insert on public.sales_reports for insert
  with check (user_id = auth.uid() and public.is_member_of(store_id));
drop policy if exists sales_reports_manager_update on public.sales_reports;
create policy sales_reports_manager_update on public.sales_reports for update
  using (public.has_role_on(store_id, array['owner','manager']::public.role[]));

-- rules ---------------------------------------------------------------
drop policy if exists rules_member_select on public.rules;
create policy rules_member_select on public.rules for select
  using (public.is_member_of(store_id));
drop policy if exists rules_manager_write on public.rules;
create policy rules_manager_write on public.rules for all
  using (public.has_role_on(store_id, array['owner','manager']::public.role[]))
  with check (public.has_role_on(store_id, array['owner','manager']::public.role[]));

-- rule_events ---------------------------------------------------------
drop policy if exists rule_events_visible on public.rule_events;
create policy rule_events_visible on public.rule_events for select
  using (target_user_id = auth.uid()
         or public.has_role_on(store_id, array['owner','manager']::public.role[]));
drop policy if exists rule_events_manager_insert on public.rule_events;
create policy rule_events_manager_insert on public.rule_events for insert
  with check (public.has_role_on(store_id, array['owner','manager']::public.role[]));

-- point_events + prize_fine_events -----------------------------------
drop policy if exists point_events_visible on public.point_events;
create policy point_events_visible on public.point_events for select
  using (user_id = auth.uid()
         or public.has_role_on(store_id, array['owner','manager']::public.role[]));
drop policy if exists point_events_manager_insert on public.point_events;
create policy point_events_manager_insert on public.point_events for insert
  with check (public.has_role_on(store_id, array['owner','manager']::public.role[]));

drop policy if exists prize_fine_visible on public.prize_fine_events;
create policy prize_fine_visible on public.prize_fine_events for select
  using (user_id = auth.uid()
         or public.has_role_on(store_id, array['owner','manager']::public.role[]));
drop policy if exists prize_fine_manager_write on public.prize_fine_events;
create policy prize_fine_manager_write on public.prize_fine_events for all
  using (public.has_role_on(store_id, array['owner','manager']::public.role[]))
  with check (public.has_role_on(store_id, array['owner','manager']::public.role[]));

-- announcements + notifications ---------------------------------------
drop policy if exists announcements_member_select on public.announcements;
create policy announcements_member_select on public.announcements for select
  using (public.is_member_of(store_id));
drop policy if exists announcements_manager_write on public.announcements;
create policy announcements_manager_write on public.announcements for all
  using (public.has_role_on(store_id, array['owner','manager']::public.role[]))
  with check (public.has_role_on(store_id, array['owner','manager']::public.role[]));

drop policy if exists notifications_self_select on public.notifications;
create policy notifications_self_select on public.notifications for select
  using (user_id = auth.uid());
drop policy if exists notifications_self_update on public.notifications;
create policy notifications_self_update on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notifications_manager_insert on public.notifications;
create policy notifications_manager_insert on public.notifications for insert
  with check (
    store_id is null
    or public.has_role_on(store_id, array['owner','manager']::public.role[])
  );

-- client_errors -------------------------------------------------------
drop policy if exists client_errors_self_insert on public.client_errors;
create policy client_errors_self_insert on public.client_errors for insert
  with check (user_id is null or user_id = auth.uid());
drop policy if exists client_errors_self_select on public.client_errors;
create policy client_errors_self_select on public.client_errors for select
  using (user_id = auth.uid());

-- =====================================================================
-- 9. Invite acceptance RPC (bypasses invite's manager-only RLS for the invitee)
-- =====================================================================

create or replace function public.accept_invite(p_token text)
returns public.memberships language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.invites;
  v_member public.memberships;
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

-- =====================================================================
-- 10. Grants (Supabase's default anon+authenticated roles need these)
-- =====================================================================

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant select on public.memberships_public to authenticated;
grant select on public.point_balances to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant execute on functions to authenticated;
