import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useT } from "../../lib/i18n";
import { listPendingSwaps } from "../../services/shifts";
import { Button } from "../ui/Button";
import { Card, CardTitle } from "../ui/Card";
import { LoadingState } from "../ui/EmptyState";

interface PendingSwapsCardProps {
  storeId: string;
}

export function PendingSwapsCard({ storeId }: PendingSwapsCardProps) {
  const t = useT();
  const navigate = useNavigate();

  const { data: swaps, isLoading } = useQuery({
    queryKey: ["pending-swaps", storeId],
    queryFn: () => listPendingSwaps(storeId),
  });

  if (isLoading) {
    return (
      <Card>
        <CardTitle>{t("dashboard.pending_swaps")}</CardTitle>
        <LoadingState>{t("common.loading")}</LoadingState>
      </Card>
    );
  }

  const count = swaps?.length ?? 0;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>{t("dashboard.pending_swaps")}</CardTitle>
        <div className="text-2xl font-semibold text-brand-ink">{count}</div>
      </div>
      {count === 0 ? (
        <div className="mt-2 text-sm text-slate-600">
          {t("dashboard.no_pending_swaps")}
        </div>
      ) : (
        <div className="mt-4">
          <Button
            variant="primary"
            onClick={() => navigate(`/store/${storeId}/schedule`)}
          >
            {t("dashboard.review_swaps")}
          </Button>
        </div>
      )}
    </Card>
  );
}
