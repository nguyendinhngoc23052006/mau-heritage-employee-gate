import { getSupabase } from "../lib/supabaseClient";
import type { SalesReport } from "../types/database";

export async function submitSales(input: {
  store_id: string;
  shift_id?: string;
  cash_cents: number;
  card_cents: number;
  qr_cents: number;
  expected_cents?: number;
  note?: string;
}): Promise<SalesReport> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("submit_sales", {
    p_store_id: input.store_id,
    p_cash: input.cash_cents,
    p_card: input.card_cents,
    p_qr: input.qr_cents,
    p_expected: input.expected_cents ?? null,
    p_note: input.note ?? null,
    p_shift_id: input.shift_id ?? null,
  });
  if (error) throw error;
  return data as SalesReport;
}

export async function listMySales(
  userId: string,
  storeId: string,
  opts?: { limit?: number; offset?: number },
): Promise<SalesReport[]> {
  const supabase = getSupabase();
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  const { data, error } = await supabase
    .from("sales_reports")
    .select("*")
    .eq("user_id", userId)
    .eq("store_id", storeId)
    .order("submitted_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return (data ?? []) as SalesReport[];
}

export async function listPendingSales(
  storeId: string,
  opts?: { limit?: number },
): Promise<(SalesReport & { submitter_display_name: string | null })[]> {
  const supabase = getSupabase();
  const limit = opts?.limit ?? 100;
  const { data: reports, error: reportsError } = await supabase
    .from("sales_reports")
    .select("*")
    .eq("store_id", storeId)
    .eq("status", "pending")
    .order("submitted_at", { ascending: false })
    .range(0, limit - 1);
  if (reportsError) throw reportsError;

  const rows = (reports ?? []) as SalesReport[];
  if (rows.length === 0) return [];

  const userIds = rows
    .map((r) => r.user_id)
    .filter((id): id is string => id !== null && id !== undefined);
  const uniqueIds = Array.from(new Set(userIds));

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", uniqueIds);
  if (profilesError) throw profilesError;

  const nameMap = new Map<string, string>(
    ((profiles ?? []) as Array<{ id: string; display_name: string }>).map(
      (p) => [p.id, p.display_name],
    ),
  );

  return rows.map((r) => ({
    ...r,
    submitter_display_name: (r.user_id ? nameMap.get(r.user_id) : null) ?? null,
  }));
}

export async function approveSales(id: string): Promise<SalesReport> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("sales_reports")
    .update({
      status: "approved",
      decided_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as SalesReport;
}

export async function disputeSales(
  id: string,
  disputeReason: string,
): Promise<SalesReport> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("sales_reports")
    .update({
      status: "disputed",
      decided_at: new Date().toISOString(),
      dispute_reason: disputeReason,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as SalesReport;
}
