import { getSupabase } from "../lib/supabaseClient";

export interface PayMultiplier {
  id: string;
  store_id: string;
  date: string; // ISO date (YYYY-MM-DD)
  multiplier: number;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function listPayMultipliers(
  storeId: string,
  fromDate?: string,
  toDate?: string,
): Promise<PayMultiplier[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("pay_multipliers")
    .select("*")
    .eq("store_id", storeId)
    .order("date", { ascending: false });
  if (fromDate) query = query.gte("date", fromDate);
  if (toDate) query = query.lte("date", toDate);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PayMultiplier[];
}

export async function upsertPayMultiplier(input: {
  storeId: string;
  date: string;
  multiplier: number;
  reason?: string;
}): Promise<PayMultiplier> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("pay_multipliers")
    .upsert(
      {
        store_id: input.storeId,
        date: input.date,
        multiplier: input.multiplier,
        reason: input.reason?.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "store_id,date" },
    )
    .select()
    .single();
  if (error) throw error;
  return data as PayMultiplier;
}

export async function deletePayMultiplier(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("pay_multipliers")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function getTodayMultiplier(
  storeId: string,
): Promise<PayMultiplier | null> {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("pay_multipliers")
    .select("*")
    .eq("store_id", storeId)
    .eq("date", today)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as PayMultiplier | null;
}
