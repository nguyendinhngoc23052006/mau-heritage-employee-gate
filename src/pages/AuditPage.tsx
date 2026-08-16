import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { AttendanceHeatmap } from "../components/AttendanceHeatmap";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/ui/EmptyState";
import { Input } from "../components/ui/Input";
import { isManagerRole, useRoleOn } from "../hooks/useMemberships";
import { useT } from "../lib/i18n";
import { exportAuditCsv, listAuditLog } from "../services/audit";
import type { AuditLog } from "../types/database";

export function AuditPage() {
  const t = useT();
  const { storeId } = useParams<{ storeId: string }>();
  const role = useRoleOn(storeId);
  const isManager = isManagerRole(role);

  const [filterEntityType, setFilterEntityType] = useState<string>("");
  const [before, setBefore] = useState<string>("");
  const [allItems, setAllItems] = useState<AuditLog[]>([]);
  const [hasMore, setHasMore] = useState(true);

  const { isLoading, error, refetch } = useQuery({
    queryKey: ["audit-log", storeId, filterEntityType, before],
    enabled: !!storeId,
    queryFn: async () => {
      const items = await listAuditLog(storeId as string, {
        entity_type: filterEntityType || undefined,
        limit: 100,
        before_at: before || undefined,
      });
      if (before) {
        setAllItems((prev) => [...prev, ...items]);
      } else {
        setAllItems(items);
      }
      setHasMore(items.length === 100);
      return items;
    },
  });

  const distinctEntityTypes = useMemo(() => {
    const types = new Set<string>();
    allItems.forEach((item) => {
      types.add(item.entity_type);
    });
    return Array.from(types).sort();
  }, [allItems]);

  const handleLoadMore = () => {
    if (allItems.length > 0) {
      const lastItem = allItems[allItems.length - 1];
      setBefore(lastItem.at);
    }
  };

  const handleFilterChange = (type: string) => {
    setFilterEntityType(type);
    setBefore("");
    setAllItems([]);
    refetch();
  };

  if (!storeId) {
    return <ErrorState message="Store not found" />;
  }

  if (isLoading && allItems.length === 0) {
    return <LoadingState>{t("common.loading")}</LoadingState>;
  }

  if (error && allItems.length === 0) {
    return (
      <ErrorState
        message={
          error instanceof Error ? error.message : "Error loading audit log"
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold font-display text-brand-ink">
        {t("nav.audit")}
      </h1>

      {/* Filter */}
      <Card>
        <div className="space-y-3">
          <label
            htmlFor="entity-filter"
            className="block text-sm font-medium text-slate-700"
          >
            Filter
          </label>
          <div className="flex gap-2">
            <Input
              id="entity-filter"
              value={filterEntityType}
              onChange={(e) => handleFilterChange(e.target.value)}
              placeholder="Filter by entity type..."
              list="entity-types"
              className="flex-1"
            />
            <datalist id="entity-types">
              {distinctEntityTypes.map((type) => (
                <option key={type} value={type} />
              ))}
            </datalist>
            {filterEntityType && (
              <Button
                variant="secondary"
                onClick={() => handleFilterChange("")}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Export Button */}
      {allItems.length > 0 && (
        <div className="flex justify-end mb-4">
          <Button
            onClick={() => exportAuditCsv(storeId as string)}
            variant="secondary"
          >
            {t("audit.export_csv")}
          </Button>
        </div>
      )}

      {/* Table */}
      {allItems.length === 0 ? (
        <EmptyState>{t("common.empty")}</EmptyState>
      ) : (
        <>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-2 text-left text-slate-600">Time</th>
                    <th className="px-4 py-2 text-left text-slate-600">
                      Actor
                    </th>
                    <th className="px-4 py-2 text-left text-slate-600">
                      Entity Type
                    </th>
                    <th className="px-4 py-2 text-left text-slate-600">
                      Entity ID
                    </th>
                    <th className="px-4 py-2 text-left text-slate-600">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allItems.map((item: AuditLog) => (
                    <tr
                      key={`${item.id}-${item.at}`}
                      className="border-b border-slate-100 hover:bg-brand-cream-light"
                    >
                      <td className="px-4 py-2 text-slate-900">
                        {new Date(item.at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-slate-600">
                        {item.actor_id?.substring(0, 8) || "—"}
                      </td>
                      <td className="px-4 py-2 text-slate-600">
                        {item.entity_type}
                      </td>
                      <td className="px-4 py-2 text-slate-600">
                        {item.entity_id.substring(0, 12)}
                      </td>
                      <td className="px-4 py-2 text-slate-600">
                        {item.action}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {hasMore && (
            <div className="flex justify-center">
              <Button onClick={handleLoadMore} variant="secondary">
                Load more
              </Button>
            </div>
          )}
        </>
      )}

      {/* Attendance Heatmap - Manager only */}
      {isManager && (
        <Card>
          <CardTitle>Attendance Heatmap</CardTitle>
          <div className="mt-4">
            <AttendanceHeatmap
              storeId={storeId}
              from={new Date(
                Date.now() - 30 * 24 * 60 * 60 * 1000,
              ).toISOString()}
              to={new Date().toISOString()}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
