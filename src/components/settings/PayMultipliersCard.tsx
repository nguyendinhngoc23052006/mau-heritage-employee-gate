import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { errorMessage } from "../../lib/errorMessage";
import { useT } from "../../lib/i18n";
import {
  deletePayMultiplier,
  listPayMultipliers,
  upsertPayMultiplier,
} from "../../services/payMultipliers";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Card, CardTitle } from "../ui/Card";
import { Dialog } from "../ui/Dialog";
import { EmptyState } from "../ui/EmptyState";
import { Input, Label } from "../ui/Input";

interface PayMultipliersCardProps {
  storeId: string;
}

export function PayMultipliersCard({ storeId }: PayMultipliersCardProps) {
  const t = useT();
  const queryClient = useQueryClient();

  // Form state for adding/updating
  const [date, setDate] = useState("");
  const [multiplier, setMultiplier] = useState("1.0");
  const [reason, setReason] = useState("");
  const [confirmDate, setConfirmDate] = useState<string | null>(null);

  // Fetch existing multipliers
  const { data: multipliers = [] } = useQuery({
    queryKey: ["pay-multipliers", storeId],
    queryFn: () => listPayMultipliers(storeId),
  });

  // Upsert mutation
  const upsertMutation = useMutation({
    mutationFn: () =>
      upsertPayMultiplier({
        storeId,
        date,
        multiplier: Number.parseFloat(multiplier),
        reason: reason.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["pay-multipliers", storeId],
      });
      setDate("");
      setMultiplier("1.0");
      setReason("");
      setConfirmDate(null);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deletePayMultiplier,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["pay-multipliers", storeId],
      });
    },
  });

  const handleAddClick = () => {
    const existing = multipliers.find((m) => m.date === date);
    if (existing) {
      setConfirmDate(date);
    } else {
      upsertMutation.mutate();
    }
  };

  const handleConfirmOverwrite = () => {
    setConfirmDate(null);
    upsertMutation.mutate();
  };

  // Role gating is handled by parent SettingsPage.tsx
  // This component renders only when user has manager+ role
  return (
    <Card>
      <CardTitle>{t("settings.multipliers.title")}</CardTitle>
      <p className="text-sm text-slate-600 mb-4">
        {t("settings.multipliers.hint")}
      </p>

      {/* Existing multipliers table */}
      {multipliers.length === 0 ? (
        <EmptyState>{t("settings.multipliers.empty")}</EmptyState>
      ) : (
        <div className="mb-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 px-2 font-semibold text-slate-700">
                  {t("settings.multipliers.date")}
                </th>
                <th className="text-left py-2 px-2 font-semibold text-slate-700">
                  {t("settings.multipliers.multiplier")}
                </th>
                <th className="text-left py-2 px-2 font-semibold text-slate-700">
                  {t("settings.multipliers.reason")}
                </th>
                <th className="text-right py-2 px-2 font-semibold text-slate-700">
                  {t("common.action")}
                </th>
              </tr>
            </thead>
            <tbody>
              {multipliers.map((m) => (
                <tr
                  key={m.id}
                  className="border-b border-slate-100 hover:bg-slate-50"
                >
                  <td className="py-2 px-2 text-slate-900">
                    {new Date(m.date).toLocaleDateString()}
                  </td>
                  <td className="py-2 px-2 text-slate-900 font-semibold">
                    ×{m.multiplier}
                  </td>
                  <td className="py-2 px-2 text-slate-600">
                    {m.reason || "—"}
                  </td>
                  <td className="py-2 px-2 text-right">
                    <Button
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(m.id)}
                      disabled={deleteMutation.isPending}
                      className="text-xs text-red-600 hover:text-red-700"
                    >
                      {t("common.delete")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/update form */}
      <div className="space-y-4 border-t border-slate-200 pt-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="mult-date">{t("settings.multipliers.date")}</Label>
            <Input
              id="mult-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={upsertMutation.isPending}
            />
          </div>
          <div>
            <Label htmlFor="mult-value">
              {t("settings.multipliers.multiplier")}
            </Label>
            <Input
              id="mult-value"
              type="number"
              step="0.5"
              min="0.5"
              max="5"
              value={multiplier}
              onChange={(e) => setMultiplier(e.target.value)}
              disabled={upsertMutation.isPending}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="mult-reason">
            {t("settings.multipliers.reason")}
          </Label>
          <Input
            id="mult-reason"
            type="text"
            placeholder={t("settings.multipliers.reason_placeholder")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={upsertMutation.isPending}
          />
        </div>

        {upsertMutation.error && (
          <Alert variant="error">{errorMessage(upsertMutation.error)}</Alert>
        )}

        {deleteMutation.error && (
          <Alert variant="error">{errorMessage(deleteMutation.error)}</Alert>
        )}

        <Button
          onClick={handleAddClick}
          disabled={!date || upsertMutation.isPending}
          className="w-full"
        >
          {upsertMutation.isPending
            ? t("common.loading")
            : t("settings.multipliers.add")}
        </Button>
      </div>

      {/* Overwrite confirmation dialog */}
      <Dialog
        open={confirmDate !== null}
        onClose={() => setConfirmDate(null)}
        title={t("settings.multipliers.overwrite_confirm")}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setConfirmDate(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleConfirmOverwrite}
              disabled={upsertMutation.isPending}
            >
              {upsertMutation.isPending
                ? t("common.loading")
                : t("common.confirm")}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-700">
          {t("settings.multipliers.overwrite_warning")}
        </p>
      </Dialog>
    </Card>
  );
}
