import { getSupabase } from "../lib/supabaseClient";
import type { PointEvent, PrizeFineEvent } from "../types/database";

export async function getMyBalance(storeId: string): Promise<number> {
  const supabase = getSupabase();
  const uid = (await supabase.auth.getUser()).data.user?.id;

  if (!uid) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("point_balances")
    .select("balance")
    .eq("user_id", uid)
    .eq("store_id", storeId)
    .single();

  if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows
  return (data?.balance ?? 0) as number;
}

export async function listMyPointEvents(
  storeId: string,
  limit = 50,
): Promise<PointEvent[]> {
  const supabase = getSupabase();
  const uid = (await supabase.auth.getUser()).data.user?.id;

  if (!uid) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("point_events")
    .select("*")
    .eq("user_id", uid)
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as PointEvent[];
}

export async function listMyPrizeFine(
  storeId: string,
  limit = 50,
): Promise<PrizeFineEvent[]> {
  const supabase = getSupabase();
  const uid = (await supabase.auth.getUser()).data.user?.id;

  if (!uid) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("prize_fine_events")
    .select("*")
    .eq("user_id", uid)
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as PrizeFineEvent[];
}

export async function issuePrizeFine(params: {
  storeId: string;
  userId: string;
  kind: "prize" | "fine";
  amountCents: number;
  reason: string;
}): Promise<PrizeFineEvent> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("issue_prize_fine", {
    p_store_id: params.storeId,
    p_user_id: params.userId,
    p_kind: params.kind,
    p_amount_cents: params.amountCents,
    p_reason: params.reason,
  });
  if (error) throw error;
  return data as PrizeFineEvent;
}

export async function markPrizeFinePaid(
  eventId: string,
): Promise<PrizeFineEvent> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("mark_prize_fine_paid", {
    p_event_id: eventId,
  });
  if (error) throw error;
  return data as PrizeFineEvent;
}

export async function cancelPrizeFine(
  eventId: string,
  reason: string,
): Promise<PrizeFineEvent> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("cancel_prize_fine", {
    p_event_id: eventId,
    p_reason: reason,
  });
  if (error) throw error;
  return data as PrizeFineEvent;
}

export async function disputePrizeFine(
  eventId: string,
  reason: string,
): Promise<PrizeFineEvent> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("dispute_prize_fine", {
    p_event_id: eventId,
    p_reason: reason,
  });
  if (error) throw error;
  return data as PrizeFineEvent;
}

export async function resolvePrizeFineDispute(params: {
  eventId: string;
  decision: "uphold" | "reverse";
  note?: string;
}): Promise<PrizeFineEvent> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("resolve_prize_fine_dispute", {
    p_event_id: params.eventId,
    p_decision: params.decision,
    p_note: params.note ?? null,
  });
  if (error) throw error;
  return data as PrizeFineEvent;
}

export async function listStorePrizeFine(
  storeId: string,
  opts?: {
    status?: "pending" | "paid" | "cancelled" | "disputed";
    from?: string;
    to?: string;
  },
): Promise<PrizeFineEvent[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("prize_fine_events")
    .select("*")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });
  if (opts?.status) query = query.eq("status", opts.status);
  if (opts?.from) query = query.gte("created_at", opts.from);
  if (opts?.to) query = query.lt("created_at", opts.to);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PrizeFineEvent[];
}
