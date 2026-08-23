import { useMutation, useQuery } from "@tanstack/react-query";
import type { JSX } from "react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { errorMessage } from "../../lib/errorMessage";
import { useT } from "../../lib/i18n";
import { deleteStore } from "../../services/ownership";
import { getStore } from "../../services/stores";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Input, Label } from "../ui/Input";

interface DeleteStoreDialogProps {
  open: boolean;
  onClose: () => void;
}

export function DeleteStoreDialog({
  open,
  onClose,
}: DeleteStoreDialogProps): JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const { storeId } = useParams<{ storeId: string }>();
  const [confirmInput, setConfirmInput] = useState("");

  const storeQuery = useQuery({
    queryKey: ["store", storeId],
    queryFn: () => (storeId ? getStore(storeId) : Promise.resolve(null)),
    enabled: !!storeId && open,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteStore(storeId!),
    onSuccess: () => {
      navigate("/onboarding");
    },
  });

  const store = storeQuery.data;
  const isConfirmed =
    store && confirmInput === store.name;

  const handleConfirm = () => {
    if (isConfirmed) {
      deleteMutation.mutate();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("delete_store.title")}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={deleteMutation.isPending}
          >
            {t("common.cancel")}
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            disabled={!isConfirmed || deleteMutation.isPending}
          >
            {deleteMutation.isPending
              ? t("delete_store.deleting")
              : t("delete_store.confirm")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Alert variant="warning">{t("delete_store.warning")}</Alert>

        <p className="text-sm text-slate-600">
          {t("delete_store.description")}
        </p>

        <div>
          <Label htmlFor="confirm-store-name">
            {t("delete_store.store_name")}
          </Label>
          <p className="text-sm text-slate-600 mb-2">
            {store?.name || "—"}
          </p>
          <Input
            id="confirm-store-name"
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            placeholder={store?.name || ""}
            disabled={deleteMutation.isPending}
          />
        </div>

        {deleteMutation.error && (
          <Alert variant="error">
            {errorMessage(
              deleteMutation.error,
              t("common.error"),
            )}
          </Alert>
        )}
      </div>
    </Dialog>
  );
}
