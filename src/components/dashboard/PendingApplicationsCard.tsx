import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useT } from "../../lib/i18n";
import { listPendingApplications } from "../../services/applications";
import { Button } from "../ui/Button";
import { Card, CardTitle } from "../ui/Card";
import { LoadingState } from "../ui/EmptyState";

interface PendingApplicationsCardProps {
  storeId: string;
}

export function PendingApplicationsCard({
  storeId,
}: PendingApplicationsCardProps) {
  const t = useT();
  const navigate = useNavigate();

  const { data: applications, isLoading } = useQuery({
    queryKey: ["pending-applications", storeId],
    queryFn: () => listPendingApplications(storeId),
  });

  if (isLoading) {
    return (
      <Card>
        <CardTitle>{t("dashboard.pending_applications_card")}</CardTitle>
        <LoadingState>{t("common.loading")}</LoadingState>
      </Card>
    );
  }

  const count = applications?.length ?? 0;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>{t("dashboard.pending_applications_card")}</CardTitle>
        <div className="text-2xl font-semibold text-brand-ink">{count}</div>
      </div>
      {count === 0 ? (
        <div className="mt-2 text-sm text-slate-600">
          {t("dashboard.no_pending_applications")}
        </div>
      ) : (
        <div className="mt-4">
          <Button
            variant="primary"
            onClick={() => navigate(`/store/${storeId}/people`)}
          >
            {t("dashboard.review_applications")}
          </Button>
        </div>
      )}
    </Card>
  );
}
