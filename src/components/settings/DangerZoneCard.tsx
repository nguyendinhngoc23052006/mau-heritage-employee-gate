import type { JSX } from "react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  isOwnerRole,
  useRoleOn,
} from "../../hooks/useMemberships";
import { useT } from "../../lib/i18n";
import { Button } from "../ui/Button";
import { Card, CardTitle } from "../ui/Card";
import { DeleteStoreDialog } from "./DeleteStoreDialog";
import { TransferOwnershipDialog } from "./TransferOwnershipDialog";

export function DangerZoneCard(): JSX.Element | null {
  const t = useT();
  const { storeId } = useParams<{ storeId: string }>();
  const role = useRoleOn(storeId);
  const isOwner = isOwnerRole(role);

  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Only show for owners
  if (!isOwner) {
    return null;
  }

  return (
    <>
      <Card className="border-red-200 bg-red-50">
        <CardTitle className="text-red-900">
          {t("danger_zone.title")}
        </CardTitle>
        <p className="text-sm text-red-700 mb-4">
          {t("danger_zone.owner_only")}
        </p>
        <div className="space-y-2">
          <Button
            variant="danger"
            onClick={() => setShowTransferDialog(true)}
            className="w-full"
          >
            {t("danger_zone.transfer_ownership")}
          </Button>
          <Button
            variant="danger"
            onClick={() => setShowDeleteDialog(true)}
            className="w-full"
          >
            {t("danger_zone.delete_store")}
          </Button>
        </div>
      </Card>

      <TransferOwnershipDialog
        open={showTransferDialog}
        onClose={() => setShowTransferDialog(false)}
      />
      <DeleteStoreDialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
      />
    </>
  );
}
