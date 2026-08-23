import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

import { Card, CardTitle } from "../components/ui/Card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/ui/EmptyState";
import { useSession } from "../hooks/useSession";
import { useT } from "../lib/i18n";
import { formatVnd } from "../lib/money";
import { listAttendanceFlags } from "../services/attendance";
import { listMyClockEvents } from "../services/clock";
import { listMySales } from "../services/sales";

export function MyHistoryPage() {
  const t = useT();
  const { user } = useSession();
  const { storeId } = useParams<{ storeId: string }>();

  const ready = Boolean(user?.id && storeId);

  const from = new Date();
  from.setDate(from.getDate() - 30);

  const { data: clockEvents, isLoading: clockLoading } = useQuery({
    queryKey: ["my-clock-events", user?.id, storeId],
    queryFn: () =>
      listMyClockEvents(user?.id as string, storeId as string, {
        from: from.toISOString(),
      }),
    enabled: ready,
  });

  const { data: attendanceFlags, isLoading: flagsLoading } = useQuery({
    queryKey: ["attendance-flags", storeId],
    queryFn: () =>
      listAttendanceFlags(storeId as string, { includeResolved: true }),
    enabled: ready,
  });

  const { data: salesReports, isLoading: salesLoading } = useQuery({
    queryKey: ["my-sales", user?.id, storeId],
    queryFn: () =>
      listMySales(user?.id as string, storeId as string, { limit: 50 }),
    enabled: ready,
  });

  const myAttendanceFlags = attendanceFlags?.filter(
    (f) => f.user_id === user?.id,
  );

  const isLoading = clockLoading || flagsLoading || salesLoading;

  if (!ready) {
    return <ErrorState message={t("common.error_generic")} />;
  }

  if (isLoading) {
    return <LoadingState>{t("common.loading")}</LoadingState>;
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold font-display text-brand-ink">
        {t("my_history.title")}
      </h1>

      {clockEvents && clockEvents.length > 0 && (
        <Card>
          <CardTitle>{t("my_history.past_shifts_title")}</CardTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-brand-cream-light">
                <tr>
                  <th className="text-left px-4 py-2">
                    {t("my_history.date_col")}
                  </th>
                  <th className="text-left px-4 py-2">
                    {t("my_history.in_time_col")}
                  </th>
                  <th className="text-left px-4 py-2">
                    {t("my_history.out_time_col")}
                  </th>
                  <th className="text-right px-4 py-2">
                    {t("my_history.hours_col")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {clockEvents.map((event) => {
                  const date = new Date(event.at).toLocaleDateString("sv-SE");
                  const time = new Date(event.at).toLocaleTimeString("vi-VN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <tr
                      key={event.id}
                      className="border-b hover:bg-brand-cream-light"
                    >
                      <td className="px-4 py-2">{date}</td>
                      <td className="px-4 py-2">
                        {event.kind === "in" ? time : "—"}
                      </td>
                      <td className="px-4 py-2">
                        {event.kind === "out" ? time : "—"}
                      </td>
                      <td className="text-right px-4 py-2">
                        {event.kind === "in" ? "—" : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {myAttendanceFlags && myAttendanceFlags.length > 0 && (
        <Card>
          <CardTitle>{t("my_history.attendance_flags_title")}</CardTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-brand-cream-light">
                <tr>
                  <th className="text-left px-4 py-2">
                    {t("my_history.kind_col")}
                  </th>
                  <th className="text-left px-4 py-2">
                    {t("my_history.detail_col")}
                  </th>
                  <th className="text-left px-4 py-2">
                    {t("my_history.created_col")}
                  </th>
                  <th className="text-left px-4 py-2">
                    {t("my_history.resolved_col")}
                  </th>
                  <th className="text-left px-4 py-2">
                    {t("my_history.note_col")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {myAttendanceFlags.map((flag) => (
                  <tr
                    key={flag.id}
                    className="border-b hover:bg-brand-cream-light"
                  >
                    <td className="px-4 py-2">
                      {flag.kind === "auto_clockout"
                        ? t("my_history.flag_auto_clockout")
                        : flag.kind === "geofence_miss"
                          ? t("my_history.flag_geofence_miss")
                          : flag.kind}
                    </td>
                    <td className="px-4 py-2">
                      {typeof flag.detail === "object" && flag.detail !== null
                        ? JSON.stringify(flag.detail)
                        : String(flag.detail || "")}
                    </td>
                    <td className="px-4 py-2">
                      {new Date(flag.created_at).toLocaleDateString("sv-SE")}
                    </td>
                    <td className="px-4 py-2">
                      {flag.resolved_at
                        ? new Date(flag.resolved_at).toLocaleDateString("sv-SE")
                        : t("common.pending")}
                    </td>
                    <td className="px-4 py-2">
                      {flag.resolution_note || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {salesReports && salesReports.length > 0 && (
        <Card>
          <CardTitle>{t("my_history.sales_title")}</CardTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-brand-cream-light">
                <tr>
                  <th className="text-left px-4 py-2">
                    {t("my_history.submitted_date_col")}
                  </th>
                  <th className="text-right px-4 py-2">
                    {t("my_history.cash_col")}
                  </th>
                  <th className="text-right px-4 py-2">
                    {t("my_history.card_col")}
                  </th>
                  <th className="text-right px-4 py-2">
                    {t("my_history.qr_col")}
                  </th>
                  <th className="text-right px-4 py-2">
                    {t("my_history.total_col")}
                  </th>
                  <th className="text-left px-4 py-2">
                    {t("my_history.status_col")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {salesReports.map((report) => (
                  <tr
                    key={report.id}
                    className="border-b hover:bg-brand-cream-light"
                  >
                    <td className="px-4 py-2">
                      {new Date(report.submitted_at).toLocaleDateString("sv-SE")}
                    </td>
                    <td className="text-right px-4 py-2">
                      {formatVnd(report.cash_cents)}
                    </td>
                    <td className="text-right px-4 py-2">
                      {formatVnd(report.card_cents)}
                    </td>
                    <td className="text-right px-4 py-2">
                      {formatVnd(report.qr_cents)}
                    </td>
                    <td className="text-right px-4 py-2 font-semibold">
                      {formatVnd(
                        report.cash_cents +
                          report.card_cents +
                          report.qr_cents,
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${
                          report.status === "pending"
                            ? "bg-yellow-100 text-yellow-800"
                            : report.status === "approved"
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {report.status === "pending"
                          ? t("common.pending")
                          : report.status === "approved"
                            ? t("my_history.status_approved")
                            : report.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!clockEvents?.length &&
        !myAttendanceFlags?.length &&
        !salesReports?.length && <EmptyState>{t("common.empty")}</EmptyState>}
    </div>
  );
}
