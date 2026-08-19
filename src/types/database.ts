// Hand-written row types matching supabase/migrations/20260812010000_baseline.sql.
// When the schema changes, update this file in the same PR.

export type Role = "owner" | "manager" | "employee";
export type EmploymentType = "full_time" | "part_time" | "hourly";
export type ShiftStatus = "open" | "claimed" | "cancelled";
export type SwapStatus = "requested" | "approved" | "declined" | "cancelled";
export type ClockKind = "in" | "out";
export type SalesStatus = "pending" | "approved" | "disputed";
export type RuleKind = "auto" | "manual";
export type RuleTrigger =
  | "missed_shift"
  | "late_arrival"
  | "till_variance"
  | "points_threshold"
  | "manager_manual";
export type PrizeFineKind = "prize" | "fine";
export type PrizeFineStatus = "pending" | "paid" | "cancelled";
export type ApplicationStatus =
  | "pending"
  | "approved"
  | "declined"
  | "withdrawn";

export interface Profile {
  id: string;
  display_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  locale: string;
  created_at: string;
  updated_at: string;
}

export interface Store {
  id: string;
  name: string;
  timezone: string;
  currency: string;
  join_code: string | null;
  created_at: string;
  created_by: string | null;
  lat: number | null;
  lng: number | null;
  geofence_radius_m: number;
  require_geofence: boolean;
  variance_threshold_pct: number;
}

export interface StoreApplication {
  id: string;
  user_id: string;
  store_id: string;
  note: string | null;
  status: ApplicationStatus;
  submitted_at: string;
  decided_at: string | null;
  decided_by: string | null;
  decision_reason: string | null;
}

export interface Membership {
  user_id: string;
  store_id: string;
  role: Role;
  employment_type: EmploymentType;
  active: boolean;
  created_at: string;
}

export interface MembershipPublic {
  user_id: string;
  store_id: string;
  role: Role;
  employment_type: EmploymentType;
  active: boolean;
  created_at: string;
  hourly_rate_cents: number | null;
}

export interface RateHistory {
  id: string;
  user_id: string;
  store_id: string;
  hourly_rate_cents: number;
  effective_from: string;
  effective_to: string | null;
  changed_by: string | null;
  changed_at: string;
}

export interface Invite {
  id: string;
  store_id: string;
  email: string;
  role: Role;
  employment_type: EmploymentType;
  hourly_rate_cents: number;
  token: string;
  expires_at: string;
  created_by: string | null;
  created_at: string;
  accepted_by: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
}

export interface AuditLog {
  id: number;
  store_id: string;
  actor_id: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  before_json: unknown | null;
  after_json: unknown | null;
  at: string;
}

export interface Shift {
  id: string;
  store_id: string;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  status: ShiftStatus;
  claimed_by: string | null;
  claimed_at: string | null;
  created_by: string | null;
  created_at: string;
  slot_count: number;
  claim_open: boolean;
}

export interface ShiftClaim {
  id: string;
  shift_id: string;
  user_id: string;
  attempted_at: string;
  succeeded: boolean;
}

export interface ShiftSwap {
  id: string;
  shift_id: string;
  from_user_id: string;
  to_user_id: string;
  status: SwapStatus;
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
}

export interface ClockEvent {
  id: string;
  store_id: string;
  user_id: string;
  shift_id: string | null;
  kind: ClockKind;
  at: string;
  source: string;
  idempotency_key: string | null;
  created_by: string | null;
  created_at: string;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  distance_m: number | null;
  location_verified: boolean | null;
}

export type AttendanceFlagKind = "auto_clockout" | "geofence_miss";

export interface AttendanceFlag {
  id: string;
  store_id: string;
  user_id: string;
  clock_event_id: string | null;
  kind: AttendanceFlagKind;
  detail: Record<string, unknown>;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
}

export interface SalesReport {
  id: string;
  store_id: string;
  user_id: string;
  shift_id: string | null;
  cash_cents: number;
  card_cents: number;
  qr_cents: number;
  expected_cents: number | null;
  variance_cents: number;
  note: string | null;
  status: SalesStatus;
  submitted_at: string;
  decided_at: string | null;
  decided_by: string | null;
  dispute_reason: string | null;
}

export interface Rule {
  id: string;
  store_id: string;
  name: string;
  kind: RuleKind;
  trigger_type: RuleTrigger;
  trigger_params: Record<string, unknown>;
  points_delta: number;
  amount_cents: number;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RuleEvent {
  id: string;
  rule_id: string;
  store_id: string;
  target_user_id: string;
  applied_by: string | null;
  applied_at: string;
  snapshot_name: string;
  snapshot_trigger: RuleTrigger;
  snapshot_params: Record<string, unknown>;
  snapshot_points_delta: number;
  snapshot_amount_cents: number;
  reason: string | null;
  dedupe_key: string | null;
}

export interface PointEvent {
  id: string;
  store_id: string;
  user_id: string;
  delta: number;
  reason: string | null;
  rule_event_id: string | null;
  created_at: string;
}

export interface PrizeFineEvent {
  id: string;
  store_id: string;
  user_id: string;
  kind: PrizeFineKind;
  amount_cents: number;
  reason: string | null;
  rule_event_id: string | null;
  status: PrizeFineStatus;
  created_at: string;
  paid_at: string | null;
  paid_by: string | null;
}

export interface Announcement {
  id: string;
  store_id: string;
  title: string;
  body: string;
  active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  store_id: string | null;
  title: string;
  body: string | null;
  url: string | null;
  read_at: string | null;
  created_at: string;
}

export interface ClientErrorRow {
  id: number;
  user_id: string | null;
  url: string | null;
  message: string;
  stack: string | null;
  ua: string | null;
  at: string;
}

export interface PointBalance {
  store_id: string;
  user_id: string;
  balance: number;
}

export interface ShiftSlot {
  id: string;
  shift_id: string;
  store_id: string;
  claimed_by: string | null;
  claimed_at: string | null;
  created_at: string;
}
