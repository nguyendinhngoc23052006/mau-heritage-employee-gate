import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { ClockCorrectionsQueue } from "../components/clock/ClockCorrectionsQueue";
import { Card, CardTitle } from "../components/ui/Card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/ui/EmptyState";
import { Select } from "../components/ui/Select";
import { isManagerRole, useRoleOn } from "../hooks/useMemberships";
import { useT } from "../lib/i18n";
import { getSupabase } from "../lib/supabaseClient";
import type {
  ClockCorrectionRequest,
  ClockCorrectionStatus,
} from "../types/database";

function ClockCorrectionsPage() {
  const t = useT();
  const { storeId } = useParams<{ storeId: string }>();
  const role = useRoleOn(storeId);
  const isManager = isManagerRole(role);
  const [statusFilter, setStatusFilter] = useState<
    ClockCorrectionStatus | "all"
  >("pending");

  const {
    data: allRequests,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["clock", "corrections", "all", storeId],
    enabled: isManager && Boolean(storeId),
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error: err } = await supabase
        .from("clock_correction_requests")
        .select("*")
        .eq("store_id", storeId as string)
        .order("created_at", { ascending: false });
      if (err) throw err;
      return (data ?? []) as ClockCorrectionRequest[];
    },
  });

  if (!isManager) {
    return (
      <div className="p-6">
        <ErrorState message={t("common.access_denied")} />
      </div>
    );
  }

  if (!storeId) {
    return (
      <div className="p-6">
        <ErrorState
          message={t("common.error", { message: "Store not found" })}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <LoadingState>{t("common.loading")}</LoadingState>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <ErrorState
          message={t("common.error", { message: "Failed to load corrections" })}
        />
      </div>
    );
  }

  const filteredRequests =
    statusFilter === "all"
      ? allRequests
      : allRequests?.filter((r) => r.status === statusFilter);

  const resolvedRequests = allRequests?.filter((r) => r.status !== "pending");

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold font-display text-brand-ink">
        {t("clock.corrections_page_title")}
      </h1>

      <div className="mb-6">
        <ClockCorrectionsQueue storeId={storeId} />
      </div>

      <Card>
        <CardTitle>{t("clock.corrections_history_title")}</CardTitle>

        <div className="mt-4 mb-4 flex items-center gap-2">
          <span className="text-sm text-slate-600">{t("common.filter")}:</span>
          <Select
            value={statusFilter}
            onChange={(val) =>
              setStatusFilter(val as ClockCorrectionStatus | "all")
            }
            options={[
              { value: "all", label: t("clock.filter_all") },
              { value: "approved", label: t("clock.filter_approved") },
              { value: "denied", label: t("clock.filter_denied") },
            ]}
            ariaLabel={t("clock.corrections_filter")}
            className="w-40"
          />
        </div>

        {!resolvedRequests || resolvedRequests.length === 0 ? (
          <EmptyState>{t("clock.corrections_history_empty")}</EmptyState>
        ) : !filteredRequests || filteredRequests.length === 0 ? (
          <EmptyState>{t("common.no_results")}</EmptyState>
        ) : (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-2 text-left text-slate-600">
                    {t("common.date")}
                  </th>
                  <th className="px-4 py-2 text-left text-slate-600">
                    {t("clock.correction_kind_label")}
                  </th>
                  <th className="px-4 py-2 text-left text-slate-600">
                    {t("clock.correction_reason_label")}
                  </th>
                  <th className="px-4 py-2 text-left text-slate-600">
                    {t("common.status")}
                  </th>
                  <th className="px-4 py-2 text-left text-slate-600">
                    {t("common.review_note")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests?.map((req) => (
                  <tr
                    key={req.id}
                    className="border-b border-slate-100 hover:bg-brand-cream-light"
                  >
                    <td className="px-4 py-2 text-slate-900">
                      {format(new Date(req.created_at), "yyyy-MM-dd HH:mm")}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {req.kind === "missing_in"
                        ? t("clock.correction_missing_in")
                        : req.kind === "missing_out"
                          ? t("clock.correction_missing_out")
                          : t("clock.correction_wrong_time")}
                    </td>
                    <td className="px-4 py-2 text-slate-600 max-w-xs truncate">
                      {req.reason}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-block rounded px-2 py-1 text-xs font-medium ${
                          req.status === "approved"
                            ? "bg-green-100 text-green-800"
                            : req.status === "denied"
                              ? "bg-red-100 text-red-800"
                              : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {req.status === "approved"
                          ? t("clock.status_approved")
                          : req.status === "denied"
                            ? t("clock.status_denied")
                            : t("clock.status_pending")}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-600 max-w-xs truncate">
                      {req.review_note || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export default ClockCorrectionsPage;
