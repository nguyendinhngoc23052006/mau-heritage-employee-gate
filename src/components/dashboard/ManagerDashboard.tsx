import { useQuery } from "@tanstack/react-query";
import { useT } from "../../lib/i18n";
import { listAnnouncements } from "../../services/announcements";
import type { Announcement } from "../../types/database";
import { Card, CardTitle } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { AttendanceFlagsCard } from "./AttendanceFlagsCard";
import { CoverageGapsCard } from "./CoverageGapsCard";
import { PendingApplicationsCard } from "./PendingApplicationsCard";
import { PendingSwapsCard } from "./PendingSwapsCard";
import { UnpaidPrizeFineCard } from "./UnpaidPrizeFineCard";

interface ManagerDashboardProps {
  storeId: string;
}

export function ManagerDashboard({ storeId }: ManagerDashboardProps) {
  const t = useT();

  // Announcements
  const { data: announcements } = useQuery({
    queryKey: ["announcements", storeId, "latest"],
    queryFn: () =>
      listAnnouncements(storeId, { activeOnly: true }).then((items) =>
        items.slice(0, 3),
      ),
  });

  return (
    <div className="space-y-6">
      {/* Coverage & Fines */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <CoverageGapsCard storeId={storeId} />
        <UnpaidPrizeFineCard storeId={storeId} isOwner={false} />
      </div>

      {/* Attendance Flags */}
      <AttendanceFlagsCard storeId={storeId} />

      {/* Pending Swaps */}
      <PendingSwapsCard storeId={storeId} />

      {/* Pending Applications */}
      <PendingApplicationsCard storeId={storeId} />

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
