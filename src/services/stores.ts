import { getSupabase } from "../lib/supabaseClient";
import type { Store } from "../types/database";

export async function createStore(params: {
  name: string;
  timezone?: string;
  currency?: string;
}): Promise<Store> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("create_store_with_owner", {
    p_name: params.name,
    p_timezone: params.timezone ?? "Asia/Ho_Chi_Minh",
    p_currency: params.currency ?? "VND",
  });
  if (error) throw error;
  return data as Store;
}

export async function getStore(id: string): Promise<Store | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("stores")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as Store | null) ?? null;
}

export async function updateStore(
  id: string,
  patch: Partial<Pick<Store, "name" | "timezone" | "currency">>,
): Promise<Store> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("stores")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as Store;
}

export async function regenerateJoinCode(storeId: string): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("regenerate_join_code", {
    p_store_id: storeId,
  });
  if (error) throw error;
  return data as string;
}
