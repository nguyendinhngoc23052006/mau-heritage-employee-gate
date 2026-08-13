import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import { ErrorState, LoadingState } from "../components/ui/EmptyState";
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

  if (!storeId || !user)
    return (
      <ErrorState
        message={t("common.error", { message: "Not authenticated" })}
      />
    );

  const { data: clockState, isLoading: stateLoading } = useQuery({
    queryKey: ["clock", "state", user.id, storeId],
    queryFn: () => getCurrentClockState(user.id, storeId),
  });

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ["clock", "events", user.id, storeId],
    queryFn: () => {
      const today = new Date().toISOString().split("T")[0];
      return listMyClockEvents(user.id, storeId, {
        from: `${today}T00:00:00Z`,
      });
    },
  });

  const clockInMutation = useMutation({
    mutationFn: () => clockIn(storeId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["clock", "state", user.id, storeId],
      });
      queryClient.invalidateQueries({
        queryKey: ["clock", "events", user.id, storeId],
      });
    },
  });

  const clockOutMutation = useMutation({
    mutationFn: () => clockOut(storeId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["clock", "state", user.id, storeId],
      });
      queryClient.invalidateQueries({
        queryKey: ["clock", "events", user.id, storeId],
      });
    },
  });

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

      {events && events.length > 0 && (
        <div>
          <CardTitle>{t("schedule.title")}'s times</CardTitle>
          <div className="space-y-2">
            {events.map((event) => (
              <Card key={event.id} className="text-sm">
                <div className="flex items-center justify-between">
                  <span className={event.kind === "in" ? "font-semibold" : ""}>
                    {event.kind === "in" ? t("clock.in") : t("clock.out")}
                  </span>
                  <span>{formatTime(event.at)}</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
