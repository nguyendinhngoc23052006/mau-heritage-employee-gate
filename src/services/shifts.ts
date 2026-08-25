import { getSupabase } from "../lib/supabaseClient";
import type { Shift } from "../types/database";

export async function listShifts(
  storeId: string,
  opts?: { from?: string; to?: string },
): Promise<Shift[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("shifts")
    .select("*")
    .eq("store_id", storeId)
    .order("starts_at", { ascending: true });

  if (opts?.from) {
    query = query.gte("starts_at", opts.from);
  }
  if (opts?.to) {
    query = query.lte("starts_at", opts.to);
  }

  const { data, error } = await query;
  if (error) throw error;
  // Filter soft-deleted rows client-side. The column may or may not exist
  // depending on migration state; either way the row-level filter is safe.
  return ((data ?? []) as Shift[]).filter((s) => s.deleted_at == null);
}

export async function createShift(input: {
  store_id: string;
  starts_at: string;
  ends_at: string;
  notes?: string;
}): Promise<Shift> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("shifts")
    .insert([input])
    .select()
    .single();
  if (error) throw error;
  return data as Shift;
}

export async function updateShiftSafe(params: {
  shiftId: string;
  startsAt?: string;
  endsAt?: string;
  notes?: string;
  slotCount?: number;
}): Promise<Shift> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("update_shift_safe", {
    p_shift_id: params.shiftId,
    p_starts_at: params.startsAt ?? null,
    p_ends_at: params.endsAt ?? null,
    p_notes: params.notes ?? null,
    p_slot_count: params.slotCount ?? null,
  });
  if (error) throw error;
  return data as Shift;
}

export async function deleteShiftSafe(
  shiftId: string,
  reason?: string,
): Promise<Shift> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("delete_shift_safe", {
    p_shift_id: shiftId,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  return data as Shift;
}

export async function closeShiftClaims(shiftId: string): Promise<number> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("close_shift_claims", {
    p_shift_id: shiftId,
  });
  if (error) throw error;
  return (data ?? 0) as number;
}

export async function forceOpenShift(shiftId: string): Promise<Shift> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("force_open_shift", {
    p_shift_id: shiftId,
  });
  if (error) throw error;
  return data as Shift;
}

export async function requestShiftSwap(input: {
  shiftId: string;
  toUserId: string;
}): Promise<void> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase.from("shift_swaps").insert([
    {
      shift_id: input.shiftId,
      from_user_id: user.id,
      to_user_id: input.toUserId,
      status: "requested",
    },
  ]);
  if (error) throw error;
}

export async function listPendingSwaps(storeId: string): Promise<
  (import("../types/database").ShiftSwap & {
    from_user_name: string | null;
    to_user_name: string | null;
  })[]
> {
  const supabase = getSupabase();

  // First, get shift IDs in the store
  const { data: shifts, error: shiftsError } = await supabase
    .from("shifts")
    .select("id")
    .eq("store_id", storeId);
  if (shiftsError) throw shiftsError;

  const shiftIds = (shifts ?? []).map((s) => s.id);
  if (shiftIds.length === 0) return [];

  // Then get shift swaps for those shifts
  const { data: swaps, error: swapsError } = await supabase
    .from("shift_swaps")
    .select("*")
    .in("shift_id", shiftIds)
    .eq("status", "requested");
  if (swapsError) throw swapsError;

  const swapRows = (swaps ?? []) as import("../types/database").ShiftSwap[];
  if (swapRows.length === 0) return [];

  // Extract unique user IDs
  const userIds = new Set<string>();
  swapRows.forEach((s) => {
    if (s.from_user_id) userIds.add(s.from_user_id);
    if (s.to_user_id) userIds.add(s.to_user_id);
  });
  const uniqueIds = Array.from(userIds);

  // Fetch profiles
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", uniqueIds);
  if (profilesError) throw profilesError;

  const nameMap = new Map<string, string>(
    ((profiles ?? []) as Array<{ id: string; display_name: string }>).map(
      (p) => [p.id, p.display_name],
    ),
  );

  return swapRows.map((s) => ({
    ...s,
    from_user_name:
      (s.from_user_id ? nameMap.get(s.from_user_id) : null) ?? null,
    to_user_name: (s.to_user_id ? nameMap.get(s.to_user_id) : null) ?? null,
  }));
}

// Atomically moves the from_user's slot to to_user + marks swap approved.
export async function approveSwap(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc("approve_shift_swap", { p_swap_id: id });
  if (error) throw error;
}

export async function declineSwap(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("shift_swaps")
    .update({ status: "declined", decided_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
