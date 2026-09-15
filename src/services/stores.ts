import { getSupabase } from "../lib/supabaseClient";
import type { Store } from "../types/database";

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

export async function setStoreGeofence(input: {
  storeId: string;
  lat: number | null;
  lng: number | null;
  radiusM: number | null;
  require: boolean;
}): Promise<Store> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("set_store_geofence", {
    p_store_id: input.storeId,
    p_lat: input.lat,
    p_lng: input.lng,
    p_radius_m: input.radiusM,
    p_require: input.require,
  });
  if (error) throw error;
  return data as Store;
}

export async function setStoreVarianceThreshold(input: {
  storeId: string;
  pct: number;
}): Promise<Store> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("set_store_variance_threshold", {
    p_store_id: input.storeId,
    p_pct: input.pct,
  });
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
