import { useT } from "../../lib/i18n";
import type { ShiftSlot } from "../../types/database";
import { Button } from "../ui/Button";

interface Props {
  slots: ShiftSlot[];
  shiftClaimOpen: boolean;
  currentUserId: string | null;
  memberNames: Record<string, string>;
  onClaim: (slotId: string) => void;
  onRelease: (slotId: string) => void;
  claimingSlotId?: string;
}

export function SlotGrid({
  slots,
  shiftClaimOpen,
  currentUserId,
  memberNames,
  onClaim,
  onRelease,
  claimingSlotId,
}: Props) {
  const t = useT();

  const filled = slots.filter((s) => s.claimed_by).length;
  const total = slots.length;

  const isWithinReleaseWindow = (claimedAt: string | null): boolean => {
    if (!claimedAt) return false;
    const claimedTime = new Date(claimedAt);
    const now = new Date();
    const diffMs = now.getTime() - claimedTime.getTime();
    const diffMinutes = diffMs / (1000 * 60);
    return diffMinutes <= 5;
  };

  return (
    <div className="space-y-2">
      <div className="text-sm text-slate-600">
        {t("schedule.slot_fill_indicator", { filled, total })}
      </div>
      <div className="flex flex-wrap gap-2">
        {slots.map((slot) => {
          const isMine = slot.claimed_by === currentUserId;
          const withinReleaseWindow =
            isMine && isWithinReleaseWindow(slot.claimed_at);

          if (slot.claimed_by === null) {
            if (shiftClaimOpen) {
              return (
                <button
                  key={slot.id}
                  onClick={() => onClaim(slot.id)}
                  disabled={claimingSlotId === slot.id}
                  className="px-3 py-1 rounded bg-brand-navy text-white text-sm font-medium hover:bg-brand-navy/90 disabled:opacity-50"
                >
                  {t("schedule.slot_open")}
                </button>
              );
            } else {
              return (
                <div
                  key={slot.id}
                  title={t("schedule.slot_closed_hint")}
                  className="px-3 py-1 rounded bg-slate-200 text-slate-600 text-sm font-medium"
                >
                  {t("schedule.slot_closed")}
                </div>
              );
            }
          }

          if (isMine) {
            return (
              <div
                key={slot.id}
                className="px-3 py-1 rounded bg-green-100 text-green-900 text-sm font-medium flex items-center gap-2"
              >
                <span>{t("schedule.slot_mine")}</span>
                {withinReleaseWindow && (
                  <Button
                    onClick={() => onRelease(slot.id)}
                    disabled={claimingSlotId === slot.id}
                    variant="secondary"
                    className="px-2 py-0 text-xs h-auto"
                  >
                    {t("schedule.slot_release")}
                  </Button>
                )}
                {!withinReleaseWindow && (
                  <span
                    title={t("schedule.slot_release_window_hint")}
                    className="text-xs opacity-60"
                  >
                    {t("schedule.slot_release_expired")}
                  </span>
                )}
              </div>
            );
          }

          return (
            <div
              key={slot.id}
              className="px-3 py-1 rounded bg-slate-200 text-slate-700 text-sm font-medium"
            >
              {memberNames[slot.claimed_by] || slot.claimed_by?.substring(0, 8)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
