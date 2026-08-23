import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { EmployeeDashboard } from "../components/dashboard/EmployeeDashboard";
import { ManagerDashboard } from "../components/dashboard/ManagerDashboard";
import { OwnerDashboard } from "../components/dashboard/OwnerDashboard";
import { Alert } from "../components/ui/Alert";
import { ErrorState, LoadingState } from "../components/ui/EmptyState";
import { isManagerRole, isOwnerRole, useRoleOn } from "../hooks/useMemberships";
import { useSession } from "../hooks/useSession";
import { useT } from "../lib/i18n";
import { getTodayMultiplier } from "../services/payMultipliers";

export function DashboardPage() {
  const t = useT();
  const { storeId } = useParams<{ storeId: string }>();
  const { user } = useSession();
  const userId = user?.id;
  const ready = Boolean(storeId && userId);
  const role = useRoleOn(storeId);
  const isOwner = isOwnerRole(role);
  const isManager = isManagerRole(role);

  // Today's pay multiplier (shown for all roles)
  const { data: todayMultiplier } = useQuery({
    queryKey: ["multiplier", "today", storeId],
    queryFn: () =>
      storeId ? getTodayMultiplier(storeId) : Promise.resolve(null),
    enabled: !!storeId,
  });

  if (!ready) {
    return <ErrorState message={t("dashboard.store_or_user_not_found")} />;
  }

  if (!role) {
    return <LoadingState>{t("common.loading")}</LoadingState>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold font-display text-brand-ink">
        {t("nav.dashboard")}
      </h1>

      {todayMultiplier && (
        <Alert variant="info">
          {t("dashboard.today_multiplier", {
            multiplier: todayMultiplier.multiplier,
            reason: todayMultiplier.reason ?? "",
          })}
        </Alert>
      )}

      {isOwner && storeId && <OwnerDashboard storeId={storeId} />}
      {isManager && !isOwner && storeId && (
        <ManagerDashboard storeId={storeId} />
      )}
      {!isManager && storeId && <EmployeeDashboard storeId={storeId} />}
    </div>
  );
}
