import { getSupabase } from "../lib/supabaseClient";
import type { PointEvent, PrizeFineEvent, PointBalance } from "../types/database";

export async function getMyBalance(storeId: string): Promise<number> {
  const supabase = getSupabase();
  const uid = (await supabase.auth.getUser()).data.user?.id;

  if (!uid) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("point_balances")
    .select("balance")
    .eq("user_id", uid)
    .eq("store_id", storeId)
    .single();

  if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows
  return (data?.balance ?? 0) as number;
}

export async function listMyPointEvents(storeId: string, limit = 50): Promise<PointEvent[]> {
  const supabase = getSupabase();
  const uid = (await supabase.auth.getUser()).data.user?.id;

  if (!uid) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("point_events")
    .select("*")
    .eq("user_id", uid)
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as PointEvent[];
}

export async function listMyPrizeFine(storeId: string, limit = 50): Promise<PrizeFineEvent[]> {
  const supabase = getSupabase();
  const uid = (await supabase.auth.getUser()).data.user?.id;

  if (!uid) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("prize_fine_events")
    .select("*")
    .eq("user_id", uid)
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as PrizeFineEvent[];
}
