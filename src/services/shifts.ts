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
  return (data ?? []) as Shift[];
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

export async function updateShift(
  id: string,
  patch: Partial<Shift>,
): Promise<Shift> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("shifts")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Shift;
}

export async function deleteShift(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("shifts").delete().eq("id", id);
  if (error) throw error;
}

export async function claimShift(shiftId: string): Promise<Shift | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("claim_shift", {
    p_shift_id: shiftId,
  });
  if (error) throw error;
  return (data ?? null) as Shift | null;
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
  const { data, error } = await supabase
    .from("shift_swaps")
    .select(
      "*, shift:shifts(store_id), from_user:profiles!from_user_id(display_name), to_user:profiles!to_user_id(display_name)",
    )
    .eq("shift.store_id", storeId)
    .eq("status", "requested");
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...row,
    from_user_name: row.from_user?.display_name ?? null,
    to_user_name: row.to_user?.display_name ?? null,
  })) as any[];
}

export async function approveSwap(id: string): Promise<void> {
  const supabase = getSupabase();
  // TODO: convert to atomic RPC
  const { data: swap, error: fetchError } = await supabase
    .from("shift_swaps")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchError) throw fetchError;

  const { error: updateShiftError } = await supabase
    .from("shifts")
    .update({ claimed_by: swap.to_user_id })
    .eq("id", swap.shift_id);
  if (updateShiftError) throw updateShiftError;

  const { error: updateSwapError } = await supabase
    .from("shift_swaps")
    .update({ status: "approved", decided_at: new Date().toISOString() })
    .eq("id", id);
  if (updateSwapError) throw updateSwapError;
}

export async function declineSwap(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("shift_swaps")
    .update({ status: "declined", decided_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
