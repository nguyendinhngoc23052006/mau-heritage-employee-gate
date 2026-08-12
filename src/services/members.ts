import { getSupabase } from "../lib/supabaseClient";
import type { MembershipPublic, Role, Profile } from "../types/database";

export interface MemberWithProfile extends MembershipPublic {
  profile: Profile;
}

export async function listMembers(storeId: string): Promise<MemberWithProfile[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("memberships_public")
    .select("*, profile:profiles(*)")
    .eq("store_id", storeId)
    .eq("active", true)
    .order("profile.display_name");
  if (error) throw error;
  return (data ?? []) as MemberWithProfile[];
}

export async function updateMemberRole(userId: string, storeId: string, role: Role) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("memberships")
    .update({ role })
    .eq("user_id", userId)
    .eq("store_id", storeId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deactivateMember(userId: string, storeId: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("memberships")
    .update({ active: false })
    .eq("user_id", userId)
    .eq("store_id", storeId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
