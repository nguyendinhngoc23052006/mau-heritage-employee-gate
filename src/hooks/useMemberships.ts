import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "../lib/supabaseClient";
import type { Membership, Role, Store } from "../types/database";
import { useSession } from "./useSession";

export interface MembershipWithStore extends Membership {
  store: Store;
}

interface UseMembershipsResult {
  data?: MembershipWithStore[];
  isLoading: boolean;
  isDeactivated?: boolean;
}

export function useMemberships(): UseMembershipsResult {
  const { user } = useSession();
  const query = useQuery<MembershipWithStore[]>({
    queryKey: ["memberships", "mine"],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("memberships")
        .select("*, store:stores(*)")
        .eq("active", true);
      if (error) throw error;
      return (data ?? []) as MembershipWithStore[];
    },
  });

  const isDeactivated =
    user && query.isSuccess && query.data && query.data.length === 0
      ? true
      : undefined;

  return {
    data: query.data,
    isLoading: query.isLoading,
    isDeactivated,
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
