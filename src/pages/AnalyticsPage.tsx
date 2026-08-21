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
      <ErrorState
        message={t("common.error", { message: t("analytics.store_not_found") })}
      />
    );
  }

  if (!isManager) {
    return (
      <ErrorState
        message={t("common.error", { message: t("analytics.access_denied") })}
      />
    );
  }

  return (
    <div className="p-6 bg-brand-cream-light">
      <h1 className="mb-6 text-2xl font-display text-brand-ink font-bold">
        {t("analytics.title")}
      </h1>

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
          .select("variance_cents")
          .eq("store_id", storeId)
          .neq("status", "disputed")
          .gte("submitted_at", weekStart.toISOString())
          .lt("submitted_at", weekEnd.toISOString());

        if (error) throw error;

        const variance = (reports ?? []).reduce(
          (sum, r: { variance_cents: number | null }) => {
            return sum + (r.variance_cents ?? 0);
          },
          0,
        );

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
              <tr className="border-b border-brand-hairline">
                <th className="px-4 py-2 text-left text-brand-muted">
                  {t("analytics.week_col")}
                </th>
                <th className="px-4 py-2 text-right text-brand-muted">
                  {t("analytics.variance_col")}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr
                  key={row.week}
                  className="border-b border-brand-hairline hover:bg-brand-cream"
                >
                  <td className="px-4 py-2 text-brand-ink">{row.week}</td>
                  <td className="px-4 py-2 text-right text-brand-muted">
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

function ComingSoonNotice() {
  const t = useT();

  return (
    <EmptyState>
      <span className="inline-block rounded px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800">
        {t("analytics.coming_soon_badge")}
      </span>
      <p className="mt-2">{t("analytics.coming_soon_body")}</p>
    </EmptyState>
  );
}

function MissedShiftsSection() {
  const t = useT();

  return (
    <Card>
      <CardTitle>{t("analytics.missed_shifts")}</CardTitle>
      {/* TODO: implement missed-shifts aggregate */}
      <ComingSoonNotice />
    </Card>
  );
}

function LateArrivalRateSection() {
  const t = useT();

  return (
    <Card>
      <CardTitle>{t("analytics.late_rate")}</CardTitle>
      {/* TODO: implement late-arrival-rate aggregate */}
      <ComingSoonNotice />
    </Card>
  );
}
