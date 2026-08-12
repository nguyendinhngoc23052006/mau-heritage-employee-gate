import { getSupabase } from "../lib/supabaseClient";
import type { Rule, RuleEvent, PointEvent, PrizeFineEvent } from "../types/database";

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
  trigger_type: "missed_shift" | "late_arrival" | "till_variance" | "points_threshold" | "manager_manual";
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

export async function updateRule(id: string, patch: Partial<Rule>): Promise<Rule> {
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
}): Promise<{ ruleEvent: RuleEvent; pointEvent?: PointEvent; prizeFineEvent?: PrizeFineEvent }> {
  const supabase = getSupabase();
  const uid = (await supabase.auth.getUser()).data.user?.id;

  const ruleEventData = {
    rule_id: params.rule.id,
    store_id: params.rule.store_id,
    target_user_id: params.target_user_id,
    applied_by: uid,
    applied_at: new Date().toISOString(),
    snapshot_name: params.rule.name,
    snapshot_trigger: params.rule.trigger_type,
    snapshot_params: params.rule.trigger_params,
    snapshot_points_delta: params.rule.points_delta,
    snapshot_amount_cents: params.rule.amount_cents,
    reason: params.reason ?? null,
  };

  const { data: ruleEventResult, error: ruleEventError } = await supabase
    .from("rule_events")
    .insert(ruleEventData)
    .select()
    .single();

  if (ruleEventError) throw ruleEventError;
  const ruleEvent = ruleEventResult as RuleEvent;

  let pointEvent: PointEvent | undefined;
  if (params.rule.points_delta !== 0) {
    const { data: pointEventResult, error: pointEventError } = await supabase
      .from("point_events")
      .insert({
        store_id: params.rule.store_id,
        user_id: params.target_user_id,
        delta: params.rule.points_delta,
        reason: params.reason ?? null,
        rule_event_id: ruleEvent.id,
      })
      .select()
      .single();

    if (pointEventError) throw pointEventError;
    pointEvent = pointEventResult as PointEvent;
  }

  let prizeFineEvent: PrizeFineEvent | undefined;
  if (params.rule.amount_cents !== 0) {
    const { data: prizeFineEventResult, error: prizeFineEventError } = await supabase
      .from("prize_fine_events")
      .insert({
        store_id: params.rule.store_id,
        user_id: params.target_user_id,
        kind: params.rule.amount_cents >= 0 ? "prize" : "fine",
        amount_cents: Math.abs(params.rule.amount_cents),
        reason: params.reason ?? null,
        rule_event_id: ruleEvent.id,
      })
      .select()
      .single();

    if (prizeFineEventError) throw prizeFineEventError;
    prizeFineEvent = prizeFineEventResult as PrizeFineEvent;
  }

  return { ruleEvent, pointEvent, prizeFineEvent };
}
