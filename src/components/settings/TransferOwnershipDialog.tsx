import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { JSX } from "react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { errorMessage } from "../../lib/errorMessage";
import { useT } from "../../lib/i18n";
import { listMembers } from "../../services/members";
import { transferOwnership } from "../../services/ownership";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { EmptyState } from "../ui/EmptyState";
import { Label } from "../ui/Input";
import { Select } from "../ui/Select";

interface TransferOwnershipDialogProps {
  open: boolean;
  onClose: () => void;
}

export function TransferOwnershipDialog({
  open,
  onClose,
}: TransferOwnershipDialogProps): JSX.Element {
  const t = useT();
  const { storeId } = useParams<{ storeId: string }>();
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState("");

  const membersQuery = useQuery({
    queryKey: ["members", storeId],
    queryFn: () => (storeId ? listMembers(storeId) : Promise.resolve([])),
    enabled: !!storeId && open,
  });

  const transferMutation = useMutation({
    mutationFn: () =>
      transferOwnership({
        toUserId: selectedUserId,
        storeId: storeId!,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memberships", "mine"] });
      queryClient.invalidateQueries({ queryKey: ["members", storeId] });
      setSelectedUserId("");
      onClose();
    },
  });

  const members = membersQuery.data ?? [];
  const managers = members.filter((m) => m.role === "manager" && m.active);

  const managerOptions = managers.map((m) => ({
    value: m.user_id,
    label: m.profile?.display_name || m.user_id?.substring(0, 8) || "—",
  }));

  const handleConfirm = () => {
    if (selectedUserId) {
      transferMutation.mutate();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("transfer_ownership.title")}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={transferMutation.isPending}
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedUserId || transferMutation.isPending}
          >
            {transferMutation.isPending
              ? t("transfer_ownership.transferring")
              : t("transfer_ownership.confirm")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          {t("transfer_ownership.description")}
        </p>

        {managers.length === 0 ? (
          <EmptyState>{t("transfer_ownership.no_managers")}</EmptyState>
        ) : (
          <div>
            <Label htmlFor="select-manager">
              {t("transfer_ownership.select_manager")}
            </Label>
            <Select
              id="select-manager"
              value={selectedUserId}
              onChange={(v: string) => setSelectedUserId(v)}
              options={managerOptions}
              disabled={transferMutation.isPending}
              ariaLabel={t("transfer_ownership.select_manager")}
            />
          </div>
        )}

        <Alert variant="warning">{t("transfer_ownership.warning")}</Alert>

        {transferMutation.error && (
          <Alert variant="error">
            {errorMessage(
              transferMutation.error,
              t("common.error"),
            )}
          </Alert>
        )}
      </div>
    </Dialog>
  );
}
