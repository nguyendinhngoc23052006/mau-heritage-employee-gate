import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { RequestCorrectionDialog } from "../components/clock/RequestCorrectionDialog";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/ui/EmptyState";
import {
  isManagerRole,
  useMemberships,
  useRoleOn,
} from "../hooks/useMemberships";
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
import { listMyCorrectionRequests } from "../services/clockCorrections";
import { getStore } from "../services/stores";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const GEOFENCE_ERROR_RE =
  /outside store geofence \(distance (\d+)m > radius (\d+)m\)/;

function clockErrorMessage(
  err: unknown,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const raw = errorMessage(err);
  const match = raw.match(GEOFENCE_ERROR_RE);
  if (match) {
    return t("geofence.outside_radius", {
      distance: match[1],
      radius: match[2],
    });
  }
  return raw;
}

export function ClockPage() {
  const t = useT();
  const { storeId } = useParams<{ storeId: string }>();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const userId = user?.id;
  const ready = Boolean(storeId && userId);
  const [locError, setLocError] = useState<string | null>(null);
  const [locErrorDenied, setLocErrorDenied] = useState(false);
  const [correctionDialogOpen, setCorrectionDialogOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedKind, setSelectedKind] = useState<
    "missing_in" | "missing_out" | "wrong_time" | undefined
  >(undefined);
  const role = useRoleOn(storeId);
  const isManager = isManagerRole(role);
  const { isLoading: membershipsLoading } = useMemberships();

  const { data: store, isLoading: storeLoading } = useQuery({
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

  const { data: myCorrections, isLoading: correctionsLoading } = useQuery({
    queryKey: ["clock", "corrections", "my", storeId],
    enabled: ready,
    queryFn: () => listMyCorrectionRequests(storeId as string),
  });

  async function withCoords<T>(
    op: (loc: { lat?: number; lng?: number; accuracyM?: number }) => Promise<T>,
  ): Promise<T> {
    setLocError(null);
    setLocErrorDenied(false);
    const geofenceActive =
      store != null && store.lat != null && store.lng != null;
    if (!geofenceActive) return op({});
    try {
      const c = await getCurrentCoords();
      return await op({ lat: c.lat, lng: c.lng, accuracyM: c.accuracyM });
    } catch (e) {
      const gerr = e as GeolocationError;
      if (store?.require_geofence) {
        setLocErrorDenied(gerr.kind === "denied");
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

  function openCorrectionDialog(
    eventId?: string,
    kind: "missing_in" | "missing_out" | "wrong_time" = "missing_in",
  ) {
    setSelectedEventId(eventId ?? null);
    setSelectedKind(kind);
    setCorrectionDialogOpen(true);
  }

  function closeCorrectionDialog() {
    setCorrectionDialogOpen(false);
    setSelectedEventId(null);
    setSelectedKind(undefined);
  }

  if (!ready)
    return (
      <ErrorState
        message={t("common.error", { message: "Not authenticated" })}
      />
    );

  if (
    stateLoading ||
    eventsLoading ||
    storeLoading ||
    membershipsLoading ||
    correctionsLoading
  )
    return <LoadingState>{t("common.loading")}</LoadingState>;

  const isClockedIn = clockState === "in";
  const lastInEvent = events?.find((e) => e.kind === "in");
  const geofenceOn = store != null && store.lat != null && store.lng != null;
  const enforced = Boolean(store?.require_geofence);
  const mutError = clockInMutation.error ?? clockOutMutation.error;

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold font-display text-brand-ink">
        {t("clock.title")}
      </h1>

      <div className="mb-4 text-xs text-slate-600">
        {geofenceOn ? (
          enforced ? (
            t("geofence.enforced_on")
          ) : (
            t("geofence.stamped_only")
          )
        ) : isManager ? (
          <span>
            {t("geofence.not_configured")}{" "}
            <Link to={`/store/${storeId}/settings`} className="underline">
              {t("geofence.go_to_settings")}
            </Link>
          </span>
        ) : (
          <span>{t("geofence.not_configured_employee")}</span>
        )}
      </div>

      {locError && (
        <div className="mb-4">
          <Alert variant="error">{locError}</Alert>
          {locErrorDenied && (
            <p className="mt-1 text-xs text-slate-500">
              {t("geofence.denied_hint")}
            </p>
          )}
        </div>
      )}
      {mutError && !locError && (
        <Alert variant="error" className="mb-4">
          {clockErrorMessage(mutError, t)}
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

        <div className="mt-4 mb-4 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            className="text-xs px-2 py-1"
            onClick={() => openCorrectionDialog(undefined, "missing_in")}
          >
            {t("clock.request_correction")}
          </Button>
          {isManager && (
            <Link to={`/store/${storeId}/clock/corrections`}>
              <Button variant="secondary" className="text-xs px-2 py-1">
                {t("clock.view_corrections")}
              </Button>
            </Link>
          )}
        </div>

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
                  <th className="px-4 py-2 text-left text-slate-600">
                    {t("common.actions")}
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
                    <td className="px-4 py-2">
                      <Button
                        variant="ghost"
                        className="text-xs px-2 py-1"
                        onClick={() =>
                          openCorrectionDialog(event.id, "wrong_time")
                        }
                      >
                        {t("clock.fix_time")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {myCorrections && myCorrections.length > 0 && (
        <Card className="mt-6">
          <CardTitle>{t("clock.my_corrections_title")}</CardTitle>
          <div className="mt-4 space-y-2">
            {myCorrections.map((correction) => (
              <div
                key={correction.id}
                className="rounded border border-slate-200 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-600">
                      {correction.kind === "missing_in"
                        ? t("clock.correction_missing_in")
                        : correction.kind === "missing_out"
                          ? t("clock.correction_missing_out")
                          : t("clock.correction_wrong_time")}{" "}
                      •{" "}
                      {format(
                        new Date(correction.created_at),
                        "yyyy-MM-dd HH:mm",
                      )}
                    </p>
                    <p className="text-xs text-slate-700 mt-1 line-clamp-2">
                      {correction.reason}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                          correction.status === "approved"
                            ? "bg-green-100 text-green-800"
                            : correction.status === "denied"
                              ? "bg-red-100 text-red-800"
                              : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {correction.status === "approved"
                          ? t("clock.status_approved")
                          : correction.status === "denied"
                            ? t("clock.status_denied")
                            : t("clock.status_pending")}
                      </span>
                      {correction.review_note && (
                        <span className="text-xs text-slate-600">
                          {correction.review_note}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <RequestCorrectionDialog
        open={correctionDialogOpen}
        onClose={closeCorrectionDialog}
        storeId={storeId as string}
        clockEventId={selectedEventId}
        defaultKind={selectedKind}
      />
    </div>
  );
}
