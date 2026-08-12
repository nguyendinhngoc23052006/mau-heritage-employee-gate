import { minutesBetween, wagesCents } from "../lib/money";
import { getSupabase } from "../lib/supabaseClient";
import type { PrizeFineEvent } from "../types/database";

export interface PayrollRow {
  user_id: string;
  display_name: string | null;
  minutes_worked: number;
  hourly_rate_cents: number | null;
  wages_cents: number;
  prizes_cents: number;
  fines_cents: number;
  total_cents: number;
}

export async function computePayroll(
  storeId: string,
  from: string,
  to: string,
): Promise<PayrollRow[]> {
  const supabase = getSupabase();

  // Fetch all active members
  const { data: members, error: membersError } = await supabase
    .from("memberships_public")
    .select("user_id, hourly_rate_cents, role")
    .eq("store_id", storeId)
    .eq("active", true);

  if (membersError) throw membersError;

  // Fetch all clock events in period for all members
  const { data: clockEvents, error: clockError } = await supabase
    .from("clock_events")
    .select("user_id, kind, at")
    .eq("store_id", storeId)
    .gte("at", from)
    .lt("at", to)
    .order("user_id")
    .order("at");

  if (clockError) throw clockError;

  // Fetch prize/fine events in period
  const { data: prizeFineEvents, error: pfError } = await supabase
    .from("prize_fine_events")
    .select("user_id, kind, amount_cents, status")
    .eq("store_id", storeId)
    .eq("status", "pending")
    .gte("created_at", from)
    .lt("created_at", to);

  if (pfError) throw pfError;

  // Fetch profiles for display names
  const userIds = members?.map((m) => m.user_id) ?? [];
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", userIds);

  if (profilesError) throw profilesError;

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p.display_name]),
  );

  // Group clock events by user
  const clockByUser = new Map<
    string,
    Array<{ user_id: string; kind: string; at: string }>
  >();
  (clockEvents ?? []).forEach((event) => {
    if (!clockByUser.has(event.user_id)) {
      clockByUser.set(event.user_id, []);
    }
    clockByUser
      .get(event.user_id)
      ?.push(event as { user_id: string; kind: string; at: string });
  });

  // Group prize/fine events by user
  const pfByUser = new Map<
    string,
    Array<{
      user_id: string;
      kind: "prize" | "fine";
      amount_cents: number;
      status: string;
    }>
  >();
  (prizeFineEvents ?? []).forEach((event) => {
    if (!pfByUser.has(event.user_id)) {
      pfByUser.set(event.user_id, []);
    }
    pfByUser.get(event.user_id)?.push(
      event as {
        user_id: string;
        kind: "prize" | "fine";
        amount_cents: number;
        status: string;
      },
    );
  });

  const rows: PayrollRow[] = [];

  for (const member of members ?? []) {
    const clockEvents = clockByUser.get(member.user_id) ?? [];
    const minutesWorked = pairClockEvents(clockEvents);
    const hourlyRate = member.hourly_rate_cents ?? 0;
    const wages = wagesCents(minutesWorked, hourlyRate);

    const pfEvents = pfByUser.get(member.user_id) ?? [];
    let prizes = 0;
    let fines = 0;
    for (const pf of pfEvents) {
      if (pf.kind === "prize") {
        prizes += pf.amount_cents;
      } else {
        fines += pf.amount_cents;
      }
    }

    const total = wages + prizes - fines;

    rows.push({
      user_id: member.user_id,
      display_name: profileMap.get(member.user_id) ?? null,
      minutes_worked: minutesWorked,
      hourly_rate_cents: hourlyRate,
      wages_cents: wages,
      prizes_cents: prizes,
      fines_cents: fines,
      total_cents: total,
    });
  }

  return rows;
}

function pairClockEvents(
  events: Array<{ user_id: string; kind: string; at: string }>,
): number {
  let totalMinutes = 0;
  let inTime: string | null = null;

  for (const event of events) {
    if (event.kind === "in") {
      inTime = event.at;
    } else if (event.kind === "out" && inTime) {
      totalMinutes += minutesBetween(inTime, event.at);
      inTime = null;
    }
  }

  return totalMinutes;
}

export async function markPrizeFinePaid(id: string): Promise<PrizeFineEvent> {
  const supabase = getSupabase();
  const uid = (await supabase.auth.getUser()).data.user?.id;

  const { data, error } = await supabase
    .from("prize_fine_events")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      paid_by: uid,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as PrizeFineEvent;
}
