import { getSupabase } from "../lib/supabaseClient";
import type {
  ClockCorrectionKind,
  ClockCorrectionRequest,
  ClockEvent,
} from "../types/database";

export async function requestClockCorrection(params: {
  storeId: string;
  clockEventId?: string | null;
  kind: ClockCorrectionKind;
  reason: string;
  proposedAt?: string;
}): Promise<ClockCorrectionRequest> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("request_clock_correction", {
    p_store_id: params.storeId,
    p_clock_event_id: params.clockEventId ?? null,
    p_kind: params.kind,
    p_reason: params.reason,
    p_proposed_at: params.proposedAt ?? null,
  });
  if (error) throw error;
  return data as ClockCorrectionRequest;
}

export async function resolveClockCorrection(params: {
  requestId: string;
  decision: "approved" | "denied";
  note?: string;
}): Promise<ClockCorrectionRequest> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("resolve_clock_correction", {
    p_request_id: params.requestId,
    p_decision: params.decision,
    p_note: params.note ?? null,
  });
  if (error) throw error;
  return data as ClockCorrectionRequest;
}

export async function listMyCorrectionRequests(
  storeId: string,
): Promise<ClockCorrectionRequest[]> {
  const supabase = getSupabase();
  const uid = (await supabase.auth.getUser()).data.user?.id;
  if (!uid) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("clock_correction_requests")
    .select("*")
    .eq("store_id", storeId)
    .eq("user_id", uid)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ClockCorrectionRequest[];
}

export async function listPendingCorrectionRequests(
  storeId: string,
): Promise<ClockCorrectionRequest[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("clock_correction_requests")
    .select("*")
    .eq("store_id", storeId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ClockCorrectionRequest[];
}

export async function editClockEvent(params: {
  eventId: string;
  newAt: string;
  reason: string;
}): Promise<ClockEvent> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("edit_clock_event", {
    p_event_id: params.eventId,
    p_new_at: params.newAt,
    p_reason: params.reason,
  });
  if (error) throw error;
  return data as ClockEvent;
}

export async function insertManualClockEvent(params: {
  storeId: string;
  userId: string;
  kind: "in" | "out";
  at: string;
  reason: string;
}): Promise<ClockEvent> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("insert_manual_clock_event", {
    p_store_id: params.storeId,
    p_user_id: params.userId,
    p_kind: params.kind,
    p_at: params.at,
    p_reason: params.reason,
  });
  if (error) throw error;
  return data as ClockEvent;
}
