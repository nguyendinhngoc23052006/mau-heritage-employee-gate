import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { errorMessage } from "../../lib/errorMessage";
import { useT } from "../../lib/i18n";
import { parseVndToCents } from "../../lib/money";
import { listMembers } from "../../services/members";
import { issuePrizeFine } from "../../services/points";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Input, Label, Textarea } from "../ui/Input";
import { Select } from "../ui/Select";

interface IssuePrizeFineModalProps {
  open: boolean;
  onClose: () => void;
  storeId: string;
  preselectedUserId?: string;
  onSuccess: () => void;
}

export function IssuePrizeFineModal({
  open,
  onClose,
  storeId,
  preselectedUserId,
  onSuccess,
}: IssuePrizeFineModalProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState(preselectedUserId || "");
  const [kind, setKind] = useState<"prize" | "fine">("prize");
  const [amountVnd, setAmountVnd] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const membersQuery = useQuery({
    queryKey: ["members", storeId],
    queryFn: () => listMembers(storeId),
    enabled: open && !!storeId,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedUserId) throw new Error("User required");
      const amountCents = parseVndToCents(amountVnd);
      if (amountCents === null || amountCents <= 0)
        throw new Error("Invalid amount");
      if (!reason.trim()) throw new Error("Reason required");

      return issuePrizeFine({
        storeId,
        userId: selectedUserId,
        kind,
        amountCents,
        reason: reason.trim(),
      });
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
    setSelectedUserId(preselectedUserId || "");
    setKind("prize");
    setAmountVnd("");
    setReason("");
    setError(null);
    onClose();
  };

  const memberOptions = (membersQuery.data || []).map((m) => ({
    value: m.user_id,
    label: m.profile?.display_name || m.user_id.substring(0, 8),
  }));

  const amountCents = parseVndToCents(amountVnd);
  const canSubmit =
    selectedUserId &&
    amountVnd &&
    amountCents !== null &&
    amountCents > 0 &&
    reason.trim().length > 0;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={t("payroll.issue_prize_fine_title")}
      footer={
        <>
          <Button onClick={handleClose} variant="secondary">
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit || mutation.isPending}
          >
            {mutation.isPending ? t("common.loading") : t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        {!preselectedUserId && (
          <div>
            <Label>{t("payroll.member_label")}</Label>
            <Select
              value={selectedUserId}
              onChange={setSelectedUserId}
              options={memberOptions}
              placeholder={t("common.select_placeholder")}
              searchable
              disabled={membersQuery.isLoading}
              className="mt-1"
            />
          </div>
        )}

        <div>
          <Label>{t("payroll.kind_label")}</Label>
          <div className="mt-2 space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="kind"
                value="prize"
                checked={kind === "prize"}
                onChange={() => setKind("prize")}
              />
              <span className="text-sm">{t("payroll.kind_prize")}</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="kind"
                value="fine"
                checked={kind === "fine"}
                onChange={() => setKind("fine")}
              />
              <span className="text-sm">{t("payroll.kind_fine")}</span>
            </label>
          </div>
        </div>

        <div>
          <Label>{t("payroll.amount_label")}</Label>
          <Input
            type="number"
            value={amountVnd}
            onChange={(e) => setAmountVnd(e.target.value)}
            placeholder="0"
            min="0"
            className="mt-1"
          />
        </div>

        <div>
          <Label>{t("payroll.reason_label")}</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("payroll.reason_placeholder")}
            className="mt-1"
          />
        </div>
      </div>
    </Dialog>
  );
}
