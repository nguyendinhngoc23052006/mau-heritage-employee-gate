import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import { Dialog } from "../components/ui/Dialog";
import { ErrorState, LoadingState } from "../components/ui/EmptyState";
import { Input, Label } from "../components/ui/Input";
import { isManagerRole, useRoleOn } from "../hooks/useMemberships";
import { errorMessage } from "../lib/errorMessage";
import { useT } from "../lib/i18n";
import { getStore, regenerateJoinCode, updateStore } from "../services/stores";

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
  const [copiedJoinCode, setCopiedJoinCode] = useState(false);
  const [showRegenDialog, setShowRegenDialog] = useState(false);

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

  const regenerateMutation = useMutation({
    mutationFn: () =>
      storeId ? regenerateJoinCode(storeId) : Promise.resolve(""),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store", storeId] });
    },
  });

  // Populate form once when the store first loads. useEffect avoids the
  // prior "setState during render" bug that caused an inconsistent tree.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only re-sync on store change; `name` intentionally omitted so the form doesn't reset itself while the user is typing
  useEffect(() => {
    if (store && name === "") {
      setName(store.name);
      setTimezone(store.timezone);
      setCurrency(store.currency);
    }
  }, [store]);

  if (isLoading) {
    return <LoadingState>{t("common.loading")}</LoadingState>;
  }

  if (error) {
    return <ErrorState message={errorMessage(error)} />;
  }

  function handleSave() {
    updateMutation.mutate({ name, timezone, currency });
  }

  async function handleCopyJoinCode(code: string) {
    await navigator.clipboard.writeText(code);
    setCopiedJoinCode(true);
    setTimeout(() => setCopiedJoinCode(false), 2000);
  }

  function handleRegenerateJoinCode() {
    setShowRegenDialog(true);
  }

  function confirmRegenerate() {
    setShowRegenDialog(false);
    regenerateMutation.mutate();
  }

  return (
    <div className="max-w-md space-y-6">
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
            <Alert variant="error">{errorMessage(updateMutation.error)}</Alert>
          )}

          {saved && <Alert variant="success">{t("profile.saved")}</Alert>}

          <Button
            onClick={handleSave}
            disabled={!canEdit || updateMutation.isPending}
            className="w-full"
          >
            {updateMutation.isPending ? t("common.loading") : t("common.save")}
          </Button>
        </div>
      </Card>

      {canEdit && (
        <Card>
          <CardTitle>{t("store.settings.join_code_title")}</CardTitle>
          <p className="text-sm text-slate-600 mb-4">
            {t("store.settings.join_code_hint")}
          </p>
          <div className="space-y-4">
            {store?.join_code ? (
              <>
                <div className="flex items-center gap-2">
                  <code className="rounded bg-slate-100 px-3 py-1 font-mono text-sm">
                    {store.join_code}
                  </code>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (store.join_code) handleCopyJoinCode(store.join_code);
                    }}
                    disabled={regenerateMutation.isPending}
                    className="text-xs"
                  >
                    {copiedJoinCode
                      ? t("store.settings.join_code_copied")
                      : t("store.settings.join_code_copy")}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={handleRegenerateJoinCode}
                    disabled={regenerateMutation.isPending}
                    className="text-xs"
                  >
                    {regenerateMutation.isPending
                      ? t("common.loading")
                      : t("store.settings.join_code_regenerate")}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-600">
                  {t("store.settings.join_code_empty")}
                </p>
                <Button
                  onClick={() => regenerateMutation.mutate()}
                  disabled={regenerateMutation.isPending}
                  className="w-full"
                >
                  {regenerateMutation.isPending
                    ? t("common.loading")
                    : t("store.settings.join_code_generate")}
                </Button>
              </>
            )}
            {regenerateMutation.error && (
              <Alert variant="error">
                {errorMessage(regenerateMutation.error)}
              </Alert>
            )}
          </div>
        </Card>
      )}

      <Dialog
        open={showRegenDialog}
        onClose={() => setShowRegenDialog(false)}
        title={t("settings.regen_confirm_title")}
        footer={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setShowRegenDialog(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={confirmRegenerate}
              disabled={regenerateMutation.isPending}
            >
              {regenerateMutation.isPending
                ? t("common.loading")
                : t("store.settings.join_code_regenerate")}
            </Button>
          </div>
        }
      >
        <p>{t("settings.regen_confirm_body")}</p>
      </Dialog>
    </div>
  );
}
