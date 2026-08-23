import { useQuery } from "@tanstack/react-query";
import { useT } from "../../lib/i18n";
import { formatVnd } from "../../lib/money";
import { listMyPrizeFine, listStorePrizeFine } from "../../services/points";
import { Card, CardTitle } from "../ui/Card";
import { EmptyState, LoadingState } from "../ui/EmptyState";

interface UnpaidPrizeFineCardProps {
  storeId: string;
  isOwner: boolean;
  isEmployee?: boolean;
}

export function UnpaidPrizeFineCard({
  storeId,
  isEmployee,
}: UnpaidPrizeFineCardProps) {
  const t = useT();

  const { data, isLoading } = useQuery({
    queryKey: [isEmployee ? "my-fines-unpaid" : "store-fines-unpaid", storeId],
    queryFn: () =>
      isEmployee
        ? listMyPrizeFine(storeId, 100).then((items) =>
            items.filter((f) => f.status === "pending"),
          )
        : listStorePrizeFine(storeId, { status: "pending" }),
  });

  if (isLoading) {
    return (
      <Card>
        <CardTitle>{t("dashboard.unpaid_fines")}</CardTitle>
        <LoadingState>{t("common.loading")}</LoadingState>
      </Card>
    );
  }

  const items = data ?? [];
  const totalFines = items
    .filter((i) => i.kind === "fine")
    .reduce((sum, f) => sum + (f.amount_cents || 0), 0);
  const totalPrizes = items
    .filter((i) => i.kind === "prize")
    .reduce((sum, p) => sum + (p.amount_cents || 0), 0);

  return (
    <Card>
      <CardTitle>{t("dashboard.unpaid_fines")}</CardTitle>
      {items.length === 0 ? (
        <EmptyState>{t("dashboard.no_pending_fines")}</EmptyState>
      ) : (
        <div className="mt-4 space-y-2">
          {totalFines > 0 && (
            <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-2">
              <span className="text-slate-600">{t("dashboard.fines")}</span>
              <span className="font-semibold text-red-600">
                {formatVnd(totalFines)}
              </span>
            </div>
          )}
          {totalPrizes > 0 && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-600">{t("dashboard.prizes")}</span>
              <span className="font-semibold text-green-600">
                {formatVnd(totalPrizes)}
              </span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
