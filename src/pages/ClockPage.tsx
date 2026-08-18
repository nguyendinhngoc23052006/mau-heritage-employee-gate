import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/ui/EmptyState";
import { useSession } from "../hooks/useSession";
import { errorMessage } from "../lib/errorMessage";
import { type GeolocationError, getCurrentCoords } from "../lib/geolocation";
import { useT } from "../lib/i18n";
import {
  clockInAt,
  clockOutAt,
  getCurrentClockState,
  listMyClockEvents,
} from "../services/clock";
import { getStore } from "../services/stores";

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
  const [locError, setLocError] = useState<string | null>(null);

  const { data: store } = useQuery({
    queryKey: ["store", storeId],
    enabled: ready,
    queryFn: () => getStore(storeId as string),
  });

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

  async function withCoords<T>(
    op: (loc: { lat?: number; lng?: number; accuracyM?: number }) => Promise<T>,
  ): Promise<T> {
    setLocError(null);
    const geofenceActive = Boolean(store?.lat && store?.lng);
    if (!geofenceActive) return op({});
    try {
      const c = await getCurrentCoords();
      return await op({ lat: c.lat, lng: c.lng, accuracyM: c.accuracyM });
    } catch (e) {
      const gerr = e as GeolocationError;
      if (store?.require_geofence) {
        setLocError(
          gerr.kind === "denied"
            ? t("geofence.denied")
            : gerr.kind === "unsupported"
              ? t("geofence.unsupported")
              : t("geofence.unavailable"),
        );
        throw e;
      }
      // fence configured but not enforced — proceed without coords
      return op({});
    }
  }

  const clockInMutation = useMutation({
    mutationFn: () => withCoords((loc) => clockInAt(storeId as string, loc)),
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
    mutationFn: () => withCoords((loc) => clockOutAt(storeId as string, loc)),
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
  const geofenceOn = Boolean(store?.lat && store?.lng);
  const enforced = Boolean(store?.require_geofence);
  const mutError = clockInMutation.error ?? clockOutMutation.error;

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold font-display text-brand-ink">
        {t("clock.title")}
      </h1>

      {geofenceOn && (
        <div className="mb-4 text-xs text-slate-600">
          {enforced ? t("geofence.enforced_on") : t("geofence.stamped_only")}
        </div>
      )}

      {locError && (
        <Alert variant="error" className="mb-4">
          {locError}
        </Alert>
      )}
      {mutError && !locError && (
        <Alert variant="error" className="mb-4">
          {errorMessage(mutError)}
        </Alert>
      )}

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
              {clockOutMutation.isPending
                ? t("common.loading")
                : t("clock.out")}
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
              {clockInMutation.isPending ? t("common.loading") : t("clock.in")}
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
                  <th className="px-4 py-2 text-left text-slate-600">
                    {t("clock.location_col")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr
                    key={event.id}
                    className="border-b border-slate-100 hover:bg-brand-cream-light"
                  >
                    <td className="px-4 py-2 text-slate-900">
                      {format(new Date(event.at), "yyyy-MM-dd HH:mm")}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {event.kind === "in"
                        ? t("clock.history_in")
                        : t("clock.history_out")}
                      {event.source === "auto" && (
                        <span className="ml-1 text-xs text-orange-700">
                          {t("clock.history_auto")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {event.distance_m == null
                        ? "—"
                        : event.location_verified === false
                          ? t("clock.history_loc_miss", {
                              m: Math.round(event.distance_m),
                            })
                          : t("clock.history_loc_ok")}
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
