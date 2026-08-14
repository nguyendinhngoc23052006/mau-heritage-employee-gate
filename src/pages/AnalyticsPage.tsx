import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Card, CardTitle } from "../components/ui/Card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/ui/EmptyState";
import { isManagerRole, useRoleOn } from "../hooks/useMemberships";
import { useT } from "../lib/i18n";
import { formatVnd } from "../lib/money";
import { getSupabase } from "../lib/supabaseClient";

export function AnalyticsPage() {
  const t = useT();
  const { storeId } = useParams<{ storeId: string }>();
  const role = useRoleOn(storeId);
  const isManager = isManagerRole(role);

  if (!storeId) {
    return (
      <ErrorState message={t("common.error", { message: "Store not found" })} />
    );
  }

  if (!isManager) {
    return (
      <ErrorState message={t("common.error", { message: "Access denied" })} />
    );
  }

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold">{t("analytics.title")}</h1>

      <div className="space-y-6">
        <WeeklyTillVariance storeId={storeId} />
        <MissedShiftsSection />
        <LateArrivalRateSection />
      </div>
    </div>
  );
}

function WeeklyTillVariance({ storeId }: { storeId: string }) {
  const t = useT();
  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics", "till_variance", storeId],
    queryFn: async () => {
      const supabase = getSupabase();
      const weeks: { week: string; variance: number }[] = [];

      const now = new Date();
      for (let i = 11; i >= 0; i--) {
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - (weekStart.getDay() + i * 7));
        weekStart.setHours(0, 0, 0, 0);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const { data: reports, error } = await supabase
          .from("sales_reports")
          .select("expected_cents, cash_cents, card_cents, qr_cents")
          .eq("store_id", storeId)
          .eq("status", "approved")
          .gte("submitted_at", weekStart.toISOString())
          .lt("submitted_at", weekEnd.toISOString());

        if (error) throw error;

        const variance = (reports ?? []).reduce((sum, r: any) => {
          const actual = r.cash_cents + r.card_cents + r.qr_cents;
          const expected = r.expected_cents ?? actual;
          return sum + (actual - expected);
        }, 0);

        weeks.push({
          week: `W${String(i + 1).padStart(2, "0")}`,
          variance,
        });
      }

      return weeks;
    },
  });

  if (error) {
    return (
      <Card>
        <CardTitle>{t("analytics.till_variance")}</CardTitle>
        <ErrorState message={t("common.error", { message: String(error) })} />
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardTitle>{t("analytics.till_variance")}</CardTitle>
        <LoadingState>{t("common.loading")}</LoadingState>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>{t("analytics.till_variance")}</CardTitle>
      {!data || data.length === 0 ? (
        <EmptyState>{t("common.empty")}</EmptyState>
      ) : (
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="px-4 py-2 text-left text-slate-600">Week</th>
                <th className="px-4 py-2 text-right text-slate-600">
                  Variance
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr
                  key={row.week}
                  className="border-b border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-4 py-2 text-slate-900">{row.week}</td>
                  <td className="px-4 py-2 text-right text-slate-600">
                    {formatVnd(row.variance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function MissedShiftsSection() {
  const t = useT();

  return (
    <Card>
      <CardTitle>{t("analytics.missed_shifts")}</CardTitle>
      <EmptyState>
        Not yet available
        {/* TODO: implement missed-shifts aggregate */}
      </EmptyState>
    </Card>
  );
}

function LateArrivalRateSection() {
  const t = useT();

  return (
    <Card>
      <CardTitle>{t("analytics.late_rate")}</CardTitle>
      <EmptyState>
        Not yet available
        {/* TODO: implement late-arrival-rate aggregate */}
      </EmptyState>
    </Card>
  );
}
