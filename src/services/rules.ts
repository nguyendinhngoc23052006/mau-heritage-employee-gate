import { getSupabase } from "../lib/supabaseClient";
import type { Rule, RuleEvent } from "../types/database";

export async function listRules(storeId: string): Promise<Rule[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("rules")
    .select("*")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Rule[];
}

export async function createRule(params: {
  store_id: string;
  name: string;
  kind: "auto" | "manual";
  trigger_type:
    | "missed_shift"
    | "late_arrival"
    | "till_variance"
    | "points_threshold"
    | "manager_manual";
  trigger_params?: Record<string, unknown>;
  points_delta: number;
  amount_cents: number;
  active?: boolean;
}): Promise<Rule> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("rules")
    .insert({
      store_id: params.store_id,
      name: params.name,
      kind: params.kind,
      trigger_type: params.trigger_type,
      trigger_params: params.trigger_params ?? {},
      points_delta: params.points_delta,
      amount_cents: params.amount_cents,
      active: params.active ?? true,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Rule;
}

export async function updateRule(
  id: string,
  patch: Partial<Rule>,
): Promise<Rule> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("rules")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Rule;
}

export async function applyManualRule(params: {
  rule: Rule;
  target_user_id: string;
  reason?: string;
  dedupe_key?: string;
}): Promise<RuleEvent> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("apply_manual_rule", {
    p_rule_id: params.rule.id,
    p_target_user_id: params.target_user_id,
    p_reason: params.reason ?? null,
    p_dedupe_key: params.dedupe_key ?? null,
  });
  if (error) throw error;
  return data as RuleEvent;
}
