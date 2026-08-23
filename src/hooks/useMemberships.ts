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
export function useMemberships(): UseMembershipsResult {
  const query = useQuery<MembershipWithStore[]>({
    queryKey: ["memberships", "mine"],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("memberships")
        .select("*, store:stores(*)")
        .eq("active", true)
        .order("last_active_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as MembershipWithStore[];
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
