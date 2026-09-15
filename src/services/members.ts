import { getSupabase } from "../lib/supabaseClient";
import type { MembershipPublic, Profile } from "../types/database";

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
  // Drop rows with no usable user_id before anything downstream sees them.
  // Such a row cannot be keyed to a profile, cannot be a Select value, and
  // cannot be labelled — every consumer either crashes on `user_id.substring`
  // or renders a dead option. Fixing it once here covers all eight call sites;
  // guarding each of them individually never can.
  const rows = ((members ?? []) as MembershipPublic[]).filter(
    (r) => typeof r?.user_id === "string" && r.user_id.length > 0,
  );
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

export async function updateHourlyRate(params: {
  storeId: string;
  userId: string;
  hourlyRateCents: number;
}) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("set_hourly_rate", {
    p_store_id: params.storeId,
    p_user_id: params.userId,
    p_cents: params.hourlyRateCents,
  });
  if (error) throw error;
  return data;
}
