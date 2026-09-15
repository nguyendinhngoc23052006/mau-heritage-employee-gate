import { useQuery } from "@tanstack/react-query";
import { getStore } from "../services/stores";
import type { Role } from "../types/database";
import { useMe } from "./useMe";
import { isManagerRole, useRoleOn } from "./useMemberships";

export interface StoreAccess {
  role: Role | undefined;
  // Tier 1, or a director of the store's sector: manages it without being a member.
  isOverseer: boolean;
  canManage: boolean;
  canEnter: boolean;
  isLoading: boolean;
}

export function useStoreAccess(storeId: string | undefined): StoreAccess {
  const role = useRoleOn(storeId);
  const me = useMe();
  const store = useQuery({
    queryKey: ["store", storeId],
    queryFn: () => (storeId ? getStore(storeId) : Promise.resolve(null)),
    enabled: !!storeId,
  });

  const isOverseer =
    me.tier === 1 ||
    (me.tier === 2 &&
      !!store.data?.sector_id &&
      me.directorOf.includes(store.data.sector_id));
  const canManage = isOverseer || isManagerRole(role);

  return {
    role,
    isOverseer,
    canManage,
    canEnter: !!role || isOverseer,
    isLoading: me.isLoading || store.isLoading,
  };
}
