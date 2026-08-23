import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";

import { DisputePrizeFineDialog } from "../components/payroll/DisputePrizeFineDialog";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/ui/EmptyState";
import { Select } from "../components/ui/Select";
import { useSession } from "../hooks/useSession";
import { formatVnd } from "../lib/money";
import { useT } from "../lib/i18n";
import { listMyPrizeFine } from "../services/points";

type StatusFilter = "all" | "pending" | "paid" | "cancelled" | "disputed";

export function MyFinesPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const { storeId } = useParams<{ storeId: string }>();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const ready = Boolean(user?.id && storeId);

  const { data: allPrizeFine, isLoading } = useQuery({
    queryKey: ["my-prize-fine", storeId],
    queryFn: () => listMyPrizeFine(storeId as string, 100),
    enabled: ready,
  });

  const filteredPrizeFine = allPrizeFine?.filter((pf) => {
    if (statusFilter === "all") return true;
    return pf.status === statusFilter;
  });

  const handleDispute = (eventId: string) => {
    setSelectedEventId(eventId);
    setDialogOpen(true);
  };

  const handleDisputeSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["my-prize-fine", storeId] });
  };

  const statusOptions = [
    { value: "all", label: t("common.all") },
    { value: "pending", label: t("my_fines.status_pending") },
    { value: "paid", label: t("my_fines.status_paid") },
    { value: "cancelled", label: t("my_fines.status_cancelled") },
    { value: "disputed", label: t("my_fines.status_disputed") },
  ];

  if (!ready) {
    return <ErrorState message={t("common.error_generic")} />;
  }

  if (isLoading) {
    return <LoadingState>{t("common.loading")}</LoadingState>;
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold font-display text-brand-ink">
        {t("my_fines.title")}
      </h1>

      <Card>
        <CardTitle>{t("my_fines.filter_title")}</CardTitle>
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label htmlFor="status-filter" className="block text-sm font-medium">
              {t("my_fines.status_label")}
            </label>
            <Select
              id="status-filter"
              value={statusFilter}
              onChange={(val) => setStatusFilter(val as StatusFilter)}
              options={statusOptions}
              className="mt-1"
            />
          </div>
          <div className="text-sm text-gray-600">
            {t("my_fines.count", { count: filteredPrizeFine?.length ?? 0 })}
          </div>
        </div>
      </Card>

      {!filteredPrizeFine || filteredPrizeFine.length === 0 ? (
        <EmptyState>{t("common.empty")}</EmptyState>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-brand-cream-light">
                <tr>
                  <th className="text-left px-4 py-2">
                    {t("my_fines.date_col")}
                  </th>
                  <th className="text-left px-4 py-2">
                    {t("my_fines.kind_col")}
                  </th>
                  <th className="text-right px-4 py-2">
                    {t("my_fines.amount_col")}
                  </th>
                  <th className="text-left px-4 py-2">
                    {t("my_fines.reason_col")}
                  </th>
                  <th className="text-left px-4 py-2">
                    {t("my_fines.status_col")}
                  </th>
                  <th className="text-center px-4 py-2">
                    {t("my_fines.action_col")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredPrizeFine.map((pf) => (
                  <tr
                    key={pf.id}
                    className="border-b hover:bg-brand-cream-light"
                  >
                    <td className="px-4 py-2">
                      {new Date(pf.created_at).toLocaleDateString("sv-SE")}
                    </td>
                    <td className="px-4 py-2">
                      {pf.kind === "prize"
                        ? t("payroll.kind_prize")
                        : t("payroll.kind_fine")}
                    </td>
                    <td
                      className={`text-right px-4 py-2 ${
                        pf.kind === "prize"
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {pf.kind === "prize" ? "+" : "-"}
                      {formatVnd(pf.amount_cents)}
                    </td>
                    <td className="px-4 py-2">
                      {pf.reason || t("common.no_reason")}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${
                          pf.status === "pending"
                            ? "bg-yellow-100 text-yellow-800"
                            : pf.status === "disputed"
                              ? "bg-blue-100 text-blue-800"
                              : pf.status === "paid"
                                ? "bg-green-100 text-green-800"
                                : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {pf.status === "pending"
                          ? t("my_fines.status_pending")
                          : pf.status === "disputed"
                            ? t("my_fines.status_disputed")
                            : pf.status === "paid"
                              ? t("my_fines.status_paid")
                              : t("my_fines.status_cancelled")}
                      </span>
                    </td>
                    <td className="text-center px-4 py-2">
                      {pf.status === "pending" ? (
                        <Button
                          onClick={() => handleDispute(pf.id)}
                          variant="secondary"
                          className="text-xs"
                        >
                          {t("my_fines.dispute_button")}
                        </Button>
                      ) : (
                        <span className="text-xs text-gray-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {selectedEventId && (
        <DisputePrizeFineDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          eventId={selectedEventId}
          onSuccess={handleDisputeSuccess}
        />
      )}
    </div>
  );
}
