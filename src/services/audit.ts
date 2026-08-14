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
  } = {},
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

export async function exportAuditCsv(
  storeId: string,
  from?: string,
  to?: string,
): Promise<void> {
  const supabase = getSupabase();
  let query = supabase
    .from("audit_log")
    .select("*, actor:profiles(display_name)")
    .eq("store_id", storeId);

  if (from) {
    query = query.gte("at", from);
  }
  if (to) {
    query = query.lte("at", to);
  }

  const { data, error } = await query.order("at", { ascending: false });
  if (error) throw error;

  const rows = data ?? [];
  const bom = "﻿";
  const header = [
    "at",
    "actor_display_name",
    "action",
    "entity_type",
    "entity_id",
    "details",
  ];
  const csvRows = [
    header.join(","),
    ...rows.map((row: any) =>
      [
        `"${(row.at || "").replace(/"/g, '""')}"`,
        `"${(row.actor?.display_name || "").replace(/"/g, '""')}"`,
        `"${(row.action || "").replace(/"/g, '""')}"`,
        `"${(row.entity_type || "").replace(/"/g, '""')}"`,
        `"${(row.entity_id || "").replace(/"/g, '""')}"`,
        `"${JSON.stringify(row.after_json || {}).replace(/"/g, '""')}"`,
      ].join(","),
    ),
  ];

  const csv = bom + csvRows.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `audit-${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
