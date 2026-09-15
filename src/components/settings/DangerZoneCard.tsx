import type { JSX } from "react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useStoreAccess } from "../../hooks/useStoreAccess";
import { useT } from "../../lib/i18n";
import { Button } from "../ui/Button";
import { Card, CardTitle } from "../ui/Card";
import { DeleteStoreDialog } from "./DeleteStoreDialog";

// Deleting a store is for whoever sits above it: tier 1, the sector's
// director, or the legacy owner of a detached store.
export function DangerZoneCard(): JSX.Element | null {
  const t = useT();
  const { storeId } = useParams<{ storeId: string }>();
  const { role, isOverseer } = useStoreAccess(storeId);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  if (!isOverseer && role !== "owner") {
    return null;
  }

  return (
    <>
      <Card className="border-red-200 bg-red-50">
        <CardTitle className="text-red-900">{t("danger_zone.title")}</CardTitle>
        <p className="text-sm text-red-700 mb-4">
          {t("danger_zone.owner_only")}
        </p>
        <Button
          variant="danger"
          onClick={() => setShowDeleteDialog(true)}
          className="w-full"
        >
          {t("danger_zone.delete_store")}
        </Button>
      </Card>

      <DeleteStoreDialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
      />
    </>
  );
}
