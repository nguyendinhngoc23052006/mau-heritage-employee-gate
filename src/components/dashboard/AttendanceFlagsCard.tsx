import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { errorMessage } from "../../lib/errorMessage";
import { useT } from "../../lib/i18n";
import {
  autoClockoutStale,
  listAttendanceFlags,
  resolveAttendanceFlag,
} from "../../services/attendance";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Card, CardTitle } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";

export function AttendanceFlagsCard({ storeId }: { storeId: string }) {
  const t = useT();
  const qc = useQueryClient();

  const { data: flags, isLoading } = useQuery({
    queryKey: ["attendance_flags", storeId],
    queryFn: () => listAttendanceFlags(storeId),
  });

  const sweep = useMutation({
    mutationFn: () => autoClockoutStale(storeId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["attendance_flags", storeId] }),
  });

  const resolve = useMutation({
    mutationFn: (id: string) => resolveAttendanceFlag(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["attendance_flags", storeId] }),
  });

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <CardTitle>{t("attendance_flags.title")}</CardTitle>
        <Button
          variant="secondary"
          onClick={() => sweep.mutate()}
          disabled={sweep.isPending}
          className="text-xs"
        >
          {sweep.isPending
            ? t("common.loading")
            : t("attendance_flags.sweep_now")}
        </Button>
      </div>
      {sweep.isSuccess && sweep.data > 0 && (
        <Alert variant="info" className="mb-2">
          {t("attendance_flags.sweep_closed", { n: sweep.data })}
        </Alert>
      )}
      {sweep.isSuccess && sweep.data === 0 && (
        <Alert variant="info" className="mb-2">
          {t("attendance_flags.sweep_nothing")}
        </Alert>
      )}
      {sweep.error && (
        <Alert variant="error" className="mb-2">
          {errorMessage(sweep.error)}
        </Alert>
      )}
      {isLoading ? (
        <p className="text-sm text-slate-500">{t("common.loading")}</p>
      ) : !flags || flags.length === 0 ? (
        <EmptyState>{t("attendance_flags.none")}</EmptyState>
      ) : (
        <ul className="space-y-2">
          {flags.map((f) => {
            const detail = f.detail as Record<string, unknown>;
            return (
              <li
                key={f.id}
                className="border-t border-slate-200 pt-2 first:border-0 first:pt-0"
              >
                <div className="text-sm font-semibold text-slate-800">
                  {f.user_display_name || f.user_id.slice(0, 8)}
                </div>
                <div className="text-xs text-slate-600">
                  {f.kind === "auto_clockout"
                    ? t("attendance_flags.kind_auto")
                    : t("attendance_flags.kind_miss")}{" "}
                  · {format(new Date(f.created_at), "yyyy-MM-dd HH:mm")}
                </div>
                <div className="text-xs text-slate-500">
                  {f.kind === "auto_clockout"
                    ? t("attendance_flags.detail_auto", {
                        in: String(detail.in_at ?? ""),
                        out: String(detail.out_at ?? ""),
                      })
                    : t("attendance_flags.detail_miss", {
                        m: Math.round(Number(detail.distance_m) || 0),
                        r: Number(detail.radius_m) || 0,
                      })}
                </div>
                <div className="mt-1">
                  <Button
                    variant="secondary"
                    className="text-xs"
                    onClick={() => resolve.mutate(f.id)}
                    disabled={resolve.isPending}
                  >
                    {t("attendance_flags.resolve")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
