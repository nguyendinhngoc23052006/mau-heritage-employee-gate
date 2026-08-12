import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import { ErrorState, LoadingState } from "../components/ui/EmptyState";
import { Input, Label } from "../components/ui/Input";
import { isManagerRole, useRoleOn } from "../hooks/useMemberships";
import { useT } from "../lib/i18n";
import { getStore, updateStore } from "../services/stores";

export function SettingsPage() {
  const t = useT();
  const { storeId } = useParams<{ storeId: string }>();
  const queryClient = useQueryClient();
  const role = useRoleOn(storeId);
  const canEdit = isManagerRole(role);

  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [currency, setCurrency] = useState("");
  const [saved, setSaved] = useState(false);

  const {
    data: store,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["store", storeId],
    queryFn: () => (storeId ? getStore(storeId) : Promise.resolve(null)),
    enabled: !!storeId,
  });

  const updateMutation = useMutation({
    mutationFn: (updates: Parameters<typeof updateStore>[1]) =>
      storeId ? updateStore(storeId, updates) : Promise.resolve(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store", storeId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  if (isLoading) {
    return <LoadingState>{t("common.loading")}</LoadingState>;
  }

  if (error) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : "Error loading store"}
      />
    );
  }

  if (store && name === "") {
    setName(store.name);
    setTimezone(store.timezone);
    setCurrency(store.currency);
  }

  function handleSave() {
    updateMutation.mutate({ name, timezone, currency });
  }

  return (
    <div className="max-w-md">
      <Card>
        <CardTitle>{t("store.settings.title")}</CardTitle>
        <div className="space-y-4">
          <div>
            <Label htmlFor="store-name">{t("store.settings.name")}</Label>
            <Input
              id="store-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canEdit || updateMutation.isPending}
            />
          </div>

          <div>
            <Label htmlFor="timezone">{t("store.settings.timezone")}</Label>
            <Input
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled={!canEdit || updateMutation.isPending}
              placeholder="Asia/Ho_Chi_Minh"
            />
          </div>

          <div>
            <Label htmlFor="currency">{t("store.settings.currency")}</Label>
            <Input
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              disabled={!canEdit || updateMutation.isPending}
              placeholder="VND"
            />
          </div>

          {updateMutation.error && (
            <ErrorState
              message={
                updateMutation.error instanceof Error
                  ? updateMutation.error.message
                  : "Failed to save settings"
              }
            />
          )}

          {saved && (
            <div className="text-sm text-green-600">{t("profile.saved")}</div>
          )}

          <Button
            onClick={handleSave}
            disabled={!canEdit || updateMutation.isPending}
            className="w-full"
          >
            {updateMutation.isPending ? t("common.loading") : t("common.save")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
