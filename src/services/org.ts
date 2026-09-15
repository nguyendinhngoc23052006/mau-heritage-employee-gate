import { getSupabase } from "../lib/supabaseClient";
import type {
  Profile,
  RoleScope,
  Sector,
  SectorMembership,
  Store,
} from "../types/database";

export interface DirectorWithProfile extends SectorMembership {
  profile: Profile | null;
}

// RLS scopes every read: tier 1 sees all sectors, a director sees theirs, a
// store member sees the sector their store belongs to.
export async function listSectors(): Promise<Sector[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("sectors")
    .select("*")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return (data ?? []) as Sector[];
}

export async function createSector(name: string): Promise<Sector> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("sector name required");
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");
  const { data, error } = await supabase
    .from("sectors")
    .insert({ name: trimmed, created_by: user.id })
    .select()
    .single();
  if (error) throw error;
  return data as Sector;
}

export async function renameSector(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("sector name required");
  const supabase = getSupabase();
  const { error } = await supabase
    .from("sectors")
    .update({ name: trimmed })
    .eq("id", id);
  if (error) throw error;
}

// Two-step like listMembers: sector_memberships has no PostgREST-visible FK
// to profiles, so the embed form silently returns nothing.
export async function listSectorDirectors(
  sectorId: string,
): Promise<DirectorWithProfile[]> {
  const supabase = getSupabase();
  const { data: rows, error } = await supabase
    .from("sector_memberships")
    .select("*")
    .eq("sector_id", sectorId)
    .eq("active", true);
  if (error) throw error;
  const memberships = (rows ?? []) as SectorMembership[];
  if (memberships.length === 0) return [];
  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("*")
    .in(
      "id",
      memberships.map((m) => m.user_id),
    );
  if (pErr) throw pErr;
  const byId = new Map(((profiles ?? []) as Profile[]).map((p) => [p.id, p]));
  return memberships.map((m) => ({
    ...m,
    profile: byId.get(m.user_id) ?? null,
  }));
}

export async function listMySectorMemberships(): Promise<SectorMembership[]> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("sector_memberships")
    .select("*")
    .eq("user_id", user.id)
    .eq("active", true);
  if (error) throw error;
  return (data ?? []) as SectorMembership[];
}

export async function listStoresInSector(sectorId: string): Promise<Store[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("stores")
    .select("*")
    .eq("sector_id", sectorId)
    .order("name");
  if (error) throw error;
  return (data ?? []) as Store[];
}

export async function createStoreInSector(
  sectorId: string,
  name: string,
): Promise<Store> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("store name required");
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");
  const { data, error } = await supabase
    .from("stores")
    .insert({ name: trimmed, sector_id: sectorId, created_by: user.id })
    .select()
    .single();
  if (error) throw error;
  return data as Store;
}

// The only way any role changes. The database re-checks every rule; the UI
// only decides which buttons to draw (see src/lib/tier.ts).
export async function setRole(params: {
  targetUserId: string;
  scope: RoleScope;
  scopeId: string | null;
  role: "ceo" | "director" | "manager" | "employee" | "none";
}): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc("set_role", {
    p_target: params.targetUserId,
    p_scope: params.scope,
    p_scope_id: params.scopeId,
    p_role: params.role,
  });
  if (error) throw error;
}

// Tier 1's directory: RLS returns every profile for tier 1, and only the
// caller's own branch for anyone else, so the same call serves both.
export async function listPeople(): Promise<Profile[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("display_name", { nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as Profile[];
}
