import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useT } from "../../lib/i18n";
import { formatVnd } from "../../lib/money";
import { listMembers } from "../../services/members";
import {
  listStorePrizeFine,
  markPrizeFinePaid,
  resolvePrizeFineDispute,
} from "../../services/points";
import type { PrizeFineStatus } from "../../types/database";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { EmptyState, ErrorState, LoadingState } from "../ui/EmptyState";
import { Select, type SelectOption } from "../ui/Select";
import { CancelPrizeFineDialog } from "./CancelPrizeFineDialog";

interface StorePrizeFineTableProps {
  storeId: string;
}

export function StorePrizeFineTable({ storeId }: StorePrizeFineTableProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<PrizeFineStatus | "all">(
    "pending",
  );
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelEventId, setCancelEventId] = useState("");
  const [resolveError, setResolveError] = useState<string | null>(null);

  const prizeFineQuery = useQuery({
    queryKey: ["store-prize-fine", storeId, statusFilter],
    queryFn: () =>
      listStorePrizeFine(
        storeId,
        statusFilter === "all" ? undefined : { status: statusFilter },
      ),
    enabled: !!storeId,
  });

  const membersQuery = useQuery({
    queryKey: ["members", storeId],
    queryFn: () => listMembers(storeId),
    enabled: !!storeId,
  });

  const markPaidMutation = useMutation({
    mutationFn: (eventId: string) => markPrizeFinePaid(eventId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["store-prize-fine", storeId],
      });
      queryClient.invalidateQueries({ queryKey: ["payroll", storeId] });
    },
    onError: (err: unknown) => {
      setResolveError(err instanceof Error ? err.message : String(err));
    },
  });

  const resolveMutation = useMutation({
    mutationFn: ({
      eventId,
      decision,
    }: {
      eventId: string;
      decision: "uphold" | "reverse";
    }) => resolvePrizeFineDispute({ eventId, decision }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["store-prize-fine", storeId],
      });
      queryClient.invalidateQueries({ queryKey: ["payroll", storeId] });
    },
    onError: (err: unknown) => {
      setResolveError(err instanceof Error ? err.message : String(err));
    },
  });

  const memberNameMap = new Map(
    (membersQuery.data || []).map((m) => [
      m.user_id,
      m.profile?.display_name || m.user_id?.substring(0, 8) || "—",
    ]),
  );

  const statusOptions: SelectOption<PrizeFineStatus | "all">[] = [
    { value: "all", label: t("payroll.filter_all") },
    { value: "pending", label: t("payroll.filter_pending") },
    { value: "paid", label: t("payroll.filter_paid") },
    { value: "cancelled", label: t("payroll.filter_cancelled") },
    { value: "disputed", label: t("payroll.filter_disputed") },
  ];

  if (prizeFineQuery.isLoading) {
    return <LoadingState>{t("common.loading")}</LoadingState>;
  }

  if (prizeFineQuery.error) {
    return (
      <ErrorState
        message={
          prizeFineQuery.error instanceof Error
            ? prizeFineQuery.error.message
            : "Error loading prize/fine events"
        }
      />
    );
  }

  const events = prizeFineQuery.data || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-brand-ink">
          {t("payroll.prize_fine_table_title")}
        </h2>
        <Select
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as PrizeFineStatus | "all")}
          options={statusOptions}
          className="w-40"
        />
      </div>

      {resolveError && <Alert variant="error">{resolveError}</Alert>}

      {events.length === 0 ? (
        <EmptyState>{t("common.empty")}</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-brand-cream-light">
              <tr>
                <th className="text-left px-4 py-2">
                  {t("payroll.employee_col")}
                </th>
                <th className="text-right px-4 py-2">
                  {t("payroll.kind_col")}
                </th>
                <th className="text-right px-4 py-2">
                  {t("payroll.amount_col")}
                </th>
                <th className="text-left px-4 py-2">
                  {t("payroll.reason_col")}
                </th>
                <th className="text-left px-4 py-2">
                  {t("payroll.status_col")}
                </th>
                <th className="text-left px-4 py-2">
                  {t("payroll.created_col")}
                </th>
                <th className="text-center px-4 py-2">
                  {t("payroll.actions_col")}
                </th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const isPrize = event.kind === "prize";
                const createdDate = new Date(
                  event.created_at,
                ).toLocaleDateString("sv-SE");

                return (
                  <tr
                    key={event.id}
                    className="border-b hover:bg-brand-cream-light"
                  >
                    <td className="px-4 py-2">
                      {memberNameMap.get(event.user_id) || event.user_id}
                    </td>
                    <td className="text-right px-4 py-2">
                      <span
                        className={isPrize ? "text-green-600" : "text-red-600"}
                      >
                        {isPrize
                          ? t("payroll.kind_prize")
                          : t("payroll.kind_fine")}
                      </span>
                    </td>
                    <td className="text-right px-4 py-2">
                      {formatVnd(event.amount_cents)}
                    </td>
                    <td className="px-4 py-2 text-xs">{event.reason || "—"}</td>
                    <td className="px-4 py-2">
                      <span className="text-xs px-2 py-1 rounded bg-brand-cream-light">
                        {t(`payroll.status_${event.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs">{createdDate}</td>
                    <td className="px-4 py-2 text-center">
                      {event.status === "pending" && (
                        <div className="flex gap-1 justify-center">
                          <Button
                            onClick={() => markPaidMutation.mutate(event.id)}
                            disabled={markPaidMutation.isPending}
                            className="text-xs"
                          >
                            {t("payroll.mark_paid")}
                          </Button>
                          <Button
                            onClick={() => {
                              setCancelEventId(event.id);
                              setCancelDialogOpen(true);
                            }}
                            variant="danger"
                            className="text-xs"
                          >
                            {t("payroll.cancel")}
                          </Button>
                        </div>
                      )}
                      {event.status === "disputed" && (
                        <div className="flex gap-1 justify-center">
                          <Button
                            onClick={() =>
                              resolveMutation.mutate({
                                eventId: event.id,
                                decision: "uphold",
                              })
                            }
                            disabled={resolveMutation.isPending}
                            className="text-xs"
                          >
                            {t("payroll.uphold")}
                          </Button>
                          <Button
                            onClick={() =>
                              resolveMutation.mutate({
                                eventId: event.id,
                                decision: "reverse",
                              })
                            }
                            variant="secondary"
                            disabled={resolveMutation.isPending}
                            className="text-xs"
                          >
                            {t("payroll.reverse")}
                          </Button>
                        </div>
                      )}
                      {(event.status === "paid" ||
                        event.status === "cancelled") && (
                        <span className="text-xs text-brand-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CancelPrizeFineDialog
        open={cancelDialogOpen}
        onClose={() => setCancelDialogOpen(false)}
        eventId={cancelEventId}
        storeId={storeId}
        onSuccess={() => {
          setCancelDialogOpen(false);
        }}
      />
    </div>
  );
}
