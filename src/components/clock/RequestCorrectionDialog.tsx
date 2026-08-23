import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { errorMessage } from "../../lib/errorMessage";
import { useT } from "../../lib/i18n";
import { requestClockCorrection } from "../../services/clockCorrections";
import type { ClockCorrectionKind } from "../../types/database";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Input, Label, Textarea } from "../ui/Input";
import { Select } from "../ui/Select";

interface RequestCorrectionDialogProps {
  open: boolean;
  onClose: () => void;
  storeId: string;
  clockEventId?: string | null;
  defaultKind?: ClockCorrectionKind;
  onSuccess?: () => void;
}

export function RequestCorrectionDialog({
  open,
  onClose,
  storeId,
  clockEventId,
  defaultKind,
  onSuccess,
}: RequestCorrectionDialogProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<ClockCorrectionKind>(
    defaultKind ?? "missing_in",
  );
  const [reason, setReason] = useState("");
  const [proposedAt, setProposedAt] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      return requestClockCorrection({
        storeId,
        clockEventId,
        kind,
        reason: reason.trim(),
        proposedAt: kind === "wrong_time" ? proposedAt : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["clock", "corrections", "my", storeId],
      });
      setReason("");
      setProposedAt("");
      setKind(defaultKind ?? "missing_in");
      onClose();
      onSuccess?.();
    },
  });

  const canSubmit =
    !mutation.isPending &&
    reason.trim().length >= 10 &&
    (kind !== "wrong_time" || proposedAt.length > 0);

  const kindOptions: Array<{ value: ClockCorrectionKind; label: string }> = [
    { value: "missing_in", label: t("clock.correction_missing_in") },
    { value: "missing_out", label: t("clock.correction_missing_out") },
    { value: "wrong_time", label: t("clock.correction_wrong_time") },
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("clock.correction_dialog_title")}
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
            {mutation.isPending ? t("common.loading") : t("common.submit")}
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

        <div>
          <Label htmlFor="correction-kind">
            {t("clock.correction_kind_label")}
          </Label>
          <Select
            id="correction-kind"
            value={kind}
            onChange={setKind}
            options={kindOptions}
            ariaLabel={t("clock.correction_kind_label")}
          />
        </div>

        <div>
          <Label htmlFor="correction-reason">
            {t("clock.correction_reason_label")}
          </Label>
          <Textarea
            id="correction-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("clock.correction_reason_placeholder")}
            rows={4}
          />
          <p className="mt-1 text-xs text-slate-500">
            {reason.trim().length} / 10 {t("common.characters_min")}
          </p>
        </div>

        {kind === "wrong_time" && (
          <div>
            <Label htmlFor="correction-proposed-at">
              {t("clock.correction_proposed_at_label")}
            </Label>
            <Input
              id="correction-proposed-at"
              type="datetime-local"
              value={proposedAt}
              onChange={(e) => setProposedAt(e.target.value)}
            />
          </div>
        )}
      </div>
    </Dialog>
  );
}
