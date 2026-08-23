import { useQuery } from "@tanstack/react-query";
import { useT } from "../../lib/i18n";
import { listPendingApplications } from "../../services/applications";
import { listInvitesFor } from "../../services/invites";
import { Card, CardTitle } from "../ui/Card";
import { LoadingState } from "../ui/EmptyState";

interface HiringPipelineCardProps {
  storeId: string;
}

export function HiringPipelineCard({ storeId }: HiringPipelineCardProps) {
  const t = useT();

  const { data: applications, isLoading: applicationsLoading } = useQuery({
    queryKey: ["pending-applications", storeId],
    queryFn: () => listPendingApplications(storeId),
  });

  const { data: invites, isLoading: invitesLoading } = useQuery({
    queryKey: ["pending-invites", storeId],
    queryFn: () => listInvitesFor(storeId),
  });

  if (applicationsLoading || invitesLoading) {
    return (
      <Card>
        <CardTitle>{t("dashboard.hiring_pipeline")}</CardTitle>
        <LoadingState>{t("common.loading")}</LoadingState>
      </Card>
    );
  }

  const appCount = applications?.length ?? 0;
  const inviteCount = invites?.length ?? 0;

  return (
    <Card>
      <CardTitle>{t("dashboard.hiring_pipeline")}</CardTitle>
      <div className="mt-4 space-y-3">
        <div className="flex justify-between items-center border-b border-slate-100 pb-2">
          <span className="text-sm text-slate-600">
            {t("dashboard.pending_applications")}
          </span>
          <span className="text-2xl font-semibold text-brand-ink">
            {appCount}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-slate-600">
            {t("dashboard.pending_invites")}
          </span>
          <span className="text-2xl font-semibold text-brand-ink">
            {inviteCount}
          </span>
        </div>
      </div>
    </Card>
  );
}
