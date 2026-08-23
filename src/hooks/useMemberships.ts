import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "../lib/supabaseClient";
import type { Membership, Role, Store } from "../types/database";

export interface MembershipWithStore extends Membership {
  store: Store;
}

interface UseMembershipsResult {
  data?: MembershipWithStore[];
  isLoading: boolean;
}

// 30s poll so a role demotion/promotion done by another manager reaches this
// session without a hard refresh. Also refetches on window focus.
//
// Sort by last_active_at happens client-side (not in the DB query) so that a
// database missing the last_active_at column (e.g. the mega-role-dashboards
// migration hasn't applied yet) doesn't fail the select and softlock the user
// into /deactivated. Rows without last_active_at fall to the end.
export function useMemberships(): UseMembershipsResult {
  const query = useQuery<MembershipWithStore[]>({
    queryKey: ["memberships", "mine"],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("memberships")
        .select("*, store:stores(*)")
        .eq("active", true);
      if (error) throw error;
      const rows = (data ?? []) as MembershipWithStore[];
      rows.sort((a, b) => {
        const aAt = a.last_active_at ?? "";
        const bAt = b.last_active_at ?? "";
        if (aAt === bAt) return 0;
        if (aAt === "") return 1;
        if (bAt === "") return -1;
        return bAt.localeCompare(aAt);
      });
      return rows;
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
  };
}

export function useRoleOn(storeId: string | undefined): Role | undefined {
  const { data } = useMemberships();
  if (!storeId || !data) return undefined;
  return data.find((m) => m.store_id === storeId)?.role;
}

export function isManagerRole(role: Role | undefined): boolean {
  return role === "owner" || role === "manager";
}

export function isOwnerRole(role: Role | undefined): boolean {
  return role === "owner";
}
