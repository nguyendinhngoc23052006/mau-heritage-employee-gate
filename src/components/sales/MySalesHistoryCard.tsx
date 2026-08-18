import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useT } from "../../lib/i18n";
import { formatVnd } from "../../lib/money";
import { listMySales } from "../../services/sales";
import { Card, CardTitle } from "../ui/Card";
import { EmptyState, LoadingState } from "../ui/EmptyState";

export function MySalesHistoryCard({
  userId,
  storeId,
}: { userId: string; storeId: string }) {
  const t = useT();
  const { data, isLoading } = useQuery({
    queryKey: ["sales", "mine", userId, storeId],
    queryFn: () => listMySales(userId, storeId),
  });

  const rows = (data ?? []).slice(0, 30);

  return (
    <Card>
      <CardTitle>{t("sales.my_history_title")}</CardTitle>
      {isLoading ? (
        <LoadingState>{t("common.loading")}</LoadingState>
      ) : rows.length === 0 ? (
        <EmptyState>{t("common.empty")}</EmptyState>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const total = r.cash_cents + r.card_cents + r.qr_cents;
            const pillClass =
              r.status === "approved"
                ? "bg-green-100 text-green-800"
                : r.status === "disputed"
                  ? "bg-red-100 text-red-800"
                  : "bg-amber-100 text-amber-800";
            return (
              <li
                key={r.id}
                className="border-t border-slate-200 pt-2 first:border-0 first:pt-0"
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{formatVnd(total)}</span>
                  <span className="text-xs text-slate-500">
                    {format(new Date(r.submitted_at), "yyyy-MM-dd HH:mm")}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${pillClass}`}
                  >
                    {t(`sales.status_${r.status}`)}
                  </span>
                  {r.variance_cents !== 0 && (
                    <span className="text-xs text-yellow-700">
                      {t("sales.variance", {
                        amount: formatVnd(r.variance_cents),
                      })}
                    </span>
                  )}
                </div>
                {r.dispute_reason && (
                  <div className="mt-1 text-xs text-red-700">
                    {t("sales.dispute_reason")}: {r.dispute_reason}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
