import { useQuery } from "@tanstack/react-query";
import { computeTier } from "../lib/tier";
import { listMySectorMemberships } from "../services/org";
import { getMyProfile } from "../services/profiles";
import type { Profile, SectorMembership, Tier } from "../types/database";
import { useMemberships } from "./useMemberships";

interface Me {
  profile: Profile | null;
  sectorMemberships: SectorMembership[];
}

export interface UseMeResult {
  profile: Profile | null | undefined;
  directorOf: string[];
  // undefined while loading OR after a failed fetch: "don't know" must never
  // read as "employee", or a transient error would boot a director out of /org.
  tier: Tier | undefined;
  isLoading: boolean;
  isError: boolean;
}

// Who am I in the hierarchy. Tier is derived exactly as public.tier_of() does
// it, from the same three facts; the server re-derives it on every write.
export function useMe(): UseMeResult {
  const memberships = useMemberships();
  const me = useQuery<Me>({
    queryKey: ["me"],
    queryFn: async () => {
      const [profile, sectorMemberships] = await Promise.all([
        getMyProfile(),
        listMySectorMemberships(),
      ]);
      return { profile, sectorMemberships };
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const isLoading = me.isLoading || memberships.isLoading;
  const isError = me.isError || memberships.isError;
  const directorOf = (me.data?.sectorMemberships ?? []).map((m) => m.sector_id);
  const tier =
    isLoading || isError
      ? undefined
      : computeTier({
          globalRole: me.data?.profile?.global_role ?? null,
          directorOfCount: directorOf.length,
          storeRoles: (memberships.data ?? []).map((m) => m.role),
        });

  return { profile: me.data?.profile, directorOf, tier, isLoading, isError };
}
