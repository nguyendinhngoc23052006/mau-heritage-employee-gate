import { useQuery, useQueryClient } from "@tanstack/react-query";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { useMemo, useState } from "react";
import { IssuePrizeFineModal } from "../components/payroll/IssuePrizeFineModal";
import { StorePrizeFineTable } from "../components/payroll/StorePrizeFineTable";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/ui/EmptyState";
import { isManagerRole, useRoleOn } from "../hooks/useMemberships";
import { downloadCsv, toCsv } from "../lib/csv";
import { useT } from "../lib/i18n";
import { formatVnd } from "../lib/money";
import { computePayroll } from "../services/payroll";
import { listStorePrizeFine } from "../services/points";

interface PayrollPageProps {
  storeId: string;
}

export function PayrollPage({ storeId }: PayrollPageProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const role = useRoleOn(storeId);
  const isManager = isManagerRole(role);
  const [date, setDate] = useState(() => new Date());
  const [issuePrizeFineOpen, setIssuePrizeFineOpen] = useState(false);

  const startDate = startOfMonth(date);
  const endDate = endOfMonth(date);
  // Payroll is bucketed by Asia/Ho_Chi_Minh calendar dates; anchor the range
  // to +07:00 boundaries so a browser in another timezone doesn't clip/leak
  // hours at month edges.
  const fromIso = `${format(startDate, "yyyy-MM-dd")}T00:00:00+07:00`;
  const toIso = `${format(endDate, "yyyy-MM-dd")}T23:59:59.999+07:00`;

  const {
    data: payroll,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["payroll", storeId, fromIso, toIso],
    queryFn: () => computePayroll(storeId, fromIso, toIso),
    enabled: isManager,
  });

  const prizeFineQuery = useQuery({
    queryKey: ["store-prize-fine-csv", storeId, fromIso, toIso],
    queryFn: () => listStorePrizeFine(storeId, { from: fromIso, to: toIso }),
    enabled: isManager && !!storeId,
  });

  const handleDownloadCsv = async () => {
    if (!payroll) return;

    const rows: Array<Record<string, string>> = [];
    const allPrizeFineEvents = prizeFineQuery.data || [];

    for (const row of payroll) {
      // Aggregate row
      rows.push({
        Name: row.display_name || row.user_id,
        Date: "",
        Multiplier: "",
        Hours: (row.minutes_worked / 60).toFixed(2),
        "Hourly rate (VND)": row.hourly_rate_cents
          ? row.hourly_rate_cents.toString()
          : "0",
        "Wages (VND)": row.wages_cents.toString(),
        "Prizes (VND)": row.prizes_cents.toString(),
        "Fines (VND)": row.fines_cents.toString(),
        "Total (VND)": row.total_cents.toString(),
        Status: "",
        Reason: "",
        "Paid at": "",
        "Paid by": "",
      });

      // Daily breakdown rows
      for (const day of row.daily_breakdown) {
        rows.push({
          Name: "",
          Date: day.date,
          Multiplier: `×${day.multiplier.toFixed(1)}`,
          Hours: (day.minutes / 60).toFixed(2),
          "Hourly rate (VND)": "",
          "Wages (VND)": day.wages.toString(),
          "Prizes (VND)": "",
          "Fines (VND)": "",
          "Total (VND)": "",
          Status: "",
          Reason: "",
          "Paid at": "",
          "Paid by": "",
        });
      }

      // Prize/fine events for this user (query already filters by date range)
      const userEvents = allPrizeFineEvents.filter(
        (pf) =>
          pf.user_id === row.user_id &&
          (pf.status === "pending" || pf.status === "disputed"),
      );

      for (const pf of userEvents) {
        const paidAtStr = pf.paid_at
          ? new Date(pf.paid_at).toLocaleDateString("sv-SE")
          : "";
        rows.push({
          Name: "",
          Date: new Date(pf.created_at).toLocaleDateString("sv-SE"),
          Multiplier: "",
          Hours: "",
          "Hourly rate (VND)": "",
          "Wages (VND)": "",
          "Prizes (VND)": pf.kind === "prize" ? pf.amount_cents.toString() : "",
          "Fines (VND)": pf.kind === "fine" ? pf.amount_cents.toString() : "",
          "Total (VND)": "",
          Status: pf.status,
          Reason: pf.reason || "",
          "Paid at": paidAtStr,
          "Paid by": pf.paid_by || "",
        });
      }
    }

    const headers = [
      "Name",
      "Date",
      "Multiplier",
      "Hours",
      "Hourly rate (VND)",
      "Wages (VND)",
      "Prizes (VND)",
      "Fines (VND)",
      "Total (VND)",
      "Status",
      "Reason",
      "Paid at",
      "Paid by",
    ];
    const csv = toCsv(rows, headers);
    const filename = `payroll-${format(startDate, "yyyy-MM-dd")}-${format(endDate, "yyyy-MM-dd")}.csv`;
    downloadCsv(filename, csv);
  };

  const monthYear = format(date, "MMMM yyyy");

  const handlePrevMonth = () => {
    setDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  };

  const totalWages = useMemo(
    () => payroll?.reduce((sum, row) => sum + row.wages_cents, 0) ?? 0,
    [payroll],
  );
  const totalPrizes = useMemo(
    () => payroll?.reduce((sum, row) => sum + row.prizes_cents, 0) ?? 0,
    [payroll],
  );
  const totalFines = useMemo(
    () => payroll?.reduce((sum, row) => sum + row.fines_cents, 0) ?? 0,
    [payroll],
  );
  const grandTotal = useMemo(
    () => payroll?.reduce((sum, row) => sum + row.total_cents, 0) ?? 0,
    [payroll],
  );

  if (!isManager) {
    return <ErrorState message={t("analytics.access_denied")} />;
  }

  if (isLoading) {
    return <LoadingState>{t("common.loading")}</LoadingState>;
  }

  if (error) {
    return (
      <ErrorState
        message={
          error instanceof Error ? error.message : "Error loading payroll"
        }
      />
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold font-display text-brand-ink">
          {t("payroll.title")}
        </h1>
      </div>

      <Card>
        <CardTitle>{t("payroll.period")}</CardTitle>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <Button onClick={handlePrevMonth} variant="secondary">
              {t("payroll.prev_period")}
            </Button>
            <div className="text-lg font-semibold text-center flex-1">
              {monthYear}
            </div>
            <Button onClick={handleNextMonth} variant="secondary">
              {t("payroll.next_period")}
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => setIssuePrizeFineOpen(true)}
              variant="secondary"
            >
              {t("payroll.issue_prize_fine_button")}
            </Button>
            <Button
              onClick={handleDownloadCsv}
              disabled={!payroll || payroll.length === 0}
            >
              {t("payroll.download_csv")}
            </Button>
          </div>
        </div>
      </Card>

      {!payroll || payroll.length === 0 ? (
        <EmptyState>{t("common.empty")}</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-brand-cream-light">
              <tr>
                <th className="text-left px-4 py-2">{t("payroll.name_col")}</th>
                <th className="text-right px-4 py-2">{t("payroll.hours")}</th>
                <th className="text-right px-4 py-2">
                  {t("payroll.multiplier_col")}
                </th>
                <th className="text-right px-4 py-2">
                  {t("payroll.rate_col")}
                </th>
                <th className="text-right px-4 py-2">{t("payroll.wages")}</th>
                <th className="text-right px-4 py-2">{t("payroll.prizes")}</th>
                <th className="text-right px-4 py-2">{t("payroll.fines")}</th>
                <th className="text-right px-4 py-2">{t("payroll.total")}</th>
              </tr>
            </thead>
            <tbody>
              {payroll.map((row) => {
                return (
                  <tr
                    key={row.user_id}
                    className="border-b hover:bg-brand-cream-light"
                  >
                    <td className="px-4 py-2">
                      {row.display_name || row.user_id}
                    </td>
                    <td className="text-right px-4 py-2">
                      {(row.minutes_worked / 60).toFixed(1)}
                    </td>
                    <td className="text-right px-4 py-2">
                      {row.daily_breakdown.length === 0
                        ? "×1"
                        : `×${Math.max(1, ...row.daily_breakdown.map((d) => d.multiplier)).toFixed(1)}`}
                    </td>
                    <td className="text-right px-4 py-2">
                      {row.hourly_rate_cents
                        ? formatVnd(row.hourly_rate_cents)
                        : "—"}
                    </td>
                    <td className="text-right px-4 py-2">
                      {formatVnd(row.wages_cents)}
                    </td>
                    <td className="text-right px-4 py-2 text-green-600">
                      {formatVnd(row.prizes_cents)}
                    </td>
                    <td className="text-right px-4 py-2 text-red-600">
                      {formatVnd(row.fines_cents)}
                    </td>
                    <td className="text-right px-4 py-2 font-semibold">
                      {formatVnd(row.total_cents)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t font-semibold bg-brand-cream-light">
              <tr>
                <td colSpan={3} className="px-4 py-2">
                  {t("payroll.total_col")}
                </td>
                <td className="px-4 py-2" />
                <td className="text-right px-4 py-2">
                  {formatVnd(totalWages)}
                </td>
                <td className="text-right px-4 py-2 text-green-600">
                  {formatVnd(totalPrizes)}
                </td>
                <td className="text-right px-4 py-2 text-red-600">
                  {formatVnd(totalFines)}
                </td>
                <td className="text-right px-4 py-2">
                  {formatVnd(grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <StorePrizeFineTable storeId={storeId} />

      <IssuePrizeFineModal
        open={issuePrizeFineOpen}
        onClose={() => setIssuePrizeFineOpen(false)}
        storeId={storeId}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["payroll", storeId] });
        }}
      />
    </div>
  );
}
