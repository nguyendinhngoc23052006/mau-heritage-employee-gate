import { getSupabase } from "../lib/supabaseClient";
import type { AttendanceFlag, ClockEvent } from "../types/database";

export async function listAttendanceFlags(
  storeId: string,
  opts?: { includeResolved?: boolean; limit?: number },
): Promise<(AttendanceFlag & { user_display_name: string | null })[]> {
  const supabase = getSupabase();
  let q = supabase
    .from("attendance_flags")
    .select("*")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 50);
  if (!opts?.includeResolved) q = q.is("resolved_at", null);
  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []) as AttendanceFlag[];
  if (rows.length === 0) return [];

  const uids = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", uids);
  if (pErr) throw pErr;
  const nameMap = new Map<string, string>(
    ((profiles ?? []) as Array<{ id: string; display_name: string }>).map(
      (p) => [p.id, p.display_name],
    ),
  );
  return rows.map((r) => ({
    ...r,
    user_display_name: nameMap.get(r.user_id) ?? null,
  }));
}

export async function resolveAttendanceFlag(
  id: string,
  note?: string,
): Promise<AttendanceFlag> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("resolve_attendance_flag", {
    p_flag_id: id,
    p_note: note ?? null,
  });
  if (error) throw error;
  return data as AttendanceFlag;
}

export async function autoClockoutStale(storeId: string): Promise<number> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("auto_clockout_stale", {
    p_store_id: storeId,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function closeStaleClockEvent(
  eventId: string,
  at?: string,
): Promise<ClockEvent> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("close_stale_clock_event", {
    p_event_id: eventId,
    p_at: at ?? null,
  });
  if (error) throw error;
  return data as ClockEvent;
}
