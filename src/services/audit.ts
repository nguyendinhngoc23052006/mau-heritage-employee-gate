import { getSupabase } from "../lib/supabaseClient";
import type { AuditLog } from "../types/database";

export async function listAuditLog(
  storeId: string,
  {
    actor_id,
    entity_type,
    limit = 100,
    before_at,
  }: {
    actor_id?: string;
    entity_type?: string;
    limit?: number;
    before_at?: string;
  } = {}
): Promise<AuditLog[]> {
  const supabase = getSupabase();
  let query = supabase.from("audit_log").select("*").eq("store_id", storeId);

  if (actor_id) {
    query = query.eq("actor_id", actor_id);
  }

  if (entity_type) {
    query = query.eq("entity_type", entity_type);
  }

  if (before_at) {
    query = query.lt("at", before_at);
  }

  const { data, error } = await query
    .order("at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
