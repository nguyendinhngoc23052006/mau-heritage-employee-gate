import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { errorMessage } from "../../lib/errorMessage";
import { useT } from "../../lib/i18n";
import { updateShiftSafe } from "../../services/shifts";
import type { Shift, ShiftSlot } from "../../types/database";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Input, Label, Textarea } from "../ui/Input";

interface EditShiftDialogProps {
  open: boolean;
  onClose: () => void;
  shift: Shift;
  slots: ShiftSlot[];
  storeId: string;
  weekStart: string;
  weekEnd: string;
}

function localDatetimeValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = d.getUTCFullYear();
  const month = pad(d.getUTCMonth() + 1);
  const date = pad(d.getUTCDate());
  const hour = pad(d.getUTCHours());
  const minute = pad(d.getUTCMinutes());
  return `${year}-${month}-${date}T${hour}:${minute}`;
}

function parseDatetimeToISO(value: string): string {
  if (!value) return "";
  const [datePart, timePart] = value.split("T");
  return `${datePart}T${timePart}:00+07:00`;
}

export function EditShiftDialog({
  open,
  onClose,
  shift,
  slots,
  storeId,
  weekStart,
  weekEnd,
}: EditShiftDialogProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const [startsAt, setStartsAt] = useState(
    localDatetimeValue(shift.starts_at),
  );
  const [endsAt, setEndsAt] = useState(localDatetimeValue(shift.ends_at));
  const [notes, setNotes] = useState(shift.notes || "");
  const [slotCount, setSlotCount] = useState(String(shift.slot_count));

  const claimedCount = useMemo(
    () => slots.filter((s) => s.claimed_by).length,
    [slots],
  );

  const startsAtISO = parseDatetimeToISO(startsAt);
  const endsAtISO = parseDatetimeToISO(endsAt);
  const slotCountNum = Number.parseInt(slotCount, 10);

  const now = new Date();
  const isPastShift = shift.starts_at <= now.toISOString();
  const hasTimeError = startsAt && endsAt && startsAtISO >= endsAtISO;
  const hasSlotError =
    !Number.isNaN(slotCountNum) && slotCountNum < claimedCount;

  const mutation = useMutation({
    mutationFn: async () => {
      return updateShiftSafe({
        shiftId: shift.id,
        startsAt: startsAtISO !== shift.starts_at ? startsAtISO : undefined,
        endsAt: endsAtISO !== shift.ends_at ? endsAtISO : undefined,
        notes: notes !== (shift.notes || "") ? notes || undefined : undefined,
        slotCount:
          slotCountNum !== shift.slot_count ? slotCountNum : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["shifts", storeId, weekStart, weekEnd],
      });
      queryClient.invalidateQueries({
        queryKey: ["shift_slots", storeId, weekStart, weekEnd],
      });
      onClose();
    },
  });

  const canSubmit =
    !mutation.isPending &&
    !isPastShift &&
    !hasTimeError &&
    !hasSlotError &&
    startsAt &&
    endsAt &&
    !Number.isNaN(slotCountNum) &&
    (startsAtISO !== shift.starts_at ||
      endsAtISO !== shift.ends_at ||
      notes !== (shift.notes || "") ||
      slotCountNum !== shift.slot_count);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("schedule.edit_shift_title")}
      footer={
        <div className="flex gap-2">
          <Button onClick={onClose} variant="secondary">
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit}
            variant="primary"
          >
            {mutation.isPending ? t("common.loading") : t("common.save")}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {mutation.error && (
          <Alert variant="error">
            {errorMessage(mutation.error, t("common.error_generic"))}
          </Alert>
        )}

        {isPastShift && (
          <Alert variant="error">{t("schedule.edit_shift_past_error")}</Alert>
        )}

        <div>
          <Label htmlFor="edit-starts-at">
            {t("schedule.edit_shift_start")}
          </Label>
          <Input
            id="edit-starts-at"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            disabled={isPastShift}
          />
        </div>

        <div>
          <Label htmlFor="edit-ends-at">{t("schedule.edit_shift_end")}</Label>
          <Input
            id="edit-ends-at"
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            disabled={isPastShift}
          />
          {hasTimeError && (
            <p className="text-xs text-red-600 mt-1">
              {t("schedule.edit_shift_invalid_time")}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="edit-notes">{t("schedule.edit_shift_notes")}</Label>
          <Textarea
            id="edit-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("common.optional")}
            rows={2}
            disabled={isPastShift}
          />
        </div>

        <div>
          <Label htmlFor="edit-slot-count">
            {t("schedule.edit_shift_slots")}
          </Label>
          <Input
            id="edit-slot-count"
            type="number"
            min="1"
            max="20"
            value={slotCount}
            onChange={(e) => setSlotCount(e.target.value)}
            disabled={isPastShift}
          />
          {claimedCount > 0 && (
            <p className="text-xs text-brand-muted mt-1">
              {t("schedule.edit_shift_claimed", { count: claimedCount })}
            </p>
          )}
          {hasSlotError && (
            <p className="text-xs text-red-600 mt-1">
              {t("schedule.edit_shift_cannot_shrink", { min: claimedCount })}
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
