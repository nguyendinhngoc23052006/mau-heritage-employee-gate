import type { GlobalRole, Role, Tier } from "../types/database";

export type AssignableRole =
  | "ceo"
  | "director"
  | "owner"
  | "manager"
  | "employee";

// Mirrors public.role_tier() in the org-hierarchy migration. The database is
// the enforcer; this exists so the UI never offers a button the RPC will refuse.
export const ROLE_TIER: Record<AssignableRole, Tier> = {
  ceo: 1,
  director: 2,
  owner: 3,
  manager: 3,
  employee: 4,
};

// Mirrors public.tier_of().
export function computeTier(input: {
  globalRole: GlobalRole | null | undefined;
  directorOfCount: number;
  storeRoles: Role[];
}): Tier {
  if (input.globalRole) return 1;
  if (input.directorOfCount > 0) return 2;
  if (input.storeRoles.some((r) => r === "owner" || r === "manager")) return 3;
  return 4;
}

// You act only on people strictly below you.
export function canActOn(myTier: Tier, targetTier: Tier): boolean {
  return targetTier > myTier;
}

// You assign only roles strictly below your own tier.
export function canAssign(myTier: Tier, role: AssignableRole): boolean {
  return ROLE_TIER[role] > myTier;
}

export function tierOfRole(role: Role): Tier {
  return ROLE_TIER[role];
}
