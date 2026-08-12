import { getSupabase } from "../lib/supabaseClient";
import type { ClockEvent } from "../types/database";

export interface AttendanceHeatmapData {
  dayHourCounts: Record<number, Record<number, number>>;
  totalPerDay: Record<number, number>;
  totalPerHour: Record<number, number>;
}

export async function computeAttendanceHeatmap(
  storeId: string,
  { from, to }: { from: string; to: string },
): Promise<AttendanceHeatmapData> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("clock_events")
    .select("*")
    .eq("store_id", storeId)
    .eq("kind", "in")
    .gte("at", from)
    .lte("at", to);

  if (error) throw error;

  const dayHourCounts: Record<number, Record<number, number>> = {};
  const totalPerDay: Record<number, number> = {};
  const totalPerHour: Record<number, number> = {};

  // Initialize all days and hours
  for (let day = 0; day < 7; day++) {
    dayHourCounts[day] = {};
    for (let hour = 0; hour < 24; hour++) {
      dayHourCounts[day][hour] = 0;
    }
    totalPerDay[day] = 0;
  }

  for (let hour = 0; hour < 24; hour++) {
    totalPerHour[hour] = 0;
  }

  // Process each clock event
  (data ?? []).forEach((event: ClockEvent) => {
    const date = new Date(event.at);
    const dayOfWeek = date.getUTCDay();
    const hour = date.getUTCHours();

    dayHourCounts[dayOfWeek][hour]++;
    totalPerDay[dayOfWeek]++;
    totalPerHour[hour]++;
  });

  return { dayHourCounts, totalPerDay, totalPerHour };
}
