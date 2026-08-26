import { useQuery } from "@tanstack/react-query";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/ui/EmptyState";
import { useSession } from "../hooks/useSession";
import { useT } from "../lib/i18n";
import { formatVnd } from "../lib/money";
import { getSupabase } from "../lib/supabaseClient";
import { computePayroll } from "../services/payroll";
import { listMyPrizeFine } from "../services/points";
import type { RateHistory } from "../types/database";

export function MyPayPage() {
  const t = useT();
  const { user } = useSession();
  const { storeId } = useParams<{ storeId: string }>();
  const [date, setDate] = useState(() => new Date());

  const startDate = startOfMonth(date);
  const endDate = endOfMonth(date);
  const fromIso = `${format(startDate, "yyyy-MM-dd")}T00:00:00+07:00`;
  const toIso = `${format(endDate, "yyyy-MM-dd")}T23:59:59.999+07:00`;

  const ready = Boolean(user?.id && storeId);

  const { data: payroll, isLoading: payrollLoading } = useQuery({
    queryKey: ["my-payroll", storeId, fromIso, toIso],
    queryFn: () =>
      computePayroll(storeId as string, fromIso, toIso).then((rows) => {
        const myRow = rows.find((r) => r.user_id === user?.id);
        return myRow;
      }),
    enabled: ready,
  });

  const { data: myPrizeFine, isLoading: prizeFineLoading } = useQuery({
    queryKey: ["my-prize-fine", storeId],
    queryFn: () => listMyPrizeFine(storeId as string, 100),
    enabled: ready,
  });

  const { data: rateHistory, isLoading: rateHistoryLoading } = useQuery({
    queryKey: ["my-rate-history", storeId],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("rate_history")
        .select("*")
        .eq("user_id", user?.id)
        .eq("store_id", storeId)
        .order("effective_from", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RateHistory[];
    },
    enabled: ready,
  });

  const monthYear = format(date, "MMMM yyyy");

  const handlePrevMonth = () => {
    setDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  };

  const prizeFineThisMonth = useMemo(() => {
    if (!myPrizeFine) return { prizes: 0, fines: 0 };
    const filtered = myPrizeFine.filter(
      (pf) =>
        new Date(pf.created_at) >= startDate &&
        new Date(pf.created_at) <= endDate,
    );
    let prizes = 0;
    let fines = 0;
    for (const pf of filtered) {
      if (pf.status === "pending" || pf.status === "disputed") {
        if (pf.kind === "prize") prizes += pf.amount_cents;
        else fines += pf.amount_cents;
      }
    }
    return { prizes, fines };
  }, [myPrizeFine, startDate, endDate]);

  const isLoading = payrollLoading || prizeFineLoading || rateHistoryLoading;

  if (!ready) {
    return <ErrorState message={t("common.error_generic")} />;
  }

  if (isLoading) {
    return <LoadingState>{t("common.loading")}</LoadingState>;
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold font-display text-brand-ink">
        {t("my_pay.title")}
      </h1>

      <Card>
        <CardTitle>{t("my_pay.period")}</CardTitle>
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
        </div>
      </Card>

      {payroll ? (
        <Card>
          <CardTitle>{t("my_pay.this_month_title")}</CardTitle>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="p-3 bg-blue-50 rounded border border-blue-200">
                <div className="text-xs font-semibold text-blue-700">
                  {t("my_pay.hours_label")}
                </div>
                <div className="text-lg font-bold text-blue-900">
                  {(payroll.minutes_worked / 60).toFixed(1)} h
                </div>
              </div>
              <div className="p-3 bg-green-50 rounded border border-green-200">
                <div className="text-xs font-semibold text-green-700">
                  {t("my_pay.wages_label")}
                </div>
                <div className="text-lg font-bold text-green-900">
                  {formatVnd(payroll.wages_cents)}
                </div>
              </div>
              <div className="p-3 bg-green-50 rounded border border-green-200">
                <div className="text-xs font-semibold text-green-700">
                  {t("my_pay.prizes_label")}
                </div>
                <div className="text-lg font-bold text-green-900">
                  {formatVnd(prizeFineThisMonth.prizes)}
                </div>
              </div>
              <div className="p-3 bg-red-50 rounded border border-red-200">
                <div className="text-xs font-semibold text-red-700">
                  {t("my_pay.fines_label")}
                </div>
                <div className="text-lg font-bold text-red-900">
                  {formatVnd(prizeFineThisMonth.fines)}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-brand-cream-light">
                  <tr>
                    <th className="text-left px-4 py-2">
                      {t("my_pay.date_col")}
                    </th>
                    <th className="text-right px-4 py-2">
                      {t("my_pay.hours_col")}
                    </th>
                    <th className="text-right px-4 py-2">
                      {t("payroll.rate_col")}
                    </th>
                    <th className="text-right px-4 py-2">
                      {t("my_pay.wages_col")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {payroll.daily_breakdown.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-2 text-center">
                        {t("common.empty")}
                      </td>
                    </tr>
                  ) : (
                    payroll.daily_breakdown.map((day) => (
                      <tr
                        key={day.date}
                        className="border-b hover:bg-brand-cream-light"
                      >
                        <td className="px-4 py-2">{day.date}</td>
                        <td className="text-right px-4 py-2">
                          {(day.minutes / 60).toFixed(1)} h
                        </td>
                        <td className="text-right px-4 py-2">
                          {formatVnd(
                            Math.round(
                              (day.wages * 6000) /
                                (day.minutes * day.multiplier),
                            ),
                          )}
                        </td>
                        <td className="text-right px-4 py-2">
                          {formatVnd(day.wages)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      ) : (
        <EmptyState>{t("common.empty")}</EmptyState>
      )}

      {myPrizeFine && myPrizeFine.length > 0 && (
        <Card>
          <CardTitle>{t("my_pay.prizes_fines_title")}</CardTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-brand-cream-light">
                <tr>
                  <th className="text-left px-4 py-2">
                    {t("my_pay.created_date_col")}
                  </th>
                  <th className="text-left px-4 py-2">
                    {t("my_pay.kind_col")}
                  </th>
                  <th className="text-right px-4 py-2">
                    {t("my_pay.amount_col")}
                  </th>
                  <th className="text-left px-4 py-2">
                    {t("my_pay.reason_col")}
                  </th>
                  <th className="text-left px-4 py-2">
                    {t("my_pay.status_col")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {myPrizeFine.map((pf) => (
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
                        pf.kind === "prize" ? "text-green-600" : "text-red-600"
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
                        {t(`my_pay.status_${pf.status}`)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {rateHistory && rateHistory.length > 0 && (
        <Card>
          <CardTitle>{t("my_pay.rate_history_title")}</CardTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-brand-cream-light">
                <tr>
                  <th className="text-left px-4 py-2">
                    {t("my_pay.effective_from_col")}
                  </th>
                  <th className="text-left px-4 py-2">
                    {t("my_pay.effective_to_col")}
                  </th>
                  <th className="text-right px-4 py-2">
                    {t("my_pay.rate_col")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rateHistory.map((rate) => (
                  <tr
                    key={rate.id}
                    className="border-b hover:bg-brand-cream-light"
                  >
                    <td className="px-4 py-2">
                      {new Date(rate.effective_from).toLocaleDateString(
                        "sv-SE",
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {rate.effective_to
                        ? new Date(rate.effective_to).toLocaleDateString(
                            "sv-SE",
                          )
                        : t("my_pay.current")}
                    </td>
                    <td className="text-right px-4 py-2">
                      {formatVnd(rate.hourly_rate_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
