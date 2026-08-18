import { getSupabase } from "../lib/supabaseClient";
import type { ClockEvent, ClockKind } from "../types/database";

export async function getCurrentClockState(
  userId: string,
  storeId: string,
): Promise<ClockKind | null> {
  const supabase = getSupabase();
  const today = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
  const { data, error } = await supabase
    .from("clock_events")
    .select("kind")
    .eq("user_id", userId)
    .eq("store_id", storeId)
    .gte("at", `${today}T00:00:00+07:00`)
    .order("at", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return (data?.kind ?? null) as ClockKind | null;
}

export interface ClockLocation {
  lat?: number;
  lng?: number;
  accuracyM?: number;
}

export async function clockInAt(
  storeId: string,
  loc: ClockLocation = {},
): Promise<ClockEvent> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("clock_in_at", {
    p_store_id: storeId,
    p_lat: loc.lat ?? null,
    p_lng: loc.lng ?? null,
    p_accuracy_m: loc.accuracyM ?? null,
  });
  if (error) throw error;
  return data as ClockEvent;
}

export async function clockOutAt(
  storeId: string,
  loc: ClockLocation = {},
): Promise<ClockEvent> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("clock_out_at", {
    p_store_id: storeId,
    p_lat: loc.lat ?? null,
    p_lng: loc.lng ?? null,
    p_accuracy_m: loc.accuracyM ?? null,
  });
  if (error) throw error;
  return data as ClockEvent;
}

export async function listMyClockEvents(
  userId: string,
  storeId: string,
  opts?: { from?: string; to?: string },
): Promise<ClockEvent[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("clock_events")
    .select("*")
    .eq("user_id", userId)
    .eq("store_id", storeId)
    .order("at", { ascending: false });

  if (opts?.from) {
    query = query.gte("at", opts.from);
  }
  if (opts?.to) {
    query = query.lte("at", opts.to);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ClockEvent[];
}
