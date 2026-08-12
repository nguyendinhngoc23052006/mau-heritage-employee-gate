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
