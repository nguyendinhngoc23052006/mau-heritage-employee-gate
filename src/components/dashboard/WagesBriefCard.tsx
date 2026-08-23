import { useQuery } from "@tanstack/react-query";
import { useT } from "../../lib/i18n";
import { formatVnd } from "../../lib/money";
import { computePayroll } from "../../services/payroll";
import { Card, CardTitle } from "../ui/Card";
import { LoadingState } from "../ui/EmptyState";

interface WagesBriefCardProps {
  storeId: string;
}

export function WagesBriefCard({ storeId }: WagesBriefCardProps) {
  const t = useT();

  // Get today's date in Ho Chi Minh timezone
  const getTodayRange = () => {
    const now = new Date();
    const todayStr = now.toLocaleDateString("sv-SE", {
      timeZone: "Asia/Ho_Chi_Minh",
    });
    const todayStart = `${todayStr}T00:00:00+07:00`;
    const todayEnd = `${todayStr}T23:59:59.999+07:00`;
    return { todayStart, todayEnd };
  };

  // Get month-to-date range in Ho Chi Minh timezone
  const getMonthToDateRange = () => {
    const now = new Date();
    const todayStr = now.toLocaleDateString("sv-SE", {
      timeZone: "Asia/Ho_Chi_Minh",
    });
    const [year, month] = todayStr.split("-");
    const monthStart = `${year}-${month}-01T00:00:00+07:00`;
    const monthEnd = `${todayStr}T23:59:59.999+07:00`;
    return { monthStart, monthEnd };
  };

  // Today's payroll
  const { todayStart, todayEnd } = getTodayRange();
  const { data: todayPayroll, isLoading: todayLoading } = useQuery({
    queryKey: ["payroll", storeId, "today", todayStart, todayEnd],
    queryFn: () => computePayroll(storeId, todayStart, todayEnd),
  });

  // Month-to-date payroll
  const { monthStart, monthEnd } = getMonthToDateRange();
  const { data: mtdPayroll, isLoading: mtdLoading } = useQuery({
    queryKey: ["payroll", storeId, "mtd", monthStart, monthEnd],
    queryFn: () => computePayroll(storeId, monthStart, monthEnd),
  });

  if (todayLoading || mtdLoading) {
    return (
      <Card>
        <CardTitle>{t("dashboard.wage_costs")}</CardTitle>
        <LoadingState>{t("common.loading")}</LoadingState>
      </Card>
    );
  }

  const todayTotal = (todayPayroll ?? []).reduce(
    (sum, row) => sum + (row.wages_cents || 0),
    0,
  );
  const mtdTotal = (mtdPayroll ?? []).reduce(
    (sum, row) => sum + (row.wages_cents || 0),
    0,
  );

  return (
    <Card>
      <CardTitle>{t("dashboard.wage_costs")}</CardTitle>
      <div className="mt-4 space-y-3">
        <div className="flex justify-between items-center border-b border-slate-100 pb-2">
          <span className="text-sm text-slate-600">{t("dashboard.today")}</span>
          <span className="text-lg font-semibold text-brand-ink">
            {formatVnd(todayTotal)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-slate-600">
            {t("dashboard.month_to_date")}
          </span>
          <span className="text-lg font-semibold text-brand-ink">
            {formatVnd(mtdTotal)}
          </span>
        </div>
      </div>
    </Card>
  );
}
