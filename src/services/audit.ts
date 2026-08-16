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
  let query = supabase.from("audit_log").select("*").eq("store_id", storeId);

  if (from) {
    query = query.gte("at", from);
  }
  if (to) {
    query = query.lte("at", to);
  }

  const { data: auditRows, error } = await query.order("at", {
    ascending: false,
  });
  if (error) throw error;

  const rows = (auditRows ?? []) as AuditLog[];
  if (rows.length === 0) {
    const bom = "﻿";
    const header = [
      "at",
      "actor_display_name",
      "action",
      "entity_type",
      "entity_id",
      "details",
    ];
    const csv = bom + header.join(",");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  const actorIds = rows
    .map((r) => r.actor_id)
    .filter((id): id is string => id !== null && id !== undefined);
  const uniqueIds = Array.from(new Set(actorIds));

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
    ...rows.map((row) =>
      [
        `"${(row.at || "").replace(/"/g, '""')}"`,
        `"${((row.actor_id ? nameMap.get(row.actor_id) : null) ?? "").replace(
          /"/g,
          '""',
        )}"`,
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
