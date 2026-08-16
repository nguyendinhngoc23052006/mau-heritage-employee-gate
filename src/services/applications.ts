import { getSupabase } from "../lib/supabaseClient";
import type {
  EmploymentType,
  Membership,
  Role,
  StoreApplication,
} from "../types/database";

export interface StorePreview {
  id: string;
  name: string;
}

export async function previewStoreByCode(
  code: string,
): Promise<StorePreview | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("preview_store_by_code", {
    p_join_code: code,
  });
  if (error) throw error;
  const rows = (data as StorePreview[]) ?? [];
  return rows[0] ?? null;
}

export async function submitApplication(params: {
  code: string;
  note?: string;
}): Promise<StoreApplication> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("submit_application", {
    p_join_code: params.code,
    p_note: params.note ?? null,
  });
  if (error) throw error;
  return data as StoreApplication;
}

export async function listMyApplications(): Promise<
  (StoreApplication & { store: { name: string } | null })[]
> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("store_applications")
    .select("*, store:stores(name)")
    .order("submitted_at", { ascending: false });
  if (error) throw error;
  return (
    (data as (StoreApplication & { store: { name: string } | null })[]) ?? []
  );
}

export async function listPendingApplications(
  storeId: string,
): Promise<StoreApplication[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("store_applications")
    .select("*")
    .eq("store_id", storeId)
    .eq("status", "pending")
    .order("submitted_at", { ascending: false });
  if (error) throw error;
  return (data as StoreApplication[]) ?? [];
}

export async function approveApplication(params: {
  id: string;
  role: Role;
  employment_type: EmploymentType;
  hourly_rate_cents: number;
}): Promise<Membership> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("approve_application", {
    p_id: params.id,
    p_role: params.role,
    p_employment_type: params.employment_type,
    p_hourly_rate_cents: params.hourly_rate_cents,
  });
  if (error) throw error;
  return data as Membership;
}

export async function declineApplication(params: {
  id: string;
  reason?: string;
}): Promise<StoreApplication> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("decline_application", {
    p_id: params.id,
    p_reason: params.reason ?? null,
  });
  if (error) throw error;
  return data as StoreApplication;
}

export async function withdrawApplication(
  id: string,
): Promise<StoreApplication> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("withdraw_application", {
    p_id: id,
  });
  if (error) throw error;
  return data as StoreApplication;
}

export async function listMyDeclinedApplications(): Promise<
  (StoreApplication & { store: { name: string } | null })[]
> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("store_applications")
    .select("*, store:stores(name)")
    .eq("status", "declined")
    .order("decided_at", { ascending: false });
  if (error) throw error;
  return (
    (data as (StoreApplication & { store: { name: string } | null })[]) ?? []
  );
}

export async function dismissDeclinedApplication(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("store_applications")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
