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
  const { data, error } = await supabase
    .from("sales_reports")
    .insert([
      {
        store_id: input.store_id,
        shift_id: input.shift_id || null,
        cash_cents: input.cash_cents,
        card_cents: input.card_cents,
        qr_cents: input.qr_cents,
        expected_cents: input.expected_cents || null,
        note: input.note || null,
        status: "pending",
      },
    ])
    .select()
    .single();
  if (error) throw error;
  return data as SalesReport;
}

export async function listMySales(
  userId: string,
  storeId: string,
): Promise<SalesReport[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("sales_reports")
    .select("*")
    .eq("user_id", userId)
    .eq("store_id", storeId)
    .order("submitted_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SalesReport[];
}

export async function listPendingSales(
  storeId: string,
): Promise<SalesReport[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("sales_reports")
    .select("*")
    .eq("store_id", storeId)
    .eq("status", "pending")
    .order("submitted_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SalesReport[];
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
