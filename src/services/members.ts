import { getSupabase } from "../lib/supabaseClient";
import type { MembershipPublic, Profile, Role } from "../types/database";

export interface MemberWithProfile extends MembershipPublic {
  profile: Profile | null;
}

// Two-step fetch: memberships_public is a VIEW without a PostgREST-registered
// FK to public.profiles, so the previous embedded `profile:profiles(*)` query
// silently failed. Fetch both sides and stitch client-side.
export async function listMembers(
  storeId: string,
): Promise<MemberWithProfile[]> {
  const supabase = getSupabase();
  const { data: members, error: mErr } = await supabase
    .from("memberships_public")
    .select("*")
    .eq("store_id", storeId)
    .eq("active", true);
  if (mErr) throw mErr;
  const rows = (members ?? []) as MembershipPublic[];
  if (rows.length === 0) return [];

  const userIds = rows.map((r) => r.user_id);
  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("*")
    .in("id", userIds);
  if (pErr) throw pErr;
  const profileById = new Map<string, Profile>(
    ((profiles ?? []) as Profile[]).map((p) => [p.id, p]),
  );

  const merged: MemberWithProfile[] = rows.map((m) => ({
    ...m,
    profile: profileById.get(m.user_id) ?? null,
  }));
  merged.sort((a, b) => {
    const an = a.profile?.display_name ?? "";
    const bn = b.profile?.display_name ?? "";
    return an.localeCompare(bn);
  });
  return merged;
}

export async function updateMemberRole(
  userId: string,
  storeId: string,
  role: Role,
) {
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
