import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { AttendanceFlagsCard } from "../components/dashboard/AttendanceFlagsCard";
import { Alert } from "../components/ui/Alert";
import { Card, CardTitle } from "../components/ui/Card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/ui/EmptyState";
import { isManagerRole, useRoleOn } from "../hooks/useMemberships";
import { useSession } from "../hooks/useSession";
import { useT } from "../lib/i18n";
import { getSupabase } from "../lib/supabaseClient";
import { listAnnouncements } from "../services/announcements";
import { listMyNotifications } from "../services/notifications";
import { getTodayMultiplier } from "../services/payMultipliers";
import type { Announcement, PointBalance } from "../types/database";

export function DashboardPage() {
  const t = useT();
  const { storeId } = useParams<{ storeId: string }>();
  const { user } = useSession();
  const userId = user?.id;
  const ready = Boolean(storeId && userId);
  const role = useRoleOn(storeId);
  const isManager = isManagerRole(role);

  // Announcements
  const { data: announcements, isLoading: announcementsLoading } = useQuery({
    queryKey: ["announcements", storeId, "latest"],
    enabled: ready,
    queryFn: () =>
      listAnnouncements(storeId as string, { activeOnly: true }).then((items) =>
        items.slice(0, 3),
      ),
  });

  // Notifications
  const { data: notifications, isLoading: notificationsLoading } = useQuery({
    queryKey: ["notifications", "inbox"],
    enabled: ready,
    queryFn: () => listMyNotifications({ unreadOnly: true }),
  });

  // Points balance
  const { data: pointBalance, isLoading: pointsLoading } = useQuery({
    queryKey: ["point-balance", storeId, userId],
    enabled: ready,
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("point_balances")
        .select("*")
        .eq("store_id", storeId as string)
        .eq("user_id", userId as string)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      return (data as PointBalance | null) ?? { balance: 0 };
    },
  });

  // Upcoming shifts (next 7 days)
  const { data: upcomingShiftsCount, isLoading: shiftsLoading } = useQuery({
    queryKey: ["shifts", storeId, "upcoming-count"],
    enabled: ready,
    queryFn: async () => {
      const supabase = getSupabase();
      const sevenDaysFromNow = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const { data, error } = await supabase
        .from("shifts")
        .select("id", { count: "exact" })
        .eq("store_id", storeId as string)
        .eq("status", "open")
        .gt("starts_at", new Date().toISOString())
        .lt("starts_at", sevenDaysFromNow);
      if (error) throw error;
      return data?.length ?? 0;
    },
  });

  // Today's pay multiplier
  const { data: todayMultiplier } = useQuery({
    queryKey: ["multiplier", "today", storeId],
    queryFn: () =>
      storeId ? getTodayMultiplier(storeId) : Promise.resolve(null),
    enabled: !!storeId,
  });

  if (!ready) {
    return <ErrorState message="Store or user not found" />;
  }

  const isLoading =
    announcementsLoading ||
    notificationsLoading ||
    pointsLoading ||
    shiftsLoading;

  if (isLoading) {
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

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {/* Points Balance */}
        <Card className="text-center">
          <div className="text-sm text-slate-600">
            {t("dashboard.points_balance")}
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {pointBalance?.balance ?? 0}
          </div>
        </Card>

        {/* Unread Notifications */}
        <Card className="text-center">
          <div className="text-sm text-slate-600">
            {t("notifications.title")}
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {notifications?.filter((n) => !n.read_at).length ?? 0}
          </div>
        </Card>

        {/* Upcoming Shifts */}
        <Card className="text-center">
          <div className="text-sm text-slate-600">
            {t("dashboard.upcoming_shifts_stat")}
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {upcomingShiftsCount ?? 0}
          </div>
        </Card>

        {/* Total Announcements */}
        <Card className="text-center">
          <div className="text-sm text-slate-600">
            {t("announcements.title")}
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {announcements?.length ?? 0}
          </div>
        </Card>
      </div>

      {isManager && storeId && <AttendanceFlagsCard storeId={storeId} />}

      {/* Latest Announcements */}
      <Card>
        <CardTitle>{t("announcements.title")}</CardTitle>
        {announcements && announcements.length === 0 ? (
          <EmptyState>{t("common.empty")}</EmptyState>
        ) : (
          <div className="mt-4 space-y-3">
            {announcements?.map((announcement: Announcement) => (
              <div
                key={announcement.id}
                className="border-b border-slate-100 pb-3 last:border-0"
              >
                <h3 className="font-semibold text-slate-900">
                  {announcement.title}
                </h3>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                  {announcement.body}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  {new Date(announcement.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
