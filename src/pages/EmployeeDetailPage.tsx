import { useQuery } from "@tanstack/react-query";
import type { JSX } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/ui/EmptyState";
import { isManagerRole, useRoleOn } from "../hooks/useMemberships";
import { errorMessage } from "../lib/errorMessage";
import { useT } from "../lib/i18n";
import { formatVnd } from "../lib/money";
import { getSupabase } from "../lib/supabaseClient";
import { listAttendanceFlags } from "../services/attendance";
import { listMyClockEvents } from "../services/clock";
import { listMembers } from "../services/members";
import { listStorePrizeFine } from "../services/points";
import type { RateHistory, Shift } from "../types/database";

export function EmployeeDetailPage(): JSX.Element {
  const t = useT();
  const { storeId, userId } = useParams<{ storeId: string; userId: string }>();
  const role = useRoleOn(storeId);
  const canView = isManagerRole(role);

  const membersQuery = useQuery({
    queryKey: ["members", storeId],
    queryFn: () => (storeId ? listMembers(storeId) : Promise.resolve([])),
    enabled: !!storeId && canView,
  });

  const clockQuery = useQuery({
    queryKey: ["clock_events", storeId, userId],
    queryFn: async () => {
      if (!storeId || !userId || !canView) return [];
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const from = thirtyDaysAgo.toISOString();
      return listMyClockEvents(userId, storeId, { from });
    },
    enabled: !!storeId && !!userId && canView,
  });

  const shiftsQuery = useQuery({
    queryKey: ["shifts", storeId, userId],
    queryFn: async () => {
      if (!storeId || !userId || !canView) return [];
      const supabase = getSupabase();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const from = thirtyDaysAgo.toISOString();

      // Find shifts where this user has claimed a slot
      const { data: claims, error: claimError } = await supabase
        .from("shift_slots")
        .select("shift_id")
        .eq("claimed_by", userId)
        .gte("claimed_at", from);
      if (claimError) throw claimError;

      if (!claims || claims.length === 0) return [];
      const shiftIds = claims.map((c) => c.shift_id as string);

      const { data: shifts, error: shiftError } = await supabase
        .from("shifts")
        .select("*")
        .in("id", shiftIds)
        .eq("store_id", storeId)
        .order("starts_at", { ascending: false });
      if (shiftError) throw shiftError;
      return (shifts ?? []) as Shift[];
    },
    enabled: !!storeId && !!userId && canView,
  });

  const prizeFineQuery = useQuery({
    queryKey: ["prize_fine", storeId],
    queryFn: () =>
      storeId ? listStorePrizeFine(storeId) : Promise.resolve([]),
    enabled: !!storeId && canView,
  });

  const rateHistoryQuery = useQuery({
    queryKey: ["rate_history", storeId, userId],
    queryFn: async () => {
      if (!storeId || !userId || !canView) return [];
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("rate_history")
        .select("*")
        .eq("store_id", storeId)
        .eq("user_id", userId)
        .order("effective_from", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RateHistory[];
    },
    enabled: !!storeId && !!userId && canView,
  });

  const attendanceQuery = useQuery({
    queryKey: ["attendance_flags", storeId],
    queryFn: () =>
      storeId ? listAttendanceFlags(storeId) : Promise.resolve([]),
    enabled: !!storeId && canView,
  });

  // Gate: access denied for non-managers
  if (!canView) {
    return <ErrorState message={t("employee_detail.access_denied")} />;
  }

  if (
    membersQuery.isLoading ||
    clockQuery.isLoading ||
    shiftsQuery.isLoading ||
    prizeFineQuery.isLoading ||
    rateHistoryQuery.isLoading ||
    attendanceQuery.isLoading
  ) {
    return <LoadingState>{t("common.loading")}</LoadingState>;
  }

  if (membersQuery.error) {
    return (
      <ErrorState
        message={errorMessage(membersQuery.error, t("common.error_loading"))}
      />
    );
  }

  const members = membersQuery.data ?? [];
  const member = members.find((m) => m.user_id === userId);

  if (!member) {
    return <ErrorState message={t("employee_detail.not_found")} />;
  }

  const clockEvents = clockQuery.data ?? [];
  const shifts = shiftsQuery.data ?? [];
  const allPrizeFine = prizeFineQuery.data ?? [];
  const userPrizeFine = allPrizeFine.filter((pf) => pf.user_id === userId);
  const rateHistory = rateHistoryQuery.data ?? [];
  const allAttendanceFlags = attendanceQuery.data ?? [];
  const userAttendanceFlags = allAttendanceFlags.filter(
    (af) => af.user_id === userId,
  );

  const displayName =
    member.profile?.display_name || member.user_id?.substring(0, 8) || "—";
  const currentRate = member.hourly_rate_cents
    ? formatVnd(member.hourly_rate_cents * 100)
    : "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{displayName}</h1>
          <div className="text-sm text-slate-600 mt-1">
            <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium mr-2">
              {t(`people.role_${member.role}`)}
            </span>
            <span className="text-slate-700">
              {t("employee_detail.current_rate")}: {currentRate}
            </span>
          </div>
        </div>
        {storeId && (
          <Link to={`/store/${storeId}/people`}>
            <Button variant="secondary" className="text-xs">
              {t("employee_detail.back_to_people")}
            </Button>
          </Link>
        )}
      </div>

      {/* Recent Clock Events */}
      <Card>
        <CardTitle>{t("employee_detail.recent_clock_events")}</CardTitle>
        {clockEvents.length === 0 ? (
          <EmptyState>{t("employee_detail.no_clock_events")}</EmptyState>
        ) : (
          <div className="space-y-2">
            {clockEvents.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 text-sm"
              >
                <div className="flex-1">
                  <div className="font-medium text-slate-900">
                    {event.kind === "in"
                      ? t("employee_detail.clock_in")
                      : t("employee_detail.clock_out")}
                  </div>
                  <div className="text-xs text-slate-500">
                    {t("employee_detail.time")}:{" "}
                    {new Date(event.at).toLocaleString()}
                  </div>
                  {event.lat && event.lng && (
                    <div className="text-xs text-slate-500">
                      {t("employee_detail.location")}: {event.lat.toFixed(4)},{" "}
                      {event.lng.toFixed(4)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Recent Shifts */}
      <Card>
        <CardTitle>{t("employee_detail.recent_shifts")}</CardTitle>
        {shifts.length === 0 ? (
          <EmptyState>{t("employee_detail.no_shifts")}</EmptyState>
        ) : (
          <div className="space-y-2">
            {shifts.map((shift) => (
              <div
                key={shift.id}
                className="border-l-4 border-blue-200 bg-blue-50 p-3 rounded text-sm"
              >
                <div className="font-medium text-slate-900">
                  {t("employee_detail.shift")}
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  {t("employee_detail.starts")}:{" "}
                  {new Date(shift.starts_at).toLocaleString()}
                </div>
                <div className="text-xs text-slate-600">
                  {t("employee_detail.ends")}:{" "}
                  {new Date(shift.ends_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Prize/Fine History */}
      <Card>
        <CardTitle>{t("employee_detail.prize_fine_history")}</CardTitle>
        {userPrizeFine.length === 0 ? (
          <EmptyState>{t("employee_detail.no_prize_fine")}</EmptyState>
        ) : (
          <div className="space-y-2">
            {userPrizeFine.map((pf) => (
              <div
                key={pf.id}
                className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 text-sm"
              >
                <div className="flex-1">
                  <div className="font-medium text-slate-900">
                    {pf.kind === "prize" ? "Prize" : "Fine"}
                  </div>
                  <div className="text-xs text-slate-500">
                    {pf.reason || "—"}
                  </div>
                  <div className="text-xs text-slate-500">
                    {t("common.status")}: {pf.status}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">
                    {formatVnd(pf.amount_cents * 100)}
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(pf.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Rate History */}
      <Card>
        <CardTitle>{t("employee_detail.rate_history")}</CardTitle>
        {rateHistory.length === 0 ? (
          <EmptyState>{t("employee_detail.no_rate_history")}</EmptyState>
        ) : (
          <div className="space-y-2">
            {rateHistory.map((rh) => (
              <div
                key={rh.id}
                className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 text-sm"
              >
                <div className="flex-1">
                  <div className="font-medium text-slate-900">
                    {t("employee_detail.rate")}:{" "}
                    {formatVnd(rh.hourly_rate_cents * 100)}
                  </div>
                  <div className="text-xs text-slate-500">
                    {t("employee_detail.effective_from")}:{" "}
                    {new Date(rh.effective_from).toLocaleDateString()}
                  </div>
                  {rh.effective_to && (
                    <div className="text-xs text-slate-500">
                      {t("employee_detail.effective_to")}:{" "}
                      {new Date(rh.effective_to).toLocaleDateString()}
                    </div>
                  )}
                  {rh.changed_by && (
                    <div className="text-xs text-slate-500">
                      {t("employee_detail.changed_by")}:{" "}
                      {rh.changed_by.substring(0, 8)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Attendance Flags */}
      <Card>
        <CardTitle>{t("employee_detail.attendance_flags")}</CardTitle>
        {userAttendanceFlags.length === 0 ? (
          <EmptyState>{t("employee_detail.no_flags")}</EmptyState>
        ) : (
          <div className="space-y-2">
            {userAttendanceFlags.map((flag) => (
              <div
                key={flag.id}
                className="border-l-4 border-yellow-200 bg-yellow-50 p-3 rounded text-sm"
              >
                <div className="font-medium text-slate-900">{flag.kind}</div>
                <div className="text-xs text-slate-600 mt-1">
                  {t("common.created")}:{" "}
                  {new Date(flag.created_at).toLocaleString()}
                </div>
                {flag.resolved_at && (
                  <div className="text-xs text-slate-600">
                    {t("common.resolved")}:{" "}
                    {new Date(flag.resolved_at).toLocaleString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
