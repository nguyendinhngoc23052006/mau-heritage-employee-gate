import { getSupabase } from "../lib/supabaseClient";
import type { ShiftSlot } from "../types/database";

export async function listSlotsForShifts(
  shiftIds: string[],
): Promise<ShiftSlot[]> {
  if (shiftIds.length === 0) return [];
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("shift_slots")
    .select("*")
    .in("shift_id", shiftIds);
  if (error) throw error;
  return (data ?? []) as ShiftSlot[];
}

export async function claimSlot(slotId: string): Promise<ShiftSlot | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("claim_slot", {
    p_slot_id: slotId,
  });
  if (error) throw error;
  return (data ?? null) as ShiftSlot | null;
}

export async function releaseSlot(slotId: string): Promise<ShiftSlot> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("release_slot", {
    p_slot_id: slotId,
  });
  if (error) throw error;
  return data as ShiftSlot;
}

export async function setShiftClaimOpen(
  shiftId: string,
  open: boolean,
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc("set_shift_claim_open", {
    p_shift_id: shiftId,
    p_open: open,
  });
  if (error) throw error;
}

export async function setStoreClaimOpen(
  storeId: string,
  open: boolean,
): Promise<number> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("set_store_claim_open", {
    p_store_id: storeId,
    p_open: open,
  });
  if (error) throw error;
  return (data ?? 0) as number;
}

export interface BulkShiftInput {
  starts_at: string;
  ends_at: string;
  notes?: string;
  slot_count: number;
  claim_open?: boolean;
}

export async function createShiftsBulk(
  storeId: string,
  shifts: BulkShiftInput[],
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc("create_shifts_bulk", {
    p_store_id: storeId,
    p_shifts: shifts,
  });
  if (error) throw error;
}
