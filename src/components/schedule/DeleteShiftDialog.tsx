import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { errorMessage } from "../../lib/errorMessage";
import { useT } from "../../lib/i18n";
import { deleteShiftSafe } from "../../services/shifts";
import type { Shift, ShiftSlot } from "../../types/database";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Label, Textarea } from "../ui/Input";

interface DeleteShiftDialogProps {
  open: boolean;
  onClose: () => void;
  shift: Shift;
  slots: ShiftSlot[];
  storeId: string;
  weekStart: string;
  weekEnd: string;
}

export function DeleteShiftDialog({
  open,
  onClose,
  shift,
  slots,
  storeId,
  weekStart,
  weekEnd,
}: DeleteShiftDialogProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");

  const claimedCount = slots.filter((s) => s.claimed_by).length;
  const reasonRequired = claimedCount > 0;

  const mutation = useMutation({
    mutationFn: async () => {
      return deleteShiftSafe(shift.id, reasonRequired ? reason : undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["shifts", storeId, weekStart, weekEnd],
      });
      queryClient.invalidateQueries({
        queryKey: ["shift_slots", storeId, weekStart, weekEnd],
      });
      setReason("");
      onClose();
    },
  });

  const canSubmit =
    !mutation.isPending && (!reasonRequired || reason.trim().length > 0);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("schedule.delete_shift_title")}
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
            {mutation.isPending ? t("common.loading") : t("common.confirm")}
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

        <p className="text-sm text-brand-ink">
          {t("schedule.delete_shift_confirm")}
        </p>

        {reasonRequired && (
          <Alert variant="warning">
            {t("schedule.delete_shift_with_claims", { count: claimedCount })}
          </Alert>
        )}

        {reasonRequired && (
          <div>
            <Label htmlFor="delete-reason">
              {t("schedule.delete_shift_reason")}
            </Label>
            <Textarea
              id="delete-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("common.optional")}
              rows={3}
            />
          </div>
        )}

        {!reasonRequired && (
          <p className="text-xs text-brand-muted">
            {t("schedule.delete_shift_irreversible")}
          </p>
        )}
      </div>
    </Dialog>
  );
}
