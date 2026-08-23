import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { errorMessage } from "../../lib/errorMessage";
import { useT } from "../../lib/i18n";
import { disputePrizeFine } from "../../services/points";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Label, Textarea } from "../ui/Input";

interface DisputePrizeFineDialogProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  onSuccess: () => void;
}

export function DisputePrizeFineDialog({
  open,
  onClose,
  eventId,
  onSuccess,
}: DisputePrizeFineDialogProps) {
  const t = useT();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (reason.trim().length < 10) {
        throw new Error("Reason must be at least 10 characters");
      }
      return disputePrizeFine(eventId, reason.trim());
    },
    onSuccess: () => {
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

  const canSubmit = reason.trim().length >= 10 && !mutation.isPending;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={t("my_fines.dispute_title")}
      footer={
        <>
          <Button onClick={handleClose} variant="secondary">
            {t("common.cancel")}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit}>
            {mutation.isPending ? t("common.loading") : t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        <div>
          <Label htmlFor="dispute-reason">
            {t("my_fines.dispute_reason_label")}
          </Label>
          <Textarea
            id="dispute-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("my_fines.dispute_reason_placeholder")}
            className="mt-1"
          />
          <p className="text-xs text-gray-500 mt-1">
            {t("my_fines.dispute_reason_hint", {
              count: Math.max(0, 10 - reason.length),
            })}
          </p>
        </div>
      </div>
    </Dialog>
  );
}
