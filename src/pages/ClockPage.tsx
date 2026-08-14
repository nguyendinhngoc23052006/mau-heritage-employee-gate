import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/ui/EmptyState";
import { useSession } from "../hooks/useSession";
import { useT } from "../lib/i18n";
import {
  clockIn,
  clockOut,
  getCurrentClockState,
  listMyClockEvents,
} from "../services/clock";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ClockPage() {
  const t = useT();
  const { storeId } = useParams<{ storeId: string }>();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const userId = user?.id;
  const ready = Boolean(storeId && userId);

  const { data: clockState, isLoading: stateLoading } = useQuery({
    queryKey: ["clock", "state", userId, storeId],
    enabled: ready,
    queryFn: () => getCurrentClockState(userId as string, storeId as string),
  });

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ["clock", "events", userId, storeId],
    enabled: ready,
    queryFn: () => {
      const from = new Date();
      from.setDate(from.getDate() - 30);
      return listMyClockEvents(userId as string, storeId as string, {
        from: from.toISOString(),
      });
    },
  });

  const clockInMutation = useMutation({
    mutationFn: () => clockIn(storeId as string),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["clock", "state", userId, storeId],
      });
      queryClient.invalidateQueries({
        queryKey: ["clock", "events", userId, storeId],
      });
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: () => clockOut(storeId as string),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["clock", "state", userId, storeId],
      });
      queryClient.invalidateQueries({
        queryKey: ["clock", "events", userId, storeId],
      });
    },
  });

  if (!ready)
    return (
      <ErrorState
        message={t("common.error", { message: "Not authenticated" })}
      />
    );

  if (stateLoading || eventsLoading)
    return <LoadingState>{t("common.loading")}</LoadingState>;

  const isClockedIn = clockState === "in";
  const lastInEvent = events?.find((e) => e.kind === "in");

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold">{t("clock.title")}</h1>

      <Card className="mb-6">
        {isClockedIn && lastInEvent ? (
          <div className="space-y-4">
            <div className="text-sm text-slate-600">
              {t("clock.status_in", { when: formatTime(lastInEvent.at) })}
            </div>
            <Button
              onClick={() => clockOutMutation.mutate()}
              disabled={clockOutMutation.isPending}
              variant="danger"
              className="w-full py-6 text-lg"
            >
              {t("clock.out")}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-slate-600">
              {t("clock.status_out")}
            </div>
            <Button
              onClick={() => clockInMutation.mutate()}
              disabled={clockInMutation.isPending}
              variant="primary"
              className="w-full py-6 text-lg"
            >
              {t("clock.in")}
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>{t("clock.history_title")}</CardTitle>
        {!events || events.length === 0 ? (
          <EmptyState>{t("clock.history_empty")}</EmptyState>
        ) : (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-2 text-left text-slate-600">
                    {t("audit.at")}
                  </th>
                  <th className="px-4 py-2 text-left text-slate-600">
                    {t("audit.action")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr
                    key={event.id}
                    className="border-b border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-2 text-slate-900">
                      {format(new Date(event.at), "yyyy-MM-dd HH:mm")}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {event.kind === "in"
                        ? t("clock.history_in")
                        : t("clock.history_out")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
