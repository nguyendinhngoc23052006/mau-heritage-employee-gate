import { getSupabase } from "../lib/supabaseClient";
import type { ClockEvent, ClockKind } from "../types/database";

export async function getCurrentClockState(
  userId: string,
  storeId: string,
): Promise<ClockKind | null> {
  const supabase = getSupabase();
  const today = new Date().toISOString().split("T")[0];
  const { data, error } = await supabase
    .from("clock_events")
    .select("kind")
    .eq("user_id", userId)
    .eq("store_id", storeId)
    .gte("at", `${today}T00:00:00Z`)
    .order("at", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return (data?.kind ?? null) as ClockKind | null;
}

export async function clockIn(
  storeId: string,
  shiftId?: string,
): Promise<ClockEvent> {
  const supabase = getSupabase();
  const now = new Date().toISOString();
  const idempotencyKey = `${now.slice(0, 16)}`;

  const { data, error } = await supabase
    .from("clock_events")
    .insert([
      {
        store_id: storeId,
        shift_id: shiftId || null,
        kind: "in",
        at: now,
        source: "app",
        idempotency_key: idempotencyKey,
      },
    ])
    .select()
    .single();
  if (error) throw error;
  return data as ClockEvent;
}

export async function clockOut(
  storeId: string,
  shiftId?: string,
): Promise<ClockEvent> {
  const supabase = getSupabase();
  const now = new Date().toISOString();
  const idempotencyKey = `${now.slice(0, 16)}`;

  const { data, error } = await supabase
    .from("clock_events")
    .insert([
      {
        store_id: storeId,
        shift_id: shiftId || null,
        kind: "out",
        at: now,
        source: "app",
        idempotency_key: idempotencyKey,
      },
    ])
    .select()
    .single();
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
