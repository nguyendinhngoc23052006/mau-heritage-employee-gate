import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { errorMessage } from "../../lib/errorMessage";
import { useT } from "../../lib/i18n";
import { getStore, setStoreVarianceThreshold } from "../../services/stores";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Card, CardTitle } from "../ui/Card";
import { Input, Label } from "../ui/Input";

export function VarianceThresholdCard({ storeId }: { storeId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const { data: store } = useQuery({
    queryKey: ["store", storeId],
    queryFn: () => getStore(storeId),
  });
  const [pct, setPct] = useState("5");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (store) setPct(String(store.variance_threshold_pct ?? 5));
  }, [store]);

  const save = useMutation({
    mutationFn: () =>
      setStoreVarianceThreshold({
        storeId,
        pct: Math.min(100, Math.max(0, Number(pct) || 0)),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store", storeId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  return (
    <Card>
      <CardTitle>{t("settings.variance.title")}</CardTitle>
      <p className="mb-3 text-sm text-slate-600">
        {t("settings.variance.hint")}
      </p>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <Label htmlFor="vt-pct">{t("settings.variance.pct")}</Label>
          <Input
            id="vt-pct"
            value={pct}
            onChange={(e) =>
              setPct(e.target.value.replace(/\D/g, "").slice(0, 3))
            }
            inputMode="numeric"
          />
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? t("common.loading") : t("common.save")}
        </Button>
      </div>
      {save.error && (
        <Alert variant="error" className="mt-2">
          {errorMessage(save.error)}
        </Alert>
      )}
      {saved && (
        <Alert variant="success" className="mt-2">
          {t("profile.saved")}
        </Alert>
      )}
    </Card>
  );
}
