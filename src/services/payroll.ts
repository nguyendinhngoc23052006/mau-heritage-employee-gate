import { minutesBetween, wagesCents } from "../lib/money";
import { getSupabase } from "../lib/supabaseClient";
import type { PrizeFineEvent } from "../types/database";

export interface DailyBreakdown {
  date: string;
  minutes: number;
  multiplier: number;
  wages: number;
}

export interface PayrollRow {
  user_id: string;
  display_name: string | null;
  minutes_worked: number;
  hourly_rate_cents: number | null;
  wages_cents: number;
  prizes_cents: number;
  fines_cents: number;
  total_cents: number;
  daily_breakdown: DailyBreakdown[];
}

export async function computePayroll(
  storeId: string,
  from: string,
  to: string,
): Promise<PayrollRow[]> {
  const supabase = getSupabase();

  // Extract date range for multiplier query (YYYY-MM-DD format)
  const fromDate = from.split("T")[0];
  const toDate = to.split("T")[0];

  // Fetch all data in parallel
  const [
    { data: members, error: membersError },
    { data: clockEvents, error: clockError },
    { data: prizeFineEvents, error: pfError },
    { data: multipliers, error: multError },
  ] = await Promise.all([
    supabase
      .from("memberships_public")
      .select("user_id, hourly_rate_cents, role")
      .eq("store_id", storeId)
      .eq("active", true),
    supabase
      .from("clock_events")
      .select("user_id, kind, at")
      .eq("store_id", storeId)
      .gte("at", from)
      .lt("at", to)
      .order("user_id")
      .order("at"),
    supabase
      .from("prize_fine_events")
      .select("user_id, kind, amount_cents, status")
      .eq("store_id", storeId)
      .eq("status", "pending")
      .gte("created_at", from)
      .lt("created_at", to),
    supabase
      .from("pay_multipliers")
      .select("date, multiplier")
      .eq("store_id", storeId)
      .gte("date", fromDate)
      .lte("date", toDate),
  ]);

  if (membersError) throw membersError;
  if (clockError) throw clockError;
  if (pfError) throw pfError;
  if (multError) throw multError;

  // Build multiplier lookup by date
  const multiplierByDate = new Map<string, number>();
  (multipliers ?? []).forEach((m: any) => {
    multiplierByDate.set(m.date, Number(m.multiplier));
  });

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
    const userClockEvents = clockByUser.get(member.user_id) ?? [];
    const hourlyRate = member.hourly_rate_cents ?? 0;

    // Segment clock events by date and compute daily breakdown
    const dailyBreakdown = pairClockEventsByDate(
      userClockEvents,
      hourlyRate,
      multiplierByDate,
    );

    // Sum totals across all days
    const minutesWorked = dailyBreakdown.reduce((sum, d) => sum + d.minutes, 0);
    const wages = dailyBreakdown.reduce((sum, d) => sum + d.wages, 0);

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
      daily_breakdown: dailyBreakdown,
    });
  }

  return rows;
}

function pairClockEventsByDate(
  events: Array<{ user_id: string; kind: string; at: string }>,
  hourlyRate: number,
  multiplierByDate: Map<string, number>,
): DailyBreakdown[] {
  const dailyByDate = new Map<
    string,
    { minutes: number; multiplier: number }
  >();
  let inTime: string | null = null;

  for (const event of events) {
    if (event.kind === "in") {
      inTime = event.at;
    } else if (event.kind === "out" && inTime) {
      const date = inTime.split("T")[0];
      const minutes = minutesBetween(inTime, event.at);

      if (!dailyByDate.has(date)) {
        dailyByDate.set(date, { minutes: 0, multiplier: 1.0 });
      }
      const daily = dailyByDate.get(date)!;
      daily.minutes += minutes;

      inTime = null;
    }
  }

  // Convert to DailyBreakdown with multipliers and wages
  const breakdown: DailyBreakdown[] = [];
  const sortedDates = Array.from(dailyByDate.keys()).sort();

  for (const date of sortedDates) {
    const daily = dailyByDate.get(date)!;
    const multiplier = multiplierByDate.get(date) ?? 1.0;
    const wages = wagesCents(daily.minutes, hourlyRate * multiplier);

    breakdown.push({
      date,
      minutes: daily.minutes,
      multiplier,
      wages,
    });
  }

  return breakdown;
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
