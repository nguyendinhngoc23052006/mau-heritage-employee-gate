import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { errorMessage } from "../../lib/errorMessage";
import { useT } from "../../lib/i18n";
import { cancelPrizeFine } from "../../services/points";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Label, Textarea } from "../ui/Input";

interface CancelPrizeFineDialogProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  storeId: string;
  onSuccess: () => void;
}

export function CancelPrizeFineDialog({
  open,
  onClose,
  eventId,
  storeId,
  onSuccess,
}: CancelPrizeFineDialogProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!reason.trim()) throw new Error("Reason required");
      return cancelPrizeFine(eventId, reason.trim());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["store-prize-fine", storeId],
      });
      queryClient.invalidateQueries({ queryKey: ["payroll", storeId] });
      onSuccess();
      handleClose();
    },
    onError: (err: unknown) => {
      setError(errorMessage(err, t("common.error_generic")));
    },
  });

  const handleClose = () => {
    setReason("");
    setError(null);
    onClose();
  };

  const canSubmit = reason.trim().length > 0;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={t("payroll.cancel_prize_fine_title")}
      footer={
        <>
          <Button onClick={handleClose} variant="secondary">
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit || mutation.isPending}
          >
            {mutation.isPending
              ? t("common.loading")
              : t("payroll.confirm_cancel")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        <div>
          <Label>{t("payroll.cancel_reason_label")}</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("payroll.cancel_reason_placeholder")}
            className="mt-1"
          />
        </div>
      </div>
    </Dialog>
  );
}
