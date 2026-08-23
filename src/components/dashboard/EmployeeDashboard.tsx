import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../hooks/useSession";
import { useT } from "../../lib/i18n";
import { getSupabase } from "../../lib/supabaseClient";
import { listAnnouncements } from "../../services/announcements";
import { listMyNotifications } from "../../services/notifications";
import { getMyBalance, listMyPrizeFine } from "../../services/points";
import { listShifts } from "../../services/shifts";
import { listSlotsForShifts } from "../../services/shiftSlots";
import { Card, CardTitle } from "../ui/Card";
import { EmptyState, LoadingState } from "../ui/EmptyState";
import type { Announcement, Shift } from "../../types/database";
import { NextShiftCard } from "./NextShiftCard";
import { UnpaidPrizeFineCard } from "./UnpaidPrizeFineCard";

interface EmployeeDashboardProps {
  storeId: string;
}

export function EmployeeDashboard({ storeId }: EmployeeDashboardProps) {
  const t = useT();
  const { user } = useSession();
  const userId = user?.id;
  const ready = Boolean(storeId && userId);

  // Announcements
  const { data: announcements } = useQuery({
    queryKey: ["announcements", storeId, "latest"],
    enabled: ready,
    queryFn: () =>
      listAnnouncements(storeId, { activeOnly: true }).then((items) =>
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
    queryFn: () => getMyBalance(storeId),
  });

  // Unpaid fines
  const { data: unorderedFines, isLoading: finesLoading } = useQuery({
    queryKey: ["my-fines", storeId, userId],
    enabled: ready,
    queryFn: () =>
      listMyPrizeFine(storeId, 100).then((items) =>
        items.filter((f) => f.kind === "fine" && f.status === "pending"),
      ),
  });

  // Upcoming shifts count
  const { data: upcomingShiftsCount, isLoading: shiftsLoading } = useQuery({
    queryKey: ["shifts", storeId, "upcoming-count"],
    enabled: ready,
    queryFn: async () => {
      const sevenDaysFromNow = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const shifts = await listShifts(storeId, {
        from: new Date().toISOString(),
        to: sevenDaysFromNow,
      });
      if (shifts.length === 0) return 0;

      const slotIds = shifts.map((s) => s.id);
      const slots = await listSlotsForShifts(slotIds);

      return slots.filter((slot) => slot.claimed_by === userId).length;
    },
  });

  const isLoading =
    notificationsLoading || pointsLoading || finesLoading || shiftsLoading;

  if (isLoading) {
    return <LoadingState>{t("common.loading")}</LoadingState>;
  }

  const unreadCount = notifications?.filter((n) => !n.read_at).length ?? 0;
  const unpaidFinesAmount = (unorderedFines ?? []).reduce(
    (sum, f) => sum + (f.amount_cents || 0),
    0,
  );

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {/* Points Balance */}
        <Card className="text-center">
          <div className="text-sm text-slate-600">
            {t("dashboard.points_balance")}
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {pointBalance ?? 0}
          </div>
        </Card>

        {/* Unread Notifications */}
        <Card className="text-center">
          <div className="text-sm text-slate-600">
            {t("notifications.title")}
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {unreadCount}
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

      {/* Next Shift */}
      <NextShiftCard storeId={storeId} />

      {/* Unpaid Fines */}
      <UnpaidPrizeFineCard storeId={storeId} isOwner={false} isEmployee />

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
