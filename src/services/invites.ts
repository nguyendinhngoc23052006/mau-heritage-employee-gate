import { getSupabase } from "../lib/supabaseClient";
import type { Invite } from "../types/database";

export async function resendInvite(inviteId: string): Promise<Invite> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("resend_invite", {
    p_invite_id: inviteId,
  });
  if (error) throw error;
  return data as Invite;
}

import type {
  EmploymentType,
  Invite,
  Membership,
  Role,
} from "../types/database";

export async function listInvitesFor(storeId: string): Promise<Invite[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("invites")
    .select("*")
    .eq("store_id", storeId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createInvite(params: {
  store_id: string;
  email: string;
  role: Role;
  employment_type: EmploymentType;
  hourly_rate_cents: number;
}): Promise<Invite> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("invites")
    .insert({
      store_id: params.store_id,
      email: params.email,
      role: params.role,
      employment_type: params.employment_type,
      hourly_rate_cents: params.hourly_rate_cents,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function revokeInvite(id: string): Promise<Invite> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function acceptInvite(token: string): Promise<Membership> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("accept_invite", {
    p_token: token,
  });
  if (error) throw error;
  return data;
}

export function buildInviteLink(token: string): string {
  return `${window.location.origin}/invite/${token}`;
}
