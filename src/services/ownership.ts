import { getSupabase } from "../lib/supabaseClient";

export async function transferOwnership(params: {
  toUserId: string;
  storeId: string;
}): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc("transfer_ownership", {
    p_to_user_id: params.toUserId,
    p_store_id: params.storeId,
  });
  if (error) throw error;
}

export async function deleteStore(storeId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc("delete_store", {
    p_store_id: storeId,
  });
  if (error) throw error;
}

export async function setMembershipLastActive(storeId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc("set_membership_last_active", {
    p_store_id: storeId,
  });
  if (error) throw error;
}
