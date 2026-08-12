import { getSupabase } from "../lib/supabaseClient";
import type { Store } from "../types/database";

export async function createStore(params: {
  name: string;
  timezone?: string;
  currency?: string;
}): Promise<Store> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");

  const { data, error } = await supabase
    .from("stores")
    .insert({
      name: params.name,
      timezone: params.timezone ?? "Asia/Ho_Chi_Minh",
      currency: params.currency ?? "VND",
      created_by: user.id,
    })
    .select()
    .single();
  if (error) throw error;

  await supabase
    .from("memberships")
    .insert({
      user_id: user.id,
      store_id: data.id,
      role: "owner",
    })
    .select()
    .single();

  return data;
}

export async function getStore(id: string): Promise<Store> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("stores")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function updateStore(
  id: string,
  updates: { name?: string; timezone?: string; currency?: string },
) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("stores")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
