import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../hooks/useSession";
import { useT } from "../../lib/i18n";
import { listSlotsForShifts } from "../../services/shiftSlots";
import { listShifts } from "../../services/shifts";
import { Card, CardTitle } from "../ui/Card";
import { EmptyState, LoadingState } from "../ui/EmptyState";

interface NextShiftCardProps {
  storeId: string;
}

export function NextShiftCard({ storeId }: NextShiftCardProps) {
  const t = useT();
  const { user } = useSession();
  const userId = user?.id;
  const ready = Boolean(storeId && userId);

  const { data, isLoading } = useQuery({
    queryKey: ["next-shift", storeId, userId],
    enabled: ready,
    queryFn: async () => {
      const now = new Date().toISOString();
      const thirtyDaysLater = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const shifts = await listShifts(storeId, {
        from: now,
        to: thirtyDaysLater,
      });
      if (shifts.length === 0) return null;

      const slots = await listSlotsForShifts(shifts.map((s) => s.id));
      const mySlots = slots.filter((slot) => slot.claimed_by === userId);

      if (mySlots.length === 0) return null;

      const myShiftIds = new Set(mySlots.map((s) => s.shift_id));
      const nextShift = shifts.find((s) => myShiftIds.has(s.id));

      return nextShift ?? null;
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardTitle>{t("dashboard.next_shift")}</CardTitle>
        <LoadingState>{t("common.loading")}</LoadingState>
      </Card>
    );
  }

  const shift = data;

  return (
    <Card>
      <CardTitle>{t("dashboard.next_shift")}</CardTitle>
      {!shift ? (
        <EmptyState>{t("dashboard.no_upcoming_shifts")}</EmptyState>
      ) : (
        <div className="mt-4 space-y-2">
          <div className="text-sm font-semibold text-slate-900">
            {new Date(shift.starts_at).toLocaleDateString([], {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </div>
          <div className="text-lg font-semibold text-brand-ink">
            {new Date(shift.starts_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            –{" "}
            {new Date(shift.ends_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
          {shift.notes && (
            <div className="text-xs text-slate-600">{shift.notes}</div>
          )}
        </div>
      )}
    </Card>
  );
}
