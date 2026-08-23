import { minutesBetween } from "../lib/money";
import { getSupabase } from "../lib/supabaseClient";
import type { PrizeFineEvent, RateHistory } from "../types/database";

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

  // Fetch all data in parallel. Rate history is fetched separately so we can
  // apply the rate that was in effect at each clock event's timestamp
  // (avoids retroactive-rate bug where changing a rate rewrites past payroll).
  const [
    { data: members, error: membersError },
    { data: clockEvents, error: clockError },
    { data: prizeFineEvents, error: pfError },
    { data: multipliers, error: multError },
    { data: rateHistory, error: rateError },
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
      .in("status", ["pending", "disputed"])
      .gte("created_at", from)
      .lt("created_at", to),
    supabase
      .from("pay_multipliers")
      .select("date, multiplier")
      .eq("store_id", storeId)
      .gte("date", fromDate)
      .lte("date", toDate),
    supabase
      .from("rate_history")
      .select("user_id, hourly_rate_cents, effective_from, effective_to")
      .eq("store_id", storeId)
      .or(`effective_to.is.null,effective_to.gte.${from}`)
      .lte("effective_from", to),
  ]);

  if (membersError) throw membersError;
  if (clockError) throw clockError;
  if (pfError) throw pfError;
  if (multError) throw multError;
  if (rateError) throw rateError;

  const rateByUser = new Map<
    string,
    Array<Pick<RateHistory, "hourly_rate_cents" | "effective_from" | "effective_to">>
  >();
  for (const rh of (rateHistory ?? []) as RateHistory[]) {
    if (!rateByUser.has(rh.user_id)) rateByUser.set(rh.user_id, []);
    rateByUser.get(rh.user_id)?.push({
      hourly_rate_cents: rh.hourly_rate_cents,
      effective_from: rh.effective_from,
      effective_to: rh.effective_to,
    });
  }
  for (const list of rateByUser.values()) {
    list.sort((a, b) => a.effective_from.localeCompare(b.effective_from));
  }
  function rateAt(userId: string, atIso: string, fallback: number): number {
    const rows = rateByUser.get(userId);
    if (!rows) return fallback;
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      if (r.effective_from <= atIso && (r.effective_to == null || r.effective_to > atIso)) {
        return r.hourly_rate_cents;
      }
    }
    return fallback;
  }

  const multiplierByDate = new Map<string, number>();
  (
    (multipliers ?? []) as Array<{ date: string; multiplier: number | string }>
  ).forEach((m) => {
    multiplierByDate.set(m.date, Number(m.multiplier));
  });

  const userIds = members?.map((m) => m.user_id) ?? [];
  const profileMap = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);
    if (profilesError) throw profilesError;
    for (const p of profiles ?? []) {
      profileMap.set(p.id, p.display_name);
    }
  }

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

    // Segment clock events by date and compute daily breakdown. Historical
    // rate: look up rate_history at each clock-in time; falls back to the
    // current membership rate when no history row exists.
    const dailyBreakdown = pairClockEventsByDate(
      userClockEvents,
      (atIso) => rateAt(member.user_id, atIso, hourlyRate),
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
  rateAtFn: (atIso: string) => number,
  multiplierByDate: Map<string, number>,
): DailyBreakdown[] {
  const dailyByDate = new Map<
    string,
    { minutes: number; rateSum: number; rateCount: number }
  >();
  let inTime: string | null = null;

  for (const event of events) {
    if (event.kind === "in") {
      inTime = event.at;
    } else if (event.kind === "out" && inTime) {
      // Bucket by Asia/Ho_Chi_Minh calendar date, not UTC.
      const date = new Date(inTime).toLocaleDateString("sv-SE", {
        timeZone: "Asia/Ho_Chi_Minh",
      });
      const minutes = minutesBetween(inTime, event.at);
      const rateAtIn = rateAtFn(inTime);

      const existing = dailyByDate.get(date) ?? {
        minutes: 0,
        rateSum: 0,
        rateCount: 0,
      };
      existing.minutes += minutes;
      existing.rateSum += rateAtIn;
      existing.rateCount += 1;
      dailyByDate.set(date, existing);

      inTime = null;
    }
  }

  const breakdown: DailyBreakdown[] = [];
  const sortedDates = Array.from(dailyByDate.keys()).sort();

  for (const date of sortedDates) {
    const daily = dailyByDate.get(date);
    if (!daily) continue;
    const multiplier = multiplierByDate.get(date) ?? 1.0;
    // Use the average rate across the day's shifts (a rate change mid-day is
    // very rare; if it happens we accept the average as a small rounding).
    const dayRate =
      daily.rateCount > 0 ? Math.round(daily.rateSum / daily.rateCount) : 0;
    const mulBps = Math.round(multiplier * 100);
    const wages = Math.floor((daily.minutes * dayRate * mulBps) / 6000);

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
